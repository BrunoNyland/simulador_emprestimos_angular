import { ChangeDetectionStrategy, Component, effect, inject, HostListener, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';
import { SimulacaoStore } from './simulacao.store';
import { CampoAlvo } from '../../core/engine/solver';
import { EventoCalc } from '../../core/engine/eventos';
import { adicionarMeses, diasCorridos } from '../../core/engine/dates';
import { Decimal } from '../../core/engine/decimal.config';
import { MoedaInputDirective } from '../../shared/moeda-input.directive';
import { SecaoComponent } from '../../shared/secao.component';
import { RegulatoryConfigService } from '../../core/config/regulatory-config.service';
import { obterExplicacaoMatematica, Explicacao } from './explicador';


const CAMPOS: CampoAlvo[] = ['valorBruto', 'taxa', 'prazo', 'parcela'];

@Component({
  selector: 'app-simulador',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, CurrencyPipe, DecimalPipe, PercentPipe, MoedaInputDirective, SecaoComponent],
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

  get limites() {
    return this.configService.config().limites;
  }

  get moraJurosMensalMax() {
    return this.fracaoParaPct(this.configService.config().mora.jurosMensal);
  }

  get moraMultaMax() {
    return this.fracaoParaPct(this.configService.config().mora.multa);
  }



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
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      if (Object.keys(params).length > 0) {
        // Converte as strings da query param para os tipos corretos onde necessario
        const patch: any = { ...params };
        if (params['incluirIof'] !== undefined) patch.incluirIof = params['incluirIof'] === 'true';
        if (params['moraJurosMensal'] !== undefined) patch.moraJurosMensal = params['moraJurosMensal'];
        if (params['moraMulta'] !== undefined) patch.moraMulta = params['moraMulta'];
        
        this.form.patchValue(patch, { emitEvent: true });
        
      }
    });

    // Formulario -> store (le getRawValue p/ incluir campos travados).
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const v = this.form.getRawValue();
      this.store.sistema.set(v.sistema);
      this.store.campoAlvo.set(v.campoAlvo as CampoAlvo);
      this.store.valorBruto.set(String(v.valorBruto));
      this.store.taxa.set(this.pctParaFracao(v.taxa));
      this.store.tipoTaxa.set(v.tipoTaxa);
      this.store.unidadeTaxa.set(v.unidadeTaxa);
      this.store.prazo.set(Number(v.prazo));
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



  get formatoMoeda(): string {
    return this.configService.config().formatos.valor;
  }

  get formatoCetMensal(): string {
    return this.configService.config().formatos.cetMensal;
  }

  get formatoCetAnual(): string {
    return this.configService.config().formatos.cetAnual;
  }

  selecionarExplicacao(topico: string): void {
    this.explicacaoAtiva.set(topico);
  }

  fecharExplicacao(): void {
    this.explicacaoAtiva.set(null);
  }

  @HostListener('document:keydown.escape')
  fecharExplicacaoPorTeclado(): void {
    this.fecharExplicacao();
  }

  get explicacao(): Explicacao | null {
    const topico = this.explicacaoAtiva();
    if (!topico) return null;

    const res = this.store.resultado();
    const evRes = this.store.eventosResultado();

    const topicosPosEventos = [
      'prazoFinal',
      'economiaJuros',
      'amortizacoesExtras',
      'moraEncargos',
      'totalPagoPos',
      'cetMensalPos',
    ];

    if (topicosPosEventos.includes(topico)) {
      if (!evRes) return null;
      const dadosExplicacao = {
        ...evRes,
        totaisOriginal: res.tipo === 'ok' ? res.dados.totais : null,
        parametros: res.tipo === 'ok' ? res.dados.parametros : null,
      };
      return obterExplicacaoMatematica(
        topico,
        dadosExplicacao,
        this.store.sistema(),
        this.configService.config().defaults.arredondamento,
      );
    }

    if (res.tipo !== 'ok') return null;

    return obterExplicacaoMatematica(
      topico,
      res.dados,
      this.store.sistema(),
      this.configService.config().defaults.arredondamento,
    );
  }

  formatarData(iso: string): string {
    if (!iso) return '';
    const partes = iso.split('-');
    if (partes.length !== 3) return iso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  /** Fracao -> porcentagem (2 casas) para exibicao. Ex.: 0.02 -> 2. */
  private fracaoParaPct(fracao: string): number {
    const v = new Decimal(fracao || '0').times(100);
    return v.toDecimalPlaces(2).toNumber();
  }

  /** Porcentagem digitada -> fracao para o store, com limites [0, max%]. */
  private pctParaFracao(pct: unknown): string {
    let v = Number(pct);
    if (!Number.isFinite(v) || v < 0) {
      v = 0;
    }
    const max = this.limites.taxaMaximaPct;
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

  descreverEvento(e: EventoCalc): string {
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
