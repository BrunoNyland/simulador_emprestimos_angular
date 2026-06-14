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

/** Segmento de uma instrução da HP12C: tecla (botão), número ou texto. */
interface HpSeg {
  tipo: 'tecla' | 'num' | 'texto';
  texto: string;
  cls: string;
}

/** Uma linha de instrução da HP12C, já tokenizada para renderização. */
interface HpLinha {
  segs: HpSeg[];
  comentario: string;
  /** true quando a linha é uma frase (e não uma sequência pura de teclas). */
  prosa: boolean;
}

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

  /** Formata o resultado de um passo do traço (string Decimal) para exibição. */
  formatarPasso(resultado: string | undefined, casas: number | undefined): string {
    const c = casas ?? 2;
    return Number(resultado ?? '0').toLocaleString('pt-BR', {
      minimumFractionDigits: c,
      maximumFractionDigits: c,
    });
  }

  /**
   * Teclas de função da HP12C (case-sensitive). Tokens que casam aqui viram
   * "botões"; o restante é número (operando) ou texto explicativo.
   */
  private static readonly HP_TECLAS = new Set([
    'ENTER', 'CHS', 'PV', 'PMT', 'FV', 'n', 'i', 'f', 'g', 'STO', 'RCL', 'CLX',
    'CF0', 'CFo', 'CFj', 'Nj', 'IRR', 'NPV', 'END', 'BEG', 'x><y', '1/x',
    '%', '%T', 'EEX', 'R/S', 'GTO', '÷', '×', '−', '-', '+', '=',
  ]);

  private static ehTeclaHp(t: string): boolean {
    return ExplicacaoModalComponent.HP_TECLAS.has(t);
  }

  private static ehNumeroHp(t: string): boolean {
    return /\d/.test(t) && /^[-]?[\d.,]+%?$/.test(t);
  }

  /**
   * Quebra uma linha de instrução da HP12C em segmentos renderizáveis: teclas
   * (botões), números (operandos) e texto. Linhas que são frases (contêm
   * palavras que não são teclas nem números) viram "prosa", com as teclas ainda
   * destacadas como botões inline.
   */
  readonly hp12cLinhas = computed<HpLinha[]>(() =>
    this.explicacao().hp12c.map((linha) => ExplicacaoModalComponent.analisarHp(linha)),
  );

  private static analisarHp(linha: string): HpLinha {
    // 1) separa o comentário: tudo a partir de "→" ou de um parêntese final.
    let principal = linha;
    let comentario = '';
    const seta = linha.indexOf('→');
    if (seta >= 0) {
      comentario = linha.slice(seta).trim();
      principal = linha.slice(0, seta);
    }
    const parFinal = principal.match(/\s*(\([^)]*\))\s*$/);
    if (parFinal) {
      comentario = (parFinal[1] + (comentario ? ' ' + comentario : '')).trim();
      principal = principal.slice(0, parFinal.index).trim();
    }

    const tokens = principal.trim().split(/\s+/).filter(Boolean);
    const keystroke =
      tokens.length > 0 &&
      tokens.every((t) => ExplicacaoModalComponent.ehTeclaHp(t) || ExplicacaoModalComponent.ehNumeroHp(t));

    const segs: HpSeg[] = tokens.map((t) => {
      if (ExplicacaoModalComponent.ehTeclaHp(t)) {
        const cls =
          'hp-tecla' + (t === 'f' ? ' hp-f' : t === 'g' ? ' hp-g' : '');
        return { tipo: 'tecla', texto: t, cls };
      }
      if (keystroke && ExplicacaoModalComponent.ehNumeroHp(t)) {
        return { tipo: 'num', texto: t, cls: 'hp-num' };
      }
      return { tipo: 'texto', texto: t, cls: 'hp-texto' };
    });

    return { segs, comentario, prosa: !keystroke };
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
