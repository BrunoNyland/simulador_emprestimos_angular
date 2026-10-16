import { Injectable } from '@angular/core';

/** Elementos interativos sobre os quais o ponto vira um anel. */
const SELETOR_INTERATIVO =
  'a, button, [role="button"], select, summary, label, .bolinha, .linha-clicavel, .card[role="button"]';

/**
 * Constante de tempo da perseguição: a cada quadro o ponto anda
 * 1 - e^(-dt/TAU) do que falta até o ponteiro. Com 45 ms ele chega a 95% em
 * ~135 ms, a mesma sensação dos 0,18 s do brunonyland.com.
 */
const TAU_MS = 45;

/**
 * Cursor do brunonyland.com: um ponto de 8px na cor de destaque
 * (`var(--accent)`) que segue o ponteiro com um leve atraso e vira um anel de
 * 36px sobre links e botões. O cursor nativo continua visível; o ponto é só
 * um acompanhamento.
 *
 * O brunonyland.com reinicia uma animação de 0,18 s a cada `mousemove`. Com
 * mouse de 500-1000 Hz chegam vários eventos por quadro, cada um zera o
 * progresso e o ponto quase não sai do lugar (medido: 280 px atrás do
 * ponteiro a 600 px/s). Aqui a posição alvo só é anotada no evento e o ponto
 * anda por quadro, conforme o tempo decorrido, independente de quantos
 * eventos chegaram. Sem GSAP (~27 kB). Só liga em ponteiro fino (mouse) e
 * respeita `prefers-reduced-motion`.
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
    let alvoX = 0;
    let alvoY = 0;
    let ultimo = 0;
    let quadro = 0;
    let primeiro = true;

    const mover = (): void => {
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };
    const animar = (agora: number): void => {
      // Primeiro quadro de uma perseguição: conta como um quadro de 60 Hz.
      const dt = ultimo ? Math.min(agora - ultimo, 100) : 1000 / 60;
      ultimo = agora;
      const k = 1 - Math.exp(-Math.max(dt, 0) / TAU_MS);
      x += (alvoX - x) * k;
      y += (alvoY - y) * k;
      if (Math.abs(alvoX - x) < 0.1 && Math.abs(alvoY - y) < 0.1) {
        x = alvoX;
        y = alvoY;
        quadro = 0;
        ultimo = 0;
      } else {
        quadro = requestAnimationFrame(animar);
      }
      mover();
    };

    addEventListener(
      'mousemove',
      (e: MouseEvent) => {
        cursor.classList.add('is-on');
        alvoX = e.clientX;
        alvoY = e.clientY;
        if (primeiro) {
          // Primeiro movimento: aparece já no ponteiro, sem atravessar a tela.
          primeiro = false;
          x = alvoX;
          y = alvoY;
          mover();
          return;
        }
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
