import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * Cartao de secao colapsavel. O cabecalho alterna a exibicao do conteudo
 * projetado. Estado persistido por `id` (localStorage), quando informado.
 */
@Component({
  selector: 'app-secao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cartao" [class.realce]="realce()" [class.fechada]="!aberta()">
      <button
        type="button"
        class="cab"
        (click)="alternar()"
        [attr.aria-expanded]="aberta()"
      >
        <span class="titulo-wrap">
          <span class="titulo">{{ titulo() }}</span>
          @if (sub()) {
            <span class="sub">{{ sub() }}</span>
          }
        </span>
        <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" />
        </svg>
      </button>
      @if (aberta()) {
        <div class="corpo"><ng-content /></div>
      }
    </section>
  `,
  styleUrl: './secao.component.scss',
})
export class SecaoComponent {
  readonly titulo = input.required<string>();
  readonly sub = input<string>('');
  readonly id = input<string>('');
  readonly realce = input<boolean>(false);
  readonly aberta = signal<boolean>(true);
  /** Emite o estado aberto/fechado (após hidratação e a cada alternância). */
  readonly abertaChange = output<boolean>();

  constructor() {
    queueMicrotask(() => {
      const id = this.id();
      if (id) {
        try {
          const salvo = localStorage.getItem(`secao:${id}`);
          if (salvo === '0') {
            this.aberta.set(false);
          }
        } catch {
          // ignora
        }
      }
      this.abertaChange.emit(this.aberta());
    });
  }

  alternar(): void {
    this.aberta.update((v) => !v);
    const id = this.id();
    if (id) {
      try {
        localStorage.setItem(`secao:${id}`, this.aberta() ? '1' : '0');
      } catch {
        // ignora
      }
    }
    this.abertaChange.emit(this.aberta());
  }
}
