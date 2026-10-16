import { Injectable } from '@angular/core';

/** Elementos interativos sobre os quais o ponto vira um anel. */
const SELETOR_INTERATIVO =
  'a, button, [role="button"], select, summary, label, .bolinha, .linha-clicavel, .card[role="button"]';

/** Mesma animação do brunonyland.com: gsap.to(..., { duration: 0.18, ease: 'power2.out' }). */
const DURACAO_MS = 180;
const power2Out = (p: number): number => 1 - (1 - p) ** 3;

/**
 * Cursor do brunonyland.com: um ponto de 8px na cor de destaque
 * (`var(--accent)`, com `mix-blend-mode: difference`) que segue o ponteiro com
 * um leve atraso e vira um anel de 36px sobre links e botões. O cursor nativo
 * continua visível; o ponto é só um acompanhamento.
 *
 * Cada movimento reinicia a animação a partir da posição atual, como o
 * `overwrite: true` do GSAP, sem trazer o GSAP (~27 kB) para o bundle. Só liga
 * em ponteiro fino (mouse) e respeita `prefers-reduced-motion`.
 */
@Injectable({ providedIn: 'root' })
export class CursorService {
  private iniciado = false;

  iniciar(): void {
    if (this.iniciado || typeof window === 'undefined') return;
    const fino = matchMedia('(pointer: fine)').matches;
    const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fino || reduzMovimento) return;
    this.iniciado = true;

    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    document.body.append(cursor);

    let x = 0;
    let y = 0;
    let deX = 0;
    let deY = 0;
    let paraX = 0;
    let paraY = 0;
    let inicio = 0;
    let quadro = 0;
    let primeiro = true;

    const mover = (): void => {
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };
    const animar = (agora: number): void => {
      const p = Math.min(1, Math.max(0, (agora - inicio) / DURACAO_MS));
      const k = power2Out(p);
      x = deX + (paraX - deX) * k;
      y = deY + (paraY - deY) * k;
      mover();
      quadro = p < 1 ? requestAnimationFrame(animar) : 0;
    };

    addEventListener(
      'mousemove',
      (e: MouseEvent) => {
        cursor.classList.add('is-on');
        if (primeiro) {
          // Primeiro movimento: aparece já no ponteiro, sem atravessar a tela.
          primeiro = false;
          x = e.clientX;
          y = e.clientY;
          mover();
        }
        deX = x;
        deY = y;
        paraX = e.clientX;
        paraY = e.clientY;
        inicio = performance.now();
        if (!quadro) quadro = requestAnimationFrame(animar);
      },
      { passive: true },
    );

    document.addEventListener('mouseover', (e) => {
      const alvo = e.target as Element | null;
      cursor.classList.toggle('is-hover', !!alvo?.closest?.(SELETOR_INTERATIVO));
    });

    // Some quando o ponteiro sai da janela, para não ficar parado na borda.
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
  }
}
