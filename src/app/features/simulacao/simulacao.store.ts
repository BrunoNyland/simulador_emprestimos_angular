import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Decimal, setCasasMonetarias } from '../../core/engine/decimal.config';
import {
  ParametrosSimulacao,
  Parcela,
  Publico,
  SistemaAmortizacao,
  TipoTaxa,
  UnidadeTaxa,
} from '../../core/engine/models';
import { gerarCronogramaPrice } from '../../core/engine/price';
import { gerarCronogramaSac } from '../../core/engine/sac';
import { somarTotais, TotaisCronograma } from '../../core/engine/totais';
import { taxaEfetivaMensal } from '../../core/engine/rates';
import { CampoAlvo, resolverCampoAlvo } from '../../core/engine/solver';
import { diasCorridos } from '../../core/engine/dates';
import { calcularIof } from '../../core/engine/iof';
import {
  EventoCalc,
  LinhaCronograma,
  ParametrosMora,
  projetarComEventos,
  ResumoProjecao,
} from '../../core/engine/eventos';
import { RegulatoryConfigService } from '../../core/config/regulatory-config.service';
import { resolverParametrosIof } from '../../core/products/regulatory-config';
import { CetService, EntradaCet, FluxoSerial, ResultadoCetSerial } from '../../core/cet.service';

export interface MemoriaCalculo {
  iofDiario: string;
  iofAdicional: string;
  engineVersion: string;
  hash: string;
}

export interface ResultadoSimulacao {
  parametros: ParametrosSimulacao;
  parcelaCalculada: string;
  parcelas: Parcela[];
  totais: TotaisCronograma;
  /** Valor liquido liberado (bruto - IOF - tarifa de abertura). */
  valorLiquido: string;
  /** IOF total da operacao. */
  iof: string;
  memoriaCalculo: MemoriaCalculo;
}

/** Resultado da projecao com eventos (tabela separada, abaixo da base). */
export interface ProjecaoEventos {
  parcelas: LinhaCronograma[];
  totais: TotaisCronograma;
  cetMensal: string;
  cetAnual: string;
  resumo: ResumoProjecao;
}

export type EstadoResultado =
  | { tipo: 'ok'; dados: ResultadoSimulacao }
  | { tipo: 'erro'; mensagem: string };

/**
 * Store de simulacao baseado em signals. Orquestra o motor de calculo e
 * recalcula de forma reativa a cada alteracao de parametro.
 */
@Injectable({ providedIn: 'root' })
export class SimulacaoStore {
  private readonly config = inject(RegulatoryConfigService);
  private readonly cetService = inject(CetService);

  // --- Entradas (signals) ---
  readonly sistema = signal<SistemaAmortizacao>('price');
  readonly campoAlvo = signal<CampoAlvo>('parcela');
  readonly valorBruto = signal('10000');
  readonly taxa = signal('0.02');
  readonly tipoTaxa = signal<TipoTaxa>('efetiva');
  readonly unidadeTaxa = signal<UnidadeTaxa>('mensal');
  readonly prazo = signal(12);
  readonly parcela = signal('500');
  readonly dataBase = signal('2026-01-01');

  // --- Custos de abertura (entram no CET) ---
  readonly publico = signal<Publico>('PF');
  readonly produto = signal('credito-pessoal');
  readonly incluirIof = signal(true);
  readonly tarifaAbertura = signal('0');

  readonly moraJurosMensal = signal(this.config.config().mora.jurosMensal);
  readonly moraMulta = signal(this.config.config().mora.multa);

  // --- Eventos pos-simulacao (lista ordenada por DATA; cronograma = projecao dela) ---
  readonly eventos = signal<EventoCalc[]>([]);

  /** Data de referência de um evento (vencimento, no caso da cobrança) p/ ordenar. */
  private dataDoEvento(ev: EventoCalc): string {
    return ev.tipo === 'pagamento' ? ev.dataVencimento : ev.data;
  }

  private ordenar(lista: EventoCalc[]): EventoCalc[] {
    return [...lista].sort((a, b) => this.dataDoEvento(a).localeCompare(this.dataDoEvento(b)));
  }

  adicionarEvento(evento: EventoCalc): void {
    this.eventos.update((lista) => this.ordenar([...lista, evento]));
  }

  removerEvento(indice: number): void {
    this.eventos.update((lista) => lista.filter((_, i) => i !== indice));
  }

  atualizarEvento(indice: number, evento: EventoCalc): void {
    this.eventos.update((lista) => this.ordenar(lista.map((e, i) => (i === indice ? evento : e))));
  }

  limparEventos(): void {
    this.eventos.set([]);
  }

  // --- Resultado reativo (sempre a SIMULACAO BASE, sem eventos) ---
  readonly resultado = computed<EstadoResultado>(() => {
    try {
      return { tipo: 'ok', dados: this.calcularBase() };
    } catch (e) {
      return { tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro de calculo' };
    }
  });

  /**
   * Fluxo serializado do CET base (valor liberado + parcelas datadas/365).
   * É a entrada que o Web Worker consome. `null` quando não há simulação válida.
   */
  readonly cetEntradaBase = computed<EntradaCet | null>(() => {
    if (this.resultado().tipo !== 'ok') return null;
    const ctx = this.contexto();
    return {
      valorLiberado: ctx.valorLiberado.toString(),
      fluxos: ctx.baseParcelas.map((p) => ({
        periodo: new Decimal(diasCorridos(ctx.dataBase, p.dataVencimento)).div(365).toString(),
        valor: new Decimal(p.valorParcela).toString(),
      })),
    };
  });

  /** CET base resolvido pelo worker. `null` = sem simulação válida. */
  private readonly _cetBase = signal<ResultadoCetSerial | null>(null);
  readonly cetBase = this._cetBase.asReadonly();
  /**
   * `true` somente quando o cálculo demora a ponto de valer um indicador
   * visual (> ~120ms). Em recálculos rápidos o valor anterior continua visível
   * e é substituído sem flicker — só prazos longos acendem o "calculando…".
   */
  private readonly _cetCalculando = signal(false);
  readonly cetCalculando = this._cetCalculando.asReadonly();
  /** Sequência p/ descartar respostas obsoletas (último pedido vence). */
  private cetSeq = 0;

  // --- CET do comparativo (Price × SAC), também fora da main thread ---
  /** A seção do comparativo informa sua visibilidade; só então calculamos. */
  readonly comparativoVisivel = signal(false);
  private readonly _comparativoCet = signal<{
    price: ResultadoCetSerial;
    sac: ResultadoCetSerial;
  } | null>(null);
  readonly comparativoCet = this._comparativoCet.asReadonly();
  private compCetSeq = 0;

  /**
   * Entrada dos dois CETs do comparativo. `null` enquanto a seção estiver
   * recolhida — o `comparativo()` (e seus 2 cronogramas) nem chega a ser lido,
   * preservando a laziness anterior.
   */
  private readonly comparativoCetEntrada = computed<{ price: EntradaCet; sac: EntradaCet } | null>(
    () => {
      if (!this.comparativoVisivel()) return null;
      const c = this.comparativo();
      if (!c || !c.price.cetEntrada || !c.sac.cetEntrada) return null;
      return { price: c.price.cetEntrada, sac: c.sac.cetEntrada };
    },
  );

  constructor() {
    // CET base: dispara o worker a cada mudança da entrada. Mantém o último
    // valor visível durante o recálculo e só marca "calculando" após ~120ms.
    effect((onCleanup) => {
      const entrada = this.cetEntradaBase();
      const seq = ++this.cetSeq;
      if (!entrada) {
        this._cetBase.set(null);
        this._cetCalculando.set(false);
        return;
      }
      const timer = setTimeout(() => {
        if (seq === this.cetSeq) this._cetCalculando.set(true);
      }, 120);
      onCleanup(() => clearTimeout(timer));
      this.cetService.solicitar(entrada).then((res) => {
        if (seq !== this.cetSeq) return;
        clearTimeout(timer);
        this._cetBase.set(res);
        this._cetCalculando.set(false);
      });
    });

    // CET do comparativo: os 2 TIR (Price e SAC) também saem da main thread —
    // antes rodavam síncronos aqui e travavam o input em prazos longos.
    effect(() => {
      const entrada = this.comparativoCetEntrada();
      const seq = ++this.compCetSeq;
      this._comparativoCet.set(null);
      if (!entrada) return;
      Promise.all([
        this.cetService.solicitar(entrada.price),
        this.cetService.solicitar(entrada.sac),
      ]).then(([price, sac]) => {
        if (seq === this.compCetSeq) this._comparativoCet.set({ price, sac });
      });
    });
  }

  // --- Projecao com eventos (tabela separada, abaixo da base) ---
  readonly eventosResultado = computed<ProjecaoEventos | null>(() => {
    const eventos = this.eventos();
    if (eventos.length === 0) {
      return null;
    }
    try {
      const ctx = this.contexto();
      const proj = projetarComEventos({
        principal: ctx.principal,
        taxaPeriodo: ctx.i,
        prazo: ctx.n,
        sistema: this.sistema(),
        eventos,
        dataBase: ctx.dataBase,
        mora: {
          jurosMensal: new Decimal(this.moraJurosMensal()),
          multa: new Decimal(this.moraMulta()),
        },
        valorLiberado: ctx.valorLiberado,
      });
      return {
        parcelas: proj.parcelas,
        totais: {
          totalJuros: proj.resumo.totalJuros,
          totalAmortizacao: proj.resumo.totalAmortizacao,
          totalEncargos: proj.resumo.totalEncargos,
          totalParcelas: proj.resumo.totalPago,
        },
        cetMensal: proj.resumo.cetMensal,
        cetAnual: proj.resumo.cetAnual,
        resumo: proj.resumo,
      };
    } catch {
      return null;
    }
  });

  /**
   * Projeta o cronograma de um conjunto ARBITRÁRIO de eventos (sem CET, que é
   * caro) para validação rígida: a UI projeta o cenário dos OUTROS eventos e lê
   * o saldo/parcelas restantes no ponto exato onde um novo evento entraria.
   * Devolve `null` se não houver simulação válida ou se a projeção for inviável.
   */
  projetarCenario(eventos: EventoCalc[]): { parcelas: LinhaCronograma[]; principal: Decimal } | null {
    if (this.resultado().tipo !== 'ok') {
      return null;
    }
    try {
      const ctx = this.contexto();
      const proj = projetarComEventos({
        principal: ctx.principal,
        taxaPeriodo: ctx.i,
        prazo: ctx.n,
        sistema: this.sistema(),
        eventos,
        dataBase: ctx.dataBase,
        mora: {
          jurosMensal: new Decimal(this.moraJurosMensal()),
          multa: new Decimal(this.moraMulta()),
        },
        valorLiberado: ctx.valorLiberado,
        omitirCet: true,
      });
      return { parcelas: proj.parcelas, principal: ctx.principal };
    } catch {
      return null;
    }
  }

  /** Comparativo Price vs SAC para os mesmos {valorBruto, taxa, prazo}. */
  readonly comparativo = computed(() => {
    try {
      const principal = new Decimal(this.valorBruto());
      const i = taxaEfetivaMensal(new Decimal(this.taxa()), this.tipoTaxa(), this.unidadeTaxa());
      const n = this.prazo();
      if (!(n >= 1) || principal.lessThanOrEqualTo(0)) {
        return null;
      }
      const dataBase = this.dataBase();
      const entrada = { principal, taxaPeriodo: i, prazo: n, dataBase };
      const price = gerarCronogramaPrice(entrada);
      const sac = gerarCronogramaSac(entrada);
      return {
        price: {
          totais: somarTotais(price),
          primeiraParcela: price[0].valorParcela,
          ultimaParcela: price[n - 1].valorParcela,
          ...this.resumoCustos(principal, price, dataBase),
          saldos: [principal.toNumber(), ...price.map((p) => Number(p.saldoFinal))],
        },
        sac: {
          totais: somarTotais(sac),
          primeiraParcela: sac[0].valorParcela,
          ultimaParcela: sac[n - 1].valorParcela,
          ...this.resumoCustos(principal, sac, dataBase),
          saldos: [principal.toNumber(), ...sac.map((p) => Number(p.saldoFinal))],
        },
      };
    } catch {
      return null;
    }
  });

  /**
   * IOF total e a ENTRADA do CET de um cronograma (para o comparativo Price ×
   * SAC). O IOF é barato e fica síncrono; o CET (TIR/365) é caro e por isso só
   * devolvemos a entrada serializada — o cálculo roda no worker ({@link comparativoCet}).
   * Sem data de liberação não há como contar dias/365 → devolve nulos.
   */
  private resumoCustos(
    principal: Decimal,
    parcelas: Parcela[],
    dataBase: string,
  ): { iof: string | null; cetEntrada: EntradaCet | null } {
    if (!dataBase) return { iof: null, cetEntrada: null };
    const { iofTotal, valorLiberado } = this.custosAbertura(principal, parcelas, dataBase);
    const fluxos: FluxoSerial[] = parcelas.map((p) => ({
      periodo: new Decimal(diasCorridos(dataBase, p.dataVencimento)).div(365).toString(),
      valor: new Decimal(p.valorParcela).toString(),
    }));
    return {
      iof: iofTotal.toFixed(2),
      cetEntrada: { valorLiberado: valorLiberado.toString(), fluxos },
    };
  }

  /**
   * Contexto compartilhado (solver + cronograma base + custos de abertura),
   * memoizado como computed para ser reaproveitado por `resultado`,
   * `eventosResultado` e `cetEntradaBase` sem recalcular o cronograma.
   */
  private readonly contexto = computed(() => {
    setCasasMonetarias(2);

    const params: ParametrosSimulacao = {
      valorBruto: this.valorBruto(),
      valorLiquido: this.valorBruto(),
      taxa: this.taxa(),
      tipoTaxa: this.tipoTaxa(),
      unidadeTaxa: this.unidadeTaxa(),
      prazo: this.prazo(),
    };
    const dataBase = this.dataBase();
    if (!dataBase) {
      throw new Error('Data de liberacao obrigatória (CET BACEN usa dias corridos/365).');
    }

    // Solver de campo-alvo (Price e SAC; no SAC a "parcela" e a 1a parcela).
    const alvo = this.campoAlvo();
    const saida = resolverCampoAlvo({
      sistema: this.sistema(),
      parametros: params,
      parcela: alvo === 'parcela' ? undefined : this.parcela(),
      campoAlvo: alvo,
    });
    const resolvidos = saida.parametros;
    const parcelaCalculada = saida.parcela;

    const principal = new Decimal(resolvidos.valorBruto);
    const i = taxaEfetivaMensal(
      new Decimal(resolvidos.taxa),
      resolvidos.tipoTaxa,
      resolvidos.unidadeTaxa,
    );
    const n = resolvidos.prazo;
    if (!(n >= 1)) {
      throw new Error('Prazo deve ser >= 1.');
    }
    if (principal.lessThanOrEqualTo(0)) {
      throw new Error('Valor bruto deve ser > 0.');
    }

    const entrada = { principal, taxaPeriodo: i, prazo: n, dataBase };
    const baseParcelas =
      this.sistema() === 'price' ? gerarCronogramaPrice(entrada) : gerarCronogramaSac(entrada);
    const { iofTotal, iofDiario, iofAdicional, valorLiberado } = this.custosAbertura(
      principal,
      baseParcelas,
      dataBase,
    );

    return {
      resolvidos,
      parcelaCalculada,
      principal,
      i,
      n,
      dataBase,
      baseParcelas,
      iofTotal,
      iofDiario,
      iofAdicional,
      valorLiberado,
    };
  });

  /**
   * Simulacao base (sem eventos) — sempre exibida na tabela principal.
   * O CET NÃO é calculado aqui: ele é a parte cara (TIR/365) e roda fora da
   * main thread via {@link cetBase}/CetService, mantendo a UI fluida.
   */
  private calcularBase(): ResultadoSimulacao {
    const ctx = this.contexto();

    const totais = somarTotais(ctx.baseParcelas);

    return {
      parametros: ctx.resolvidos,
      parcelaCalculada: ctx.parcelaCalculada,
      parcelas: ctx.baseParcelas,
      totais,
      valorLiquido: ctx.valorLiberado.toFixed(2),
      iof: ctx.iofTotal.toFixed(2),
      memoriaCalculo: {
        iofDiario: ctx.iofDiario.toFixed(2),
        iofAdicional: ctx.iofAdicional.toFixed(2),
        engineVersion: this.config.config().version,
        hash: this.gerarHash(
          JSON.stringify({
            ...ctx.resolvidos,
            parcelaCalculada: ctx.parcelaCalculada,
            sistema: this.sistema(),
            dataBase: ctx.dataBase,
            publico: this.publico(),
            produto: this.produto(),
            incluirIof: this.incluirIof(),
            tarifaAbertura: this.tarifaAbertura(),
            campoAlvo: this.campoAlvo(),
          }),
        ),
      },
    };
  }

  private gerarHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
  }

  private custosAbertura(
    principal: Decimal,
    baseParcelas: Parcela[],
    dataBase: string,
  ): { iofTotal: Decimal; iofDiario: Decimal; iofAdicional: Decimal; valorLiberado: Decimal } {
    let iofTotal = new Decimal(0);
    let iofDiario = new Decimal(0);
    let iofAdicional = new Decimal(0);
    if (this.incluirIof()) {
      const parametros = resolverParametrosIof(
        this.config.config(),
        this.publico(),
        this.produto(),
      );
      const result = calcularIof({
        publico: this.publico(),
        principal,
        parcelas: baseParcelas,
        dataLiberacao: dataBase,
        parametros,
      });
      iofTotal = result.total;
      iofDiario = result.diario;
      iofAdicional = result.adicional;
    }
    const tarifa = new Decimal(this.tarifaAbertura() || '0');
    const valorLiberado = principal.minus(iofTotal).minus(tarifa);
    return { iofTotal, iofDiario, iofAdicional, valorLiberado };
  }
}
