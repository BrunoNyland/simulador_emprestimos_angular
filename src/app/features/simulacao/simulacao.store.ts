import { computed, inject, Injectable, signal } from '@angular/core';
import { Decimal } from '../../core/engine/decimal.config';
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
import { calcularCet, FluxoCaixa } from '../../core/engine/cet';
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

/** Mora default (espelha regulatory-config.jsonc; idealmente vem da config). */
const MORA_DEFAULT: ParametrosMora = {
  jurosMensal: new Decimal('0.01'),
  multa: new Decimal('0.02'),
};

export interface ResultadoSimulacao {
  parametros: ParametrosSimulacao;
  parcelaCalculada: string;
  parcelas: LinhaCronograma[];
  totais: TotaisCronograma;
  cetMensal: string;
  cetAnual: string;
  /** Valor liquido liberado (bruto - IOF - tarifa de abertura). */
  valorLiquido: string;
  /** IOF total da operacao. */
  iof: string;
  /** Presente quando ha eventos pos-simulacao aplicados. */
  resumoEventos?: ResumoProjecao;
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

  private readonly config = inject(RegulatoryConfigService);

  // --- Eventos pos-simulacao (lista ordenada; cronograma = projecao dela) ---
  readonly eventos = signal<EventoCalc[]>([]);

  adicionarEvento(evento: EventoCalc): void {
    this.eventos.update((lista) => [...lista, evento].sort((a, b) => a.apos - b.apos));
  }

  removerEvento(indice: number): void {
    this.eventos.update((lista) => lista.filter((_, i) => i !== indice));
  }

  limparEventos(): void {
    this.eventos.set([]);
  }

  /** Campos que ficam travados (somente leitura) = o campo-alvo (Price ou SAC). */
  readonly travado = (campo: CampoAlvo): boolean => this.campoAlvo() === campo;

  // --- Resultado reativo ---
  readonly resultado = computed<EstadoResultado>(() => {
    try {
      return { tipo: 'ok', dados: this.calcular() };
    } catch (e) {
      return { tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro de calculo' };
    }
  });

  /** Comparativo Price vs SAC para os mesmos {valorBruto, taxa, prazo}. */
  readonly comparativo = computed(() => {
    try {
      const principal = new Decimal(this.valorBruto());
      const i = taxaEfetivaMensal(new Decimal(this.taxa()), this.tipoTaxa(), this.unidadeTaxa());
      const n = this.prazo();
      if (!(n >= 1) || principal.lessThanOrEqualTo(0)) {
        return null;
      }
      const entrada = { principal, taxaPeriodo: i, prazo: n, dataBase: this.dataBase() };
      const price = gerarCronogramaPrice(entrada);
      const sac = gerarCronogramaSac(entrada);
      return {
        price: {
          totais: somarTotais(price),
          primeiraParcela: price[0].valorParcela,
          ultimaParcela: price[n - 1].valorParcela,
        },
        sac: {
          totais: somarTotais(sac),
          primeiraParcela: sac[0].valorParcela,
          ultimaParcela: sac[n - 1].valorParcela,
        },
      };
    } catch {
      return null;
    }
  });

  private calcular(): ResultadoSimulacao {
    const params: ParametrosSimulacao = {
      valorBruto: this.valorBruto(),
      valorLiquido: this.valorBruto(),
      taxa: this.taxa(),
      tipoTaxa: this.tipoTaxa(),
      unidadeTaxa: this.unidadeTaxa(),
      prazo: this.prazo(),
    };
    const dataBase = this.dataBase();

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

    // Cronograma base (contrato) — usado p/ IOF e p/ o caso sem eventos.
    const baseParcelas =
      this.sistema() === 'price' ? gerarCronogramaPrice(entrada) : gerarCronogramaSac(entrada);

    // IOF + tarifa de abertura -> valor liquido liberado (base do CET).
    const { iofTotal, valorLiberado } = this.custosAbertura(principal, baseParcelas, dataBase);

    const eventos = this.eventos();
    if (eventos.length > 0) {
      const proj = projetarComEventos({
        principal,
        taxaPeriodo: i,
        prazo: n,
        sistema: this.sistema(),
        eventos,
        dataBase,
        mora: MORA_DEFAULT,
        valorLiberado,
      });
      const totaisEv: TotaisCronograma = {
        totalJuros: proj.resumo.totalJuros,
        totalAmortizacao: proj.resumo.totalAmortizacao,
        totalEncargos: proj.resumo.totalEncargos,
        totalParcelas: proj.resumo.totalPago,
      };
      return {
        parametros: resolvidos,
        parcelaCalculada,
        parcelas: proj.parcelas,
        totais: totaisEv,
        cetMensal: proj.resumo.cetMensal,
        cetAnual: proj.resumo.cetAnual,
        valorLiquido: valorLiberado.toFixed(2),
        iof: iofTotal.toFixed(2),
        resumoEventos: proj.resumo,
      };
    }

    const totais = somarTotais(baseParcelas);
    const fluxos: FluxoCaixa[] = baseParcelas.map((p) => ({
      // BACEN: t_j = dias / 365
      periodo: new Decimal(diasCorridos(dataBase, p.dataVencimento)).div(365),
      valor: new Decimal(p.valorParcela),
    }));
    const cet = calcularCet(valorLiberado, fluxos, { periodosAno: 1 });

    return {
      parametros: resolvidos,
      parcelaCalculada,
      parcelas: baseParcelas,
      totais,
      cetMensal: cet.mensal.toDecimalPlaces(6).toString(),
      cetAnual: cet.anual.toDecimalPlaces(6).toString(),
      valorLiquido: valorLiberado.toFixed(2),
      iof: iofTotal.toFixed(2),
    };
  }

  /** IOF (se habilitado) + tarifa de abertura; retorna o liquido liberado. */
  private custosAbertura(
    principal: Decimal,
    baseParcelas: Parcela[],
    dataBase: string,
  ): { iofTotal: Decimal; valorLiberado: Decimal } {
    let iofTotal = new Decimal(0);
    if (this.incluirIof() && dataBase) {
      const parametros = resolverParametrosIof(
        this.config.config(),
        this.publico(),
        this.produto(),
      );
      iofTotal = calcularIof({
        publico: this.publico(),
        principal,
        parcelas: baseParcelas,
        dataLiberacao: dataBase,
        parametros,
      }).total;
    }
    const tarifa = new Decimal(this.tarifaAbertura() || '0');
    const valorLiberado = principal.minus(iofTotal).minus(tarifa);
    return { iofTotal, valorLiberado };
  }
}
