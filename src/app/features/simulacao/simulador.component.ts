import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { CurrencyPipe, PercentPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SimulacaoStore } from './simulacao.store';
import { CampoAlvo } from '../../core/engine/solver';
import { EventoCalc } from '../../core/engine/eventos';
import { adicionarMeses, diasCorridos } from '../../core/engine/dates';
import { Decimal } from '../../core/engine/decimal.config';

const CAMPOS: CampoAlvo[] = ['valorBruto', 'taxa', 'prazo', 'parcela'];

@Component({
  selector: 'app-simulador',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './simulador.component.html',
  styleUrl: './simulador.component.scss',
})
export class SimuladorComponent {
  private readonly fb = inject(FormBuilder);
  readonly store = inject(SimulacaoStore);

  readonly form = this.fb.nonNullable.group({
    sistema: this.store.sistema(),
    campoAlvo: this.store.campoAlvo(),
    valorBruto: this.store.valorBruto(),
    taxa: this.store.taxa(),
    tipoTaxa: this.store.tipoTaxa(),
    unidadeTaxa: this.store.unidadeTaxa(),
    prazo: this.store.prazo(),
    parcela: this.store.parcela(),
    dataBase: this.store.dataBase(),
  });

  constructor() {
    // Formulario -> store (le getRawValue p/ incluir campos travados).
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const v = this.form.getRawValue();
      this.store.sistema.set(v.sistema);
      this.store.campoAlvo.set(v.campoAlvo as CampoAlvo);
      this.store.valorBruto.set(String(v.valorBruto));
      this.store.taxa.set(String(v.taxa));
      this.store.tipoTaxa.set(v.tipoTaxa);
      this.store.unidadeTaxa.set(v.unidadeTaxa);
      this.store.prazo.set(Number(v.prazo));
      this.store.parcela.set(String(v.parcela));
      this.store.dataBase.set(v.dataBase);
      this.aplicarTravas();
    });

    // Resultado -> reflete o valor resolvido no campo-alvo (somente leitura).
    effect(() => {
      const r = this.store.resultado();
      if (r.tipo !== 'ok' || this.store.sistema() !== 'price') {
        return;
      }
      const alvo = this.store.campoAlvo();
      const patch: Record<string, string | number> = {};
      if (alvo === 'parcela') patch['parcela'] = r.dados.parcelaCalculada;
      if (alvo === 'valorBruto') patch['valorBruto'] = r.dados.parametros.valorBruto;
      if (alvo === 'taxa') patch['taxa'] = r.dados.parametros.taxa;
      if (alvo === 'prazo') patch['prazo'] = r.dados.parametros.prazo;
      this.form.patchValue(patch, { emitEvent: false });
    });

    this.aplicarTravas();
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
        };
        break;
      case 'antecipacao':
        evento = {
          tipo: 'antecipacao',
          apos,
          quantidade: Number(v.quantidade),
          opcao: v.opcao as 'reduzir-prazo' | 'reduzir-parcela',
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

  /** Trava (disable) o campo-alvo no Price; no SAC trava a parcela. */
  private aplicarTravas(): void {
    const sis = this.form.controls.sistema.value;
    const alvo = this.form.controls.campoAlvo.value as CampoAlvo;
    for (const c of CAMPOS) {
      const ctrl = this.form.get(c)!;
      const deveTravar = sis === 'price' ? c === alvo : c === 'parcela';
      if (deveTravar && ctrl.enabled) {
        ctrl.disable({ emitEvent: false });
      } else if (!deveTravar && ctrl.disabled) {
        ctrl.enable({ emitEvent: false });
      }
    }
  }
}
