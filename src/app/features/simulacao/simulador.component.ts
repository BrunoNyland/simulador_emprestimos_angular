import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { take, debounceTime } from 'rxjs';
import { SimulacaoStore } from './simulacao.store';
import { CampoAlvo } from '../../core/engine/solver';
import { BaseAmortizacao, EventoCalc, LinhaCronograma, mapearData } from '../../core/engine/eventos';
import { adicionarMeses } from '../../core/engine/dates';
import { Decimal, arredondarMoeda } from '../../core/engine/decimal.config';
import { OpcaoAmortizacao, Parcela } from '../../core/engine/models';
import { taxaEfetivaMensal } from '../../core/engine/rates';
import { valorParcelaPrice } from '../../core/engine/price';
import { MoedaInputDirective } from '../../shared/moeda-input.directive';
import { ClicavelDirective } from '../../shared/clicavel.directive';
import { SecaoComponent } from '../../shared/secao.component';
import { DataBrPipe } from '../../shared/data-br.pipe';
import { RegulatoryConfigService } from '../../core/config/regulatory-config.service';
import {
  obterExplicacaoMatematica,
  explicacaoDaParcela,
  explicacaoDeLinhaEvento,
  Explicacao,
} from './explicador';
import { ExplicacaoModalComponent } from './explicacao-modal.component';
import { GraficoSaldoComponent, SerieLinha } from './grafico-saldo.component';


const CAMPOS: CampoAlvo[] = ['valorBruto', 'taxa', 'prazo', 'parcela'];

function descreverEvento(e: EventoCalc): string {
  switch (e.tipo) {
    case 'amortizacao': {
      const base = e.base === 'pago' ? 'total pago' : 'amortizado';
      return `Amortização R$ ${e.valor} (${base}) em ${e.data} · ${e.opcao}`;
    }
    case 'antecipacao':
      return `Antecipar ${e.quantidade} parc. em ${e.data}`;
    case 'pagamento': {
      const parcial = e.valorPago ? ` parcial R$ ${e.valorPago}` : '';
      return `Pagamento da parcela de ${e.dataVencimento} em ${e.dataPagamento}${parcial}`;
    }
    default:
      return `Quitação em ${e.data}`;
  }
}

@Component({
  selector: 'app-simulador',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    MoedaInputDirective,
    ClicavelDirective,
    SecaoComponent,
    DataBrPipe,
    ExplicacaoModalComponent,
    GraficoSaldoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './simulador.component.html',
  styleUrl: './simulador.component.scss',
})
export class SimuladorComponent {
  private readonly fb = inject(FormBuilder);
  readonly store = inject(SimulacaoStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly configService = inject(RegulatoryConfigService);

  readonly explicacaoAtiva = signal<string | null>(null);

  /** Tabela do cronograma: janela de linhas renderizadas (perf em prazos longos). */
  private readonly LIMITE_LINHAS = 60;
  readonly mostrarTodasParcelas = signal(false);
  readonly cronograma = computed(() => {
    const r = this.store.resultado();
    if (r.tipo !== 'ok') {
      return { linhas: [] as Parcela[], total: 0, truncado: false };
    }
    const ps = r.dados.parcelas;
    const truncado = !this.mostrarTodasParcelas() && ps.length > this.LIMITE_LINHAS;
    return { linhas: truncado ? ps.slice(0, this.LIMITE_LINHAS) : ps, total: ps.length, truncado };
  });

  readonly limites = computed(() => this.configService.config().limites);
  readonly moraJurosMensalMax = computed(() =>
    this.fracaoParaPct(this.configService.config().mora.jurosMensal),
  );
  readonly moraMultaMax = computed(() =>
    this.fracaoParaPct(this.configService.config().mora.multa),
  );
  readonly formatoMoeda = computed(() => this.configService.config().formatos.valor);
  readonly formatoCetMensal = computed(() => this.configService.config().formatos.cetMensal);
  readonly formatoCetAnual = computed(() => this.configService.config().formatos.cetAnual);



  readonly form = this.fb.nonNullable.group({
    sistema: this.store.sistema(),
    valorBruto: this.store.valorBruto(),
    // taxa exibida em PORCENTAGEM (store guarda fracao).
    taxa: this.fracaoParaPct(this.store.taxa()),
    tipoTaxa: this.store.tipoTaxa(),
    unidadeTaxa: this.store.unidadeTaxa(),
    prazo: this.store.prazo(),
    parcela: this.store.parcela(),
    dataBase: this.store.dataBase(),
    publico: this.store.publico(),
    produto: this.store.produto(),
    incluirIof: this.store.incluirIof(),
    tarifaAbertura: this.store.tarifaAbertura(),
    moraJurosMensal: this.fracaoParaPct(this.store.moraJurosMensal()),
    moraMulta: this.fracaoParaPct(this.store.moraMulta()),
  });

  constructor() {
    // Hidratação inicial pela URL
    this.route.queryParams.pipe(take(1)).subscribe((params) => this.hidratarPelaUrl(params));

    // Detecção automática do campo a resolver (regra fixa):
    //  - editar a Parcela        → calcula o Valor bruto;
    //  - editar Valor/Taxa/Prazo → calcula a Parcela.
    // Sem debounce (só troca um signal; barato).
    for (const campo of CAMPOS) {
      this.form
        .get(campo)!
        .valueChanges.pipe(takeUntilDestroyed())
        .subscribe(() => this.marcarEdicao(campo));
    }

    // Formulario -> store. debounce: coalesce digitacao rapida (ex.: prazo 360)
    // num unico recalculo, evitando rodar a simulacao + CET a cada tecla.
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      const v = this.form.getRawValue();
      // ao mudar a simulação, volta a tabela ao modo janelado (perf).
      this.mostrarTodasParcelas.set(false);
      this.store.sistema.set(v.sistema);
      this.store.valorBruto.set(String(v.valorBruto));
      this.store.taxa.set(this.pctParaFracao(v.taxa));
      this.store.tipoTaxa.set(v.tipoTaxa);
      this.store.unidadeTaxa.set(v.unidadeTaxa);
      // prazo é <input type="number"> puro: o [max] nativo NÃO trava o valor
      // digitado, então aplicamos o limite [1, prazoMaximo] aqui e refletimos
      // no campo e na URL (os demais campos numéricos usam appMoeda, que clampa).
      const prazo = this.clampPrazo(v.prazo);
      if (prazo !== Number(v.prazo)) {
        this.form.controls.prazo.setValue(prazo, { emitEvent: false });
      }
      v.prazo = prazo;
      this.store.prazo.set(prazo);
      this.store.parcela.set(String(v.parcela));
      this.store.dataBase.set(v.dataBase);
      this.store.publico.set(v.publico as 'PF' | 'PJ');
      this.store.produto.set(v.produto);
      this.store.incluirIof.set(Boolean(v.incluirIof));
      this.store.tarifaAbertura.set(String(v.tarifaAbertura));
      this.store.moraJurosMensal.set(this.pctParaFracao(v.moraJurosMensal));
      this.store.moraMulta.set(this.pctParaFracao(v.moraMulta));

      // Serializar na URL (inclui o campo calculado, derivado fora do form).
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ...v, campoAlvo: this.store.campoAlvo() },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    // Resultado -> reflete o valor resolvido no campo calculado (somente leitura).
    effect(() => {
      const r = this.store.resultado();
      if (r.tipo !== 'ok') {
        return;
      }
      const alvo = this.store.campoAlvo();
      const patch: Record<string, string | number> = {};
      if (alvo === 'parcela') patch['parcela'] = r.dados.parcelaCalculada;
      if (alvo === 'valorBruto') patch['valorBruto'] = r.dados.parametros.valorBruto;
      if (alvo === 'taxa') patch['taxa'] = this.fracaoParaPct(r.dados.parametros.taxa);
      if (alvo === 'prazo') patch['prazo'] = r.dados.parametros.prazo;
      this.form.patchValue(patch, { emitEvent: false });
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.linkTimer));
  }

  /** Evita que o patch de hidratação seja confundido com edição do usuário. */
  private hidratando = false;

  /**
   * Regra de resolução: editar a Parcela calcula o Valor bruto; editar
   * Valor bruto, Taxa ou Prazo calcula a Parcela. Taxa e Prazo nunca são
   * o campo calculado.
   */
  private marcarEdicao(campo: CampoAlvo): void {
    if (this.hidratando) return;
    const alvo: CampoAlvo = campo === 'parcela' ? 'valorBruto' : 'parcela';
    if (alvo !== this.store.campoAlvo()) {
      this.store.campoAlvo.set(alvo);
    }
  }

  /** Hidrata o formulário a partir dos query params, validando tipo a tipo. */
  private hidratarPelaUrl(params: Params): void {
    const p = params as Record<string, string | undefined>;
    const patch: Partial<ReturnType<typeof this.form.getRawValue>> = {};

    if (p['sistema'] === 'price' || p['sistema'] === 'sac') patch.sistema = p['sistema'];
    if (p['valorBruto'] !== undefined) patch.valorBruto = p['valorBruto'];
    if (p['taxa'] !== undefined && Number.isFinite(Number(p['taxa']))) patch.taxa = Number(p['taxa']);
    if (p['tipoTaxa'] === 'efetiva' || p['tipoTaxa'] === 'nominal') patch.tipoTaxa = p['tipoTaxa'];
    if (p['unidadeTaxa'] === 'mensal' || p['unidadeTaxa'] === 'anual') patch.unidadeTaxa = p['unidadeTaxa'];
    if (p['prazo'] !== undefined && Number.isInteger(Number(p['prazo']))) patch.prazo = Number(p['prazo']);
    if (p['parcela'] !== undefined) patch.parcela = p['parcela'];
    if (p['dataBase'] !== undefined) patch.dataBase = p['dataBase'];
    if (p['publico'] === 'PF' || p['publico'] === 'PJ') patch.publico = p['publico'];
    if (p['produto'] !== undefined) patch.produto = p['produto'];
    if (p['incluirIof'] !== undefined) patch.incluirIof = p['incluirIof'] === 'true';
    if (p['tarifaAbertura'] !== undefined) patch.tarifaAbertura = p['tarifaAbertura'];
    if (p['moraJurosMensal'] !== undefined && Number.isFinite(Number(p['moraJurosMensal']))) {
      patch.moraJurosMensal = Number(p['moraJurosMensal']);
    }
    if (p['moraMulta'] !== undefined && Number.isFinite(Number(p['moraMulta']))) {
      patch.moraMulta = Number(p['moraMulta']);
    }

    if (Object.keys(patch).length > 0) {
      // Patch programático: não deve disparar a regra de resolução.
      this.hidratando = true;
      this.form.patchValue(patch, { emitEvent: true });
      this.hidratando = false;
    }

    // Campo calculado vindo da URL: só Parcela ou Valor bruto são válidos.
    this.store.campoAlvo.set(p['campoAlvo'] === 'valorBruto' ? 'valorBruto' : 'parcela');
  }

  /** Explicação de uma linha do cronograma (construída sob demanda no clique). */
  readonly explicacaoParcela = signal<Explicacao | null>(null);

  selecionarExplicacao(topico: string): void {
    this.explicacaoParcela.set(null);
    this.explicacaoAtiva.set(topico);
  }

  /** Abre a explicação da linha clicada do cronograma base. */
  explicarParcela(p: Parcela): void {
    const res = this.store.resultado();
    if (res.tipo !== 'ok') return;
    const params = res.dados.parametros;
    const sistema = this.store.sistema();
    const principal = new Decimal(params.valorBruto);
    const i = taxaEfetivaMensal(new Decimal(params.taxa), params.tipoTaxa, params.unidadeTaxa);
    const n = params.prazo;
    const exp = explicacaoDaParcela({
      sistema,
      numero: p.numero,
      prazo: n,
      saldoInicial: new Decimal(p.saldoInicial),
      taxaPeriodo: i,
      pmt: sistema === 'price' ? arredondarMoeda(valorParcelaPrice(principal, i, n)) : undefined,
      amortConstante: sistema === 'sac' ? arredondarMoeda(principal.div(n)) : undefined,
    });
    this.explicacaoAtiva.set(null);
    this.explicacaoParcela.set(exp);
  }

  /** Abre a explicação de uma linha do cronograma APÓS EVENTOS (com o evento). */
  explicarLinhaEvento(linha: LinhaCronograma): void {
    const res = this.store.resultado();
    if (res.tipo !== 'ok') return;
    const params = res.dados.parametros;
    const i = taxaEfetivaMensal(new Decimal(params.taxa), params.tipoTaxa, params.unidadeTaxa);
    this.explicacaoAtiva.set(null);
    this.explicacaoParcela.set(explicacaoDeLinhaEvento(linha, i));
  }

  fecharExplicacao(): void {
    this.explicacaoAtiva.set(null);
    this.explicacaoParcela.set(null);
  }

  // --- Compartilhar simulação (os parâmetros já vivem na URL) ---
  readonly linkCopiado = signal(false);
  private linkTimer?: ReturnType<typeof setTimeout>;

  /** Copia a URL atual (com todos os parâmetros) para a área de transferência. */
  copiarLink(): void {
    const url = location.href;
    const sucesso = () => {
      this.linkCopiado.set(true);
      clearTimeout(this.linkTimer);
      this.linkTimer = setTimeout(() => this.linkCopiado.set(false), 1500);
    };
    // Clipboard API exige contexto seguro + ativação do usuário; em http/navegadores
    // antigos cai no fallback execCommand para nunca ficar "sem resposta".
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(sucesso)
        .catch(() => this.copiarFallback(url, sucesso));
    } else {
      this.copiarFallback(url, sucesso);
    }
  }

  private copiarFallback(texto: string, aoCopiar: () => void): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      aoCopiar();
    } catch {
      // Sem clipboard disponível: não há como copiar; não emite falso sucesso.
    }
  }

  private static readonly TOPICOS_POS_EVENTOS = [
    'prazoFinal',
    'economiaJuros',
    'amortizacoesExtras',
    'moraEncargos',
    'totalPagoPos',
    'cetMensalPos',
  ];

  /** Explicação do tópico ativo, memoizada (recalcula só quando os signals mudam). */
  readonly explicacao = computed<Explicacao | null>(() => {
    // Explicação de linha do cronograma tem prioridade sobre os tópicos.
    const daParcela = this.explicacaoParcela();
    if (daParcela) return daParcela;

    const topico = this.explicacaoAtiva();
    if (!topico) return null;

    const res = this.store.resultado();
    const arredondamento = this.configService.config().defaults.arredondamento;

    // Tópico CONCEITUAL (taxa efetiva × nominal): independe de uma simulação
    // válida — usa os valores atuais do formulário só para o exemplo numérico.
    if (topico === 'tipoTaxa') {
      const dados = {
        parametros: {
          taxa: this.store.taxa(),
          tipoTaxa: this.store.tipoTaxa(),
          unidadeTaxa: this.store.unidadeTaxa(),
        },
      };
      return obterExplicacaoMatematica(topico, dados, this.store.sistema(), arredondamento);
    }

    if (SimuladorComponent.TOPICOS_POS_EVENTOS.includes(topico)) {
      const evRes = this.store.eventosResultado();
      if (!evRes) return null;
      const dadosExplicacao = {
        ...evRes,
        totaisOriginal: res.tipo === 'ok' ? res.dados.totais : null,
        parametros: res.tipo === 'ok' ? res.dados.parametros : null,
      };
      return obterExplicacaoMatematica(topico, dadosExplicacao, this.store.sistema(), arredondamento);
    }

    if (res.tipo !== 'ok') return null;

    // CET é assíncrono (worker); injeta o valor resolvido no dados da explicação.
    if (topico === 'cetMensal' || topico === 'cetAnual') {
      const cet = this.store.cetBase();
      if (!cet) return null; // ainda calculando
      const dados = { ...res.dados, cetMensal: cet.mensal, cetAnual: cet.anual };
      return obterExplicacaoMatematica(topico, dados, this.store.sistema(), arredondamento);
    }

    return obterExplicacaoMatematica(topico, res.dados, this.store.sistema(), arredondamento);
  });

  /** Séries de saldo devedor (Price × SAC) para o gráfico do comparativo. */
  readonly comparativoSeries = computed<SerieLinha[] | null>(() => {
    const c = this.store.comparativo();
    if (!c) return null;
    return [
      { nome: 'Price', valores: c.price.saldos, cor: 'var(--primary)' },
      { nome: 'SAC', valores: c.sac.saldos, cor: 'var(--accent)' },
    ];
  });

  /** Fracao -> porcentagem (2 casas) para exibicao. Ex.: 0.02 -> 2. */
  private fracaoParaPct(fracao: string): number {
    const v = new Decimal(fracao || '0').times(100);
    return v.toDecimalPlaces(2).toNumber();
  }

  /** Prazo digitado -> inteiro dentro de [1, prazoMaximo] da configuração. */
  private clampPrazo(valor: unknown): number {
    const max = this.limites().prazoMaximo;
    let n = Math.floor(Number(valor));
    if (!Number.isFinite(n) || n < 1) {
      n = 1;
    }
    if (n > max) {
      n = max;
    }
    return n;
  }

  /** Porcentagem digitada -> fracao para o store, com limites [0, max%]. */
  private pctParaFracao(pct: unknown): string {
    let v = Number(pct);
    if (!Number.isFinite(v) || v < 0) {
      v = 0;
    }
    const max = this.limites().taxaMaximaPct;
    if (v > max) {
      v = max;
    }
    return new Decimal(Math.round(v * 100) / 100).div(100).toString();
  }

  // --- Painel de eventos pos-simulacao (dirigidos por DATA) ---
  readonly eventoForm = this.fb.nonNullable.group({
    tipo: 'amortizacao',
    data: '2026-07-01',
    valor: '1000',
    // amortização: 'amortizado' = valor abate principal; 'pago' = total desembolsado.
    base: 'amortizado',
    opcao: 'reduzir-prazo',
    quantidade: 2,
    // cobrança: vencimento da parcela × data do pagamento efetivo (atraso = diferença).
    dataVencimento: '2026-07-01',
    dataPagamento: '2026-07-10',
    valorPago: '',
  });

  /** Taxa do período da simulação vigente (para juros pro-rata). `null` se inválida. */
  private taxaPeriodoAtual(): Decimal | null {
    const res = this.store.resultado();
    if (res.tipo !== 'ok') return null;
    const p = res.dados.parametros;
    return taxaEfetivaMensal(new Decimal(p.taxa), p.tipoTaxa, p.unidadeTaxa);
  }

  /** Índice do evento em edição na lista; `null` quando se está adicionando um novo. */
  readonly editandoIndice = signal<number | null>(null);

  adicionarEvento(): void {
    // Trava lançamentos impossíveis (qtd > parcelas restantes, valores/datas inválidos).
    if (this.erroEvento()) return;
    const evento = this.construirEventoDoForm(this.eventoForm.getRawValue());
    const idx = this.editandoIndice();
    if (idx !== null) {
      this.store.atualizarEvento(idx, evento);
      this.editandoIndice.set(null);
    } else {
      this.store.adicionarEvento(evento);
    }
  }

  /** Carrega um evento da lista no formulário para edição. */
  editarEvento(indice: number): void {
    const e = this.store.eventos()[indice];
    if (!e) return;
    this.editandoIndice.set(indice);
    this.eventoForm.patchValue({
      tipo: e.tipo,
      data: e.tipo === 'pagamento' ? e.dataVencimento : e.data,
      valor: e.tipo === 'amortizacao' ? e.valor : this.eventoForm.controls.valor.value,
      base: e.tipo === 'amortizacao' ? e.base : this.eventoForm.controls.base.value,
      quantidade: e.tipo === 'antecipacao' ? e.quantidade : this.eventoForm.controls.quantidade.value,
      opcao:
        (e.tipo === 'amortizacao' || e.tipo === 'antecipacao') && e.opcao
          ? e.opcao
          : this.eventoForm.controls.opcao.value,
      dataVencimento: e.tipo === 'pagamento' ? e.dataVencimento : this.eventoForm.controls.dataVencimento.value,
      dataPagamento: e.tipo === 'pagamento' ? e.dataPagamento : this.eventoForm.controls.dataPagamento.value,
      valorPago: e.tipo === 'pagamento' ? e.valorPago ?? '' : this.eventoForm.controls.valorPago.value,
    });
  }

  /** Cancela a edição em andamento, voltando ao modo "adicionar". */
  cancelarEdicao(): void {
    this.editandoIndice.set(null);
  }

  /** Remove um evento; se ele estava em edição, sai do modo de edição. */
  removerEvento(indice: number): void {
    this.store.removerEvento(indice);
    this.editandoIndice.set(null);
  }

  /**
   * Valida o evento em digitação contra a simulação base. Retorna a mensagem de
   * erro (ou `null` se válido) — usada para bloquear o lançamento e avisar o
   * usuário: datas/parcelas fora do período, valores ≤ 0, antecipar mais
   * parcelas do que restam, etc.
   */
  readonly erroEvento = computed<string | null>(() => {
    this.eventoFormSig(); // dependência reativa
    const v = this.eventoForm.getRawValue();
    const prazo = this.store.prazo();
    const dataBase = this.store.dataBase();

    if (!(prazo >= 1)) return 'Defina uma simulação válida antes de lançar eventos.';
    const ultimoVenc = adicionarMeses(dataBase, prazo);
    const i = this.taxaPeriodoAtual();

    // Cobrança: duas datas (vencimento da parcela × pagamento efetivo).
    if (v.tipo === 'pagamento') {
      if (!v.dataVencimento) return 'Informe a data de vencimento da parcela.';
      if (!v.dataPagamento) return 'Informe a data do pagamento.';
      const m = mapearData(dataBase, prazo, v.dataVencimento);
      const vencParcela = m.apos >= 1 ? adicionarMeses(dataBase, m.apos) : '';
      if (m.apos < 1 || vencParcela !== v.dataVencimento) {
        return 'A data de vencimento deve coincidir com o vencimento de uma parcela.';
      }
      const ctx = this.contextoPonto(m.apos);
      if (!ctx || m.apos > ctx.total) {
        return 'Essa parcela não existe no cronograma projetado — a dívida termina antes.';
      }
      if (v.dataPagamento < v.dataVencimento) {
        return 'A data do pagamento não pode ser anterior ao vencimento.';
      }
      if (v.valorPago) {
        const pago = new Decimal(v.valorPago);
        if (pago.lessThanOrEqualTo(0)) return 'O valor pago deve ser maior que zero.';
        if (pago.lessThanOrEqualTo(ctx.juros)) {
          return `O valor pago deve cobrir ao menos os juros do mês (${this.fmtBRL(ctx.juros)}).`;
        }
      }
      return null;
    }

    // Demais eventos: uma data, dentro do período.
    if (!v.data) return 'Informe a data do evento.';
    if (v.data < dataBase) return `A data deve ser a partir da liberação (${dataBase}).`;
    if (v.data > ultimoVenc) {
      return `A data deve estar dentro do período do empréstimo (até ${ultimoVenc}).`;
    }
    const m = mapearData(dataBase, prazo, v.data);
    const ctx = this.contextoPonto(m.apos);

    switch (v.tipo) {
      case 'amortizacao': {
        const valor = new Decimal(v.valor || '0');
        if (valor.lessThanOrEqualTo(0)) {
          return 'O valor da amortização deve ser maior que zero.';
        }
        if (!ctx || ctx.saldo.lessThanOrEqualTo(0)) {
          return 'Nesse ponto a dívida já está quitada — não há saldo a amortizar.';
        }
        const jurosPro = i ? arredondarMoeda(ctx.saldo.times(i).times(m.fracao)) : new Decimal(0);
        if (v.base === 'pago') {
          // Total pago: tem de cobrir ao menos os juros pro-rata corridos.
          if (m.fracao.greaterThan(0) && valor.lessThanOrEqualTo(jurosPro)) {
            return `O total pago deve cobrir ao menos os juros pro-rata do período (${this.fmtBRL(jurosPro)}).`;
          }
        } else if (valor.greaterThan(ctx.saldo)) {
          // Total amortizado: o principal a abater não pode passar do saldo.
          return `A amortização (${this.fmtBRL(valor)}) não pode ser maior que o saldo devedor nesse ponto (${this.fmtBRL(ctx.saldo)}).`;
        }
        break;
      }
      case 'quitacao': {
        if (!ctx || ctx.saldo.lessThanOrEqualTo(0)) {
          return 'Nesse ponto a dívida já está quitada — não há o que quitar.';
        }
        break;
      }
      case 'antecipacao': {
        const q = Math.floor(Number(v.quantidade));
        if (!Number.isFinite(q) || q < 1) return 'Antecipe ao menos 1 parcela.';
        // Parcelas que SOBRAM nessa data no cenário real (depois dos demais
        // eventos), não no prazo nominal — eventos anteriores já podem ter
        // encurtado o cronograma.
        if (!ctx || ctx.restantes <= 0) return 'Não há parcelas futuras para antecipar nessa data.';
        if (q > ctx.restantes) {
          return `Após essa data restam ${ctx.restantes} parcela(s); não dá para antecipar ${q}.`;
        }
        break;
      }
    }
    return null;
  });

  /** Moeda BRL para as mensagens de validação (fora do template/pipes). */
  private readonly brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  private fmtBRL(v: Decimal): string {
    return this.brl.format(v.toNumber());
  }

  /**
   * Eventos de REFERÊNCIA para validar um novo lançamento: todos os já
   * existentes, EXCETO o que está em edição (senão ele entraria duas vezes na
   * projeção e distorceria o saldo/parcelas restantes).
   */
  private eventosReferencia(): EventoCalc[] {
    const idx = this.editandoIndice();
    const eventos = this.store.eventos();
    return idx === null ? eventos : eventos.filter((_, i) => i !== idx);
  }

  /**
   * Estado EXATO no ponto `apos`, projetando de verdade o cenário dos demais
   * eventos (sem o que está em edição) e lendo a linha correspondente. Devolve
   * o saldo devedor, os juros do mês, quantas parcelas ainda restam após esse
   * ponto e o total projetado — base rígida para validar qualquer lançamento.
   * `apos = 0` → antes da 1ª parcela (principal). Linha inexistente (dívida já
   * encerrada antes) → saldo zero e nenhuma parcela restante.
   */
  private contextoPonto(
    apos: number,
  ): { saldo: Decimal; juros: Decimal; restantes: number; total: number } | null {
    const cenario = this.store.projetarCenario(this.eventosReferencia());
    if (!cenario) return null;
    const total = cenario.parcelas.length;
    if (apos <= 0) {
      return { saldo: cenario.principal, juros: new Decimal(0), restantes: total, total };
    }
    const linha = cenario.parcelas[apos - 1];
    if (!linha) {
      return { saldo: new Decimal(0), juros: new Decimal(0), restantes: 0, total };
    }
    return {
      saldo: new Decimal(linha.saldoFinal),
      juros: new Decimal(linha.juros),
      restantes: total - apos,
      total,
    };
  }

  /** Monta o EventoCalc (dirigido por data) a partir do form (reusado no preview). */
  private construirEventoDoForm(v: ReturnType<typeof this.eventoForm.getRawValue>): EventoCalc {
    switch (v.tipo) {
      case 'amortizacao':
        return {
          tipo: 'amortizacao',
          data: v.data,
          valor: String(v.valor),
          base: v.base as BaseAmortizacao,
          opcao: v.opcao as OpcaoAmortizacao,
        };
      case 'antecipacao':
        return {
          tipo: 'antecipacao',
          data: v.data,
          quantidade: Number(v.quantidade),
          opcao: v.opcao as OpcaoAmortizacao,
        };
      case 'pagamento':
        return {
          tipo: 'pagamento',
          dataVencimento: v.dataVencimento,
          dataPagamento: v.dataPagamento,
          ...(v.valorPago ? { valorPago: String(v.valorPago) } : {}),
        };
      default:
        return { tipo: 'quitacao', data: v.data };
    }
  }

  /** Eventos com descrição pré-computada (evita chamada de função no template). */
  readonly eventosDescritos = computed(() =>
    this.store.eventos().map((e) => ({ evento: e, descricao: descreverEvento(e) })),
  );

  /** Valor do formulário de evento como signal, para o preview reativo. */
  private readonly eventoFormSig = toSignal(this.eventoForm.valueChanges, {
    initialValue: this.eventoForm.getRawValue(),
  });

  /** Texto de ajuda explicando o tipo de evento selecionado. */
  readonly ajudaEvento = computed<string>(() => {
    this.eventoFormSig(); // dependência reativa (o valor tipado vem do form)
    switch (this.eventoForm.controls.tipo.value) {
      case 'amortizacao':
        return 'Pagamento EXTRA numa data. "Total amortizado": o valor abate o principal e os juros corridos no mês entram por cima. "Total pago": o valor é o desembolso e o sistema separa juros + amortização. Reduz prazo ou parcela.';
      case 'quitacao':
        return 'Pagar TODO o saldo devedor restante de uma vez, encerrando a dívida. Na data de uma parcela, é o próprio saldo; no meio do mês, soma juros pro-rata.';
      case 'antecipacao':
        return 'Antecipar um número de parcelas futuras pagando hoje o VALOR PRESENTE delas (com desconto dos juros). Reduz o prazo ou a parcela.';
      default:
        return 'Pagar uma parcela numa data diferente do vencimento: o atraso (vencimento → pagamento) gera multa + juros de mora. Informe um valor pago para simular pagamento PARCIAL.';
    }
  });

  /** Pré-visualização do evento que será adicionado (descrição amigável). */
  readonly previewEvento = computed<string | null>(() => {
    this.eventoFormSig(); // dependência reativa
    try {
      return descreverEvento(this.construirEventoDoForm(this.eventoForm.getRawValue()));
    } catch {
      return null;
    }
  });
}
