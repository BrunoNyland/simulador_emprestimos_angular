import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Explicacao } from './explicador';

/**
 * Modal da demonstração matemática passo a passo.
 *
 * Usa o elemento nativo <dialog> com showModal(): focus trap, fechamento por
 * ESC e backdrop vêm do navegador, sem listeners globais. O pai controla o
 * ciclo de vida via @if; este componente apenas emite `fechar`.
 */
@Component({
  selector: 'app-explicacao-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './explicacao-modal.component.html',
  styleUrl: './explicacao-modal.component.scss',
})
export class ExplicacaoModalComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly explicacao = input.required<Explicacao>();
  readonly fechar = output<void>();

  /**
   * Fórmula MathML confiável (gerada pelo próprio explicador, sem entrada do
   * usuário). O sanitizador de HTML do Angular removeria os elementos <math>,
   * por isso marcamos como confiável explicitamente.
   */
  readonly formulaSegura = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.explicacao().formulaMathML),
  );

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  /**
   * Clique no backdrop: o conteúdo preenche o <dialog>, então um clique cujo
   * alvo é o próprio elemento dialog só pode ter ocorrido no backdrop.
   */
  aoClicar(ev: MouseEvent): void {
    if (ev.target === this.dialogo().nativeElement) {
      this.fechar.emit();
    }
  }
}
