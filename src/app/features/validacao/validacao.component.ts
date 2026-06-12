import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResultadoSimulacao } from '../simulacao/simulacao.store';
import { SecaoComponent } from '../../shared/secao.component';
import { Decimal } from '../../core/engine/decimal.config';

export interface DiffRow {
  numero: number;
  nossaParcela: string;
  delesParcela: string;
  deltaParcela: string;
  nossaAmortizacao: string;
  delesAmortizacao: string;
  deltaAmortizacao: string;
  temDivergencia: boolean;
}

@Component({
  selector: 'app-validacao',
  standalone: true,
  imports: [CommonModule, FormsModule, SecaoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './validacao.component.html',
  styleUrl: './validacao.component.scss',
})
export class ValidacaoComponent {
  resultado = input.required<ResultadoSimulacao | undefined>();

  jsonPasted = signal('');

  diffResult = computed(() => {
    const res = this.resultado();
    if (!res) return null;

    const pasted = this.jsonPasted();
    if (!pasted.trim()) return null;

    try {
      const parsed = JSON.parse(pasted);
      // Assume array of objects with { numero, valorParcela, amortizacao, ... }
      const delesParcelas: any[] = Array.isArray(parsed) ? parsed : (parsed.parcelas || []);

      const diffRows: DiffRow[] = [];
      let totalDivergencias = 0;

      for (const p of res.parcelas) {
        const deles = delesParcelas.find((x: any) => x.numero === p.numero);
        if (!deles) continue;

        const nossaP = new Decimal(p.valorParcela);
        const delesP = new Decimal(deles.valorParcela || 0);
        const deltaP = nossaP.minus(delesP);

        const nossaA = new Decimal(p.amortizacao);
        const delesA = new Decimal(deles.amortizacao || 0);
        const deltaA = nossaA.minus(delesA);

        const temDivergencia = !deltaP.isZero() || !deltaA.isZero();
        if (temDivergencia) totalDivergencias++;

        diffRows.push({
          numero: p.numero,
          nossaParcela: p.valorParcela,
          delesParcela: delesP.toFixed(2),
          deltaParcela: deltaP.toFixed(6),
          nossaAmortizacao: p.amortizacao,
          delesAmortizacao: delesA.toFixed(2),
          deltaAmortizacao: deltaA.toFixed(6),
          temDivergencia,
        });
      }

      return { rows: diffRows, totalDivergencias };
    } catch {
      return { erro: 'JSON inválido ou no formato incorreto.' };
    }
  });
}
