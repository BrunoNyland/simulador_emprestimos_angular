import { Injectable } from '@angular/core';

/** Elementos interativos sobre os quais o anel do cursor "cresce". */
const SELETOR_INTERATIVO =
  'a, button, [role="button"], select, summary, label, .bolinha, .linha-clicavel, .card[role="button"]';

/**
 * Cursor personalizado no estilo do portfólio: um anel que segue o ponteiro
 * com suavização (lerp) e cresce ao passar por links/botões, mais um ponto
 * que acompanha a posição exata. Usa `var(--accent)`, então reflete a cor de
 * destaque escolhida. Só liga em ponteiro fino (não-touch) e respeita
 * `prefers-reduced-motion`.
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

    const anel = document.createElement('div');
    anel.className = 'cursor-anel';
    anel.setAttribute('aria-hidden', 'true');
    anel.innerHTML = '<i></i>';

    const ponto = document.createElement('div');
    ponto.className = 'cursor-ponto';
    ponto.setAttribute('aria-hidden', 'true');

    document.body.append(anel, ponto);
    document.documentElement.classList.add('cursor-custom', 'cursor-oculto');

    let alvoX = innerWidth / 2;
    let alvoY = innerHeight / 2;
    let anelX = alvoX;
    let anelY = alvoY;

    addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        alvoX = e.clientX;
        alvoY = e.clientY;
        ponto.style.transform = `translate(${alvoX}px, ${alvoY}px)`;
        document.documentElement.classList.remove('cursor-oculto');
      },
      { passive: true },
    );

    // Cresce sobre elementos interativos.
    document.addEventListener('pointerover', (e) => {
      const alvo = e.target as Element | null;
      const interativo = !!alvo?.closest?.(SELETOR_INTERATIVO);
      anel.classList.toggle('is-grande', interativo);
    });

    // Feedback ao clicar e ocultar quando o ponteiro sai da janela.
    addEventListener('pointerdown', () => anel.classList.add('is-clicando'));
    addEventListener('pointerup', () => anel.classList.remove('is-clicando'));
    document.addEventListener('mouseleave', () =>
      document.documentElement.classList.add('cursor-oculto'),
    );
    document.addEventListener('mouseenter', () =>
      document.documentElement.classList.remove('cursor-oculto'),
    );

    // O anel persegue o alvo com suavização (lerp), criando o "atraso" elegante.
    const animar = (): void => {
      anelX += (alvoX - anelX) * 0.18;
      anelY += (alvoY - anelY) * 0.18;
      anel.style.transform = `translate(${anelX}px, ${anelY}px)`;
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
  }
}
