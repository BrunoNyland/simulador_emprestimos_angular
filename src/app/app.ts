import { afterNextRender, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import Lenis from 'lenis';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly theme = inject(ThemeService);

  constructor() {
    // Scroll suave (Lenis) — só no browser (afterNextRender não roda em testes/SSR).
    afterNextRender(() => {
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      const raf = (tempo: number): void => {
        lenis.raf(tempo);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });
  }
}
