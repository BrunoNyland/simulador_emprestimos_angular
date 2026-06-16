import { afterNextRender, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import Lenis from 'lenis';
import { ThemeService } from './core/theme/theme.service';
import { CursorService } from './core/cursor/cursor.service';
import { AccentPickerComponent } from './shared/accent-picker.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AccentPickerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly theme = inject(ThemeService);
  private readonly cursor = inject(CursorService);

  constructor() {
    // Só no browser (afterNextRender não roda em testes/SSR).
    afterNextRender(() => {
      // Scroll suave (Lenis).
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      const raf = (tempo: number): void => {
        lenis.raf(tempo);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);

      // Cursor personalizado (anel que segue o ponteiro).
      this.cursor.iniciar();
    });
  }
}
