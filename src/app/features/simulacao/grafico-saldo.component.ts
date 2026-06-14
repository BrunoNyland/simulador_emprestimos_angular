import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Uma série (linha) do gráfico de saldo: valores por período + cor (CSS var). */
export interface SerieLinha {
  nome: string;
  /** Saldo devedor em cada período (índice 0 = liberação, último = 0). */
  valores: number[];
  /** Cor da linha (ex.: 'var(--primary)'). */
  cor: string;
}

/**
 * Gráfico SVG puro do saldo devedor ao longo do tempo, com uma ou mais linhas
 * sobrepostas (ex.: Price × SAC). Mostra o Price caindo devagar no início
 * (côncavo) vs o SAC em reta. Stroke uniforme via vector-effect; tematizável.
 */
@Component({
  selector: 'app-grafico-saldo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="g-fig">
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" class="g-svg" role="img" [attr.aria-label]="rotulo()">
        <line class="g-base" x1="0" y1="56" x2="100" y2="56"></line>
        @for (p of linhas(); track p.nome) {
          <path class="g-linha" [attr.d]="p.d" [style.stroke]="p.cor"></path>
        }
      </svg>
      <figcaption class="g-legenda">
        @for (p of linhas(); track p.nome) {
          <span><i class="sw" [style.background]="p.cor"></i> {{ p.nome }}</span>
        }
        <span class="g-eixo">Saldo devedor · mês 0 → {{ maxN() }}</span>
      </figcaption>
    </figure>
  `,
  styles: [
    `
      .g-fig {
        margin: 0.5rem 0 0;
      }
      .g-svg {
        display: block;
        width: 100%;
        height: 150px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .g-linha {
        fill: none;
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
      }
      .g-base {
        stroke: var(--border-strong);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .g-legenda {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin-top: 0.3rem;
        font-size: 0.72rem;
        color: var(--text-muted);
      }
      .sw {
        display: inline-block;
        width: 0.7rem;
        height: 0.7rem;
        border-radius: 2px;
        margin-right: 0.25rem;
        vertical-align: middle;
      }
      .g-eixo {
        margin-left: auto;
        font-family: var(--mono);
      }
    `,
  ],
})
export class GraficoSaldoComponent {
  readonly series = input.required<SerieLinha[]>();

  private readonly altura = 56;
  private readonly largura = 100;

  private readonly maxValor = computed(() =>
    Math.max(1, ...this.series().flatMap((s) => s.valores)),
  );

  protected readonly maxN = computed(() =>
    Math.max(0, ...this.series().map((s) => s.valores.length - 1)),
  );

  protected readonly linhas = computed(() => {
    const max = this.maxValor();
    return this.series().map((s) => {
      const len = s.valores.length;
      const d = s.valores
        .map((v, k) => {
          const x = len <= 1 ? 0 : (k / (len - 1)) * this.largura;
          const y = this.altura - (v / max) * this.altura;
          return `${k === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
      return { nome: s.nome, cor: s.cor, d };
    });
  });

  protected readonly rotulo = computed(
    () => `Saldo devedor ao longo do tempo: ${this.series().map((s) => s.nome).join(' e ')}.`,
  );
}
