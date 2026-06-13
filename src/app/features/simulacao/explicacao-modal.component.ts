import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
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
  /** Pede ao pai para abrir outra explicação (links cruzados). */
  readonly navegar = output<string>();

  /** Índice da linha de Excel copiada há instantes (feedback visual). */
  readonly copiadoIdx = signal<number | null>(null);

  /**
   * Fórmula MathML confiável (gerada pelo próprio explicador, sem entrada do
   * usuário). O sanitizador de HTML do Angular removeria os elementos <math>,
   * por isso marcamos como confiável explicitamente.
   */
  readonly formulaSegura = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.explicacao().formulaMathML),
  );

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly corpo = viewChild<ElementRef<HTMLElement>>('corpo');

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());

    // Ao trocar de tópico (link cruzado), volta a rolagem ao topo.
    effect(() => {
      this.explicacao().titulo; // dependência: recomputa quando muda
      this.corpo()?.nativeElement.scrollTo({ top: 0 });
    });
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

  /** True se a linha de Excel é uma fórmula copiável (começa com "="). */
  ehFormula(linha: string): boolean {
    return linha.trimStart().startsWith('=');
  }

  /** Extrai só a fórmula (antes do "→ resultado") para colar na planilha. */
  private formulaDe(linha: string): string {
    return linha.split('→')[0].trim();
  }

  async copiarFormula(linha: string, idx: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.formulaDe(linha));
      this.copiadoIdx.set(idx);
      setTimeout(() => this.copiadoIdx.set(null), 1500);
    } catch {
      // Clipboard indisponível (sem HTTPS/permite): ignora silenciosamente.
    }
  }
}
