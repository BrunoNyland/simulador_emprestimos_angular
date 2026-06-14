import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Uma barra do gráfico de composição: juros (base) + amortização (topo). */
export interface BarraComposicao {
  numero: number;
  juros: number;
  amortizacao: number;
}

/**
 * Gráfico SVG puro (sem dependências) das parcelas como barras empilhadas:
 * juros embaixo, amortização em cima. Mostra a "forma" do sistema — no Price a
 * barra mantém a altura mas a fatia muda; no SAC a barra inteira decresce.
 * Tematizável pelos CSS vars; escala 100×56 esticada pela largura do container.
 */
@Component({
  selector: 'app-grafico-composicao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="g-fig">
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" class="g-svg" role="img" [attr.aria-label]="rotulo()">
        @for (c of colunas(); track c.numero) {
          <rect class="g-juros" [attr.x]="c.x" [attr.width]="c.w" [attr.y]="c.jurosY" [attr.height]="c.jurosH"></rect>
          <rect class="g-amort" [attr.x]="c.x" [attr.width]="c.w" [attr.y]="c.amortY" [attr.height]="c.amortH"></rect>
        }
      </svg>
      <figcaption class="g-legenda">
        <span><i class="sw sw-juros"></i> Juros</span>
        <span><i class="sw sw-amort"></i> Amortização</span>
        <span class="g-eixo">Mês 1 → {{ barras().length }}</span>
      </figcaption>
    </figure>
  `,
  styles: [
    `
      .g-fig {
        margin: 0;
      }
      .g-svg {
        display: block;
        width: 100%;
        height: 150px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .g-juros {
        fill: var(--danger);
      }
      .g-amort {
        fill: var(--accent);
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
      .sw-juros {
        background: var(--danger);
      }
      .sw-amort {
        background: var(--accent);
      }
      .g-eixo {
        margin-left: auto;
        font-family: var(--mono);
      }
    `,
  ],
})
export class GraficoComposicaoComponent {
  readonly barras = input.required<BarraComposicao[]>();

  private readonly altura = 56;
  private readonly maxBarras = 120;

  /**
   * Para prazos longos (ex.: 360 meses) agrega as parcelas em ~120 baldes
   * (média de juros/amortização) — mantém a forma do gráfico com poucos nós SVG.
   */
  private readonly amostra = computed<BarraComposicao[]>(() => {
    const bs = this.barras();
    if (bs.length <= this.maxBarras) return bs;
    const fator = Math.ceil(bs.length / this.maxBarras);
    const out: BarraComposicao[] = [];
    for (let k = 0; k < bs.length; k += fator) {
      const grupo = bs.slice(k, k + fator);
      const m = grupo.length;
      out.push({
        numero: grupo[0].numero,
        juros: grupo.reduce((a, b) => a + b.juros, 0) / m,
        amortizacao: grupo.reduce((a, b) => a + b.amortizacao, 0) / m,
      });
    }
    return out;
  });

  private readonly maxTotal = computed(() =>
    Math.max(1, ...this.amostra().map((b) => b.juros + b.amortizacao)),
  );

  protected readonly colunas = computed(() => {
    const bs = this.amostra();
    const n = bs.length || 1;
    const largura = 100 / n;
    const max = this.maxTotal();
    const bw = largura * (n > 48 ? 0.92 : 0.78);
    return bs.map((b, k) => {
      const hJuros = (b.juros / max) * this.altura;
      const hAmort = (b.amortizacao / max) * this.altura;
      const x = k * largura + (largura - bw) / 2;
      return {
        numero: b.numero,
        x,
        w: bw,
        jurosY: this.altura - hJuros,
        jurosH: hJuros,
        amortY: this.altura - hJuros - hAmort,
        amortH: hAmort,
      };
    });
  });

  protected readonly rotulo = computed(
    () =>
      `Composição das ${this.barras().length} parcelas: juros na base e amortização no topo, mês a mês.`,
  );
}
