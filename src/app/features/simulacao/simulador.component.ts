import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { take, debounceTime } from 'rxjs';
import { SimulacaoStore } from './simulacao.store';
import { CampoAlvo } from '../../core/engine/solver';
import { EventoCalc } from '../../core/engine/eventos';
import { adicionarMeses, diasCorridos } from '../../core/engine/dates';
import { Decimal, arredondarMoeda } from '../../core/engine/decimal.config';
import { Parcela } from '../../core/engine/models';
import { taxaEfetivaMensal } from '../../core/engine/rates';
import { valorParcelaPrice } from '../../core/engine/price';
import { MoedaInputDirective } from '../../shared/moeda-input.directive';
import { SecaoComponent } from '../../shared/secao.component';
import { DataBrPipe } from '../../shared/data-br.pipe';
import { RegulatoryConfigService } from '../../core/config/regulatory-config.service';
import { obterExplicacaoMatematica, explicacaoDaParcela, Explicacao } from './explicador';
import { ExplicacaoModalComponent } from './explicacao-modal.component';
import { GraficoSaldoComponent, SerieLinha } from './grafico-saldo.component';


const CAMPOS: CampoAlvo[] = ['valorBruto', 'taxa', 'prazo', 'parcela'];

function descreverEvento(e: EventoCalc): string {
  switch (e.tipo) {
    case 'amortizacao':
      return `Amortização R$ ${e.valor} após parc. ${e.apos} (${e.opcao})`;
    case 'antecipacao':
      return `Antecipar ${e.quantidade} parc. após parc. ${e.apos}`;
    case 'pagamento':
      return `Pagamento parc. ${e.apos} com ${e.diasAtraso} dia(s) de atraso`;
    default:
      return `Quitação após parc. ${e.apos}`;
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
    campoAlvo: this.store.campoAlvo(),
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

    // Formulario -> store (le getRawValue p/ incluir campos travados).
    // debounce: coalesce digitacao rapida (ex.: prazo 360) num unico recalculo,
    // evitando rodar a simulacao + CET a cada tecla.
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      const v = this.form.getRawValue();
      // ao mudar a simulação, volta a tabela ao modo janelado (perf).
      this.mostrarTodasParcelas.set(false);
      this.store.sistema.set(v.sistema);
      this.store.campoAlvo.set(v.campoAlvo as CampoAlvo);
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
      this.aplicarTravas();
      this.sincronizarTipoTaxa();

      // Serializar na URL
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ...v },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });

    // Resultado -> reflete o valor resolvido no campo-alvo (somente leitura).
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

    this.aplicarTravas();
    this.sincronizarTipoTaxa();
  }

  /** Hidrata o formulário a partir dos query params, validando tipo a tipo. */
  private hidratarPelaUrl(params: Params): void {
    const p = params as Record<string, string | undefined>;
    const patch: Partial<ReturnType<typeof this.form.getRawValue>> = {};

    if (p['sistema'] === 'price' || p['sistema'] === 'sac') patch.sistema = p['sistema'];
    if (CAMPOS.includes(p['campoAlvo'] as CampoAlvo)) patch.campoAlvo = p['campoAlvo'] as CampoAlvo;
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
      this.form.patchValue(patch, { emitEvent: true });
    }
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

  fecharExplicacao(): void {
    this.explicacaoAtiva.set(null);
    this.explicacaoParcela.set(null);
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

  /**
   * "Tipo de taxa" (efetiva/nominal) so faz diferenca para taxa ANUAL.
   * Em base mensal, nominal = efetiva -> desabilita o campo.
   */
  private sincronizarTipoTaxa(): void {
    const ctrl = this.form.controls.tipoTaxa;
    if (this.form.controls.unidadeTaxa.value === 'mensal') {
      if (ctrl.enabled) {
        ctrl.disable({ emitEvent: false });
      }
    } else if (ctrl.disabled) {
      ctrl.enable({ emitEvent: false });
    }
  }

  // --- Painel de eventos pos-simulacao ---
  readonly eventoForm = this.fb.nonNullable.group({
    tipo: 'amortizacao',
    indexarPor: 'parcela',
    apos: 1,
    data: '2026-07-01',
    valor: '1000',
    opcao: 'reduzir-prazo',
    quantidade: 2,
    diasAtraso: 30,
    valorPago: '',
  });

  /** Mapeia uma data para {apos, fracao} usando a data-base mensal (30/360). */
  private resolverPorData(data: string): { apos: number; fracao: Decimal } {
    const dataBase = this.store.dataBase();
    const prazo = this.store.prazo();
    let apos = 0;
    for (let k = 1; k <= prazo; k++) {
      if (adicionarMeses(dataBase, k) <= data) {
        apos = k;
      } else {
        break;
      }
    }
    const vencApos = apos === 0 ? dataBase : adicionarMeses(dataBase, apos);
    const dias = Math.max(0, diasCorridos(vencApos, data));
    let fracao = new Decimal(Math.min(dias, 30)).div(30);
    if (fracao.greaterThanOrEqualTo(1)) {
      fracao = new Decimal('0.999999');
    }
    return { apos, fracao };
  }

  adicionarEvento(): void {
    const v = this.eventoForm.getRawValue();
    const porData = v.indexarPor === 'data';
    const mapeado = porData ? this.resolverPorData(v.data) : null;
    const apos = mapeado ? mapeado.apos : Number(v.apos);
    let evento: EventoCalc;
    switch (v.tipo) {
      case 'amortizacao':
        evento = {
          tipo: 'amortizacao',
          apos,
          valor: String(v.valor),
          opcao: v.opcao as 'reduzir-prazo' | 'reduzir-parcela',
          ...(mapeado && mapeado.fracao.greaterThan(0)
            ? { fracaoPeriodo: mapeado.fracao.toString() }
            : {}),
        };
        break;
      case 'antecipacao':
        evento = {
          tipo: 'antecipacao',
          apos,
          quantidade: Number(v.quantidade),
          opcao: v.opcao as 'reduzir-prazo' | 'reduzir-parcela',
          ...(mapeado && mapeado.fracao.greaterThan(0)
            ? { fracaoPeriodo: mapeado.fracao.toString() }
            : {}),
        };
        break;
      case 'pagamento':
        evento = {
          tipo: 'pagamento',
          apos,
          diasAtraso: Number(v.diasAtraso),
          ...(v.valorPago ? { valorPago: String(v.valorPago) } : {}),
        };
        break;
      default:
        evento = {
          tipo: 'quitacao',
          apos,
          ...(mapeado ? { fracaoPeriodo: mapeado.fracao.toString() } : {}),
        };
    }
    this.store.adicionarEvento(evento);
  }

  /** Eventos com descrição pré-computada (evita chamada de função no template). */
  readonly eventosDescritos = computed(() =>
    this.store.eventos().map((e) => ({ evento: e, descricao: descreverEvento(e) })),
  );

  /** Trava (disable) o campo-alvo (Price e SAC; no SAC a parcela e a 1a). */
  private aplicarTravas(): void {
    const alvo = this.form.controls.campoAlvo.value as CampoAlvo;
    for (const c of CAMPOS) {
      const ctrl = this.form.get(c)!;
      const deveTravar = c === alvo;
      if (deveTravar && ctrl.enabled) {
        ctrl.disable({ emitEvent: false });
      } else if (!deveTravar && ctrl.disabled) {
        ctrl.enable({ emitEvent: false });
      }
    }
  }
}
