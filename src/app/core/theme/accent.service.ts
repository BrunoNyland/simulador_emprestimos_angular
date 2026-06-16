import { effect, Injectable, signal } from '@angular/core';

const CHAVE = 'simulador-accent';

/** Uma opção da paleta de cores de destaque. */
export interface OpcaoAccent {
  nome: string;
  cor: string;
}

/**
 * Cor de destaque (`--accent`) escolhível pelo usuário, no estilo "bolinhas".
 * `null` = padrão do tema (mantém a curadoria por tema: verde escuro no claro,
 * verde Dracula no escuro). Uma cor explícita é aplicada como inline style no
 * <html>, sobrepondo ambos os temas, e persistida em localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AccentService {
  /** Paleta Dracula — combina com a identidade do projeto em ambos os temas. */
  readonly paleta: readonly OpcaoAccent[] = [
    { nome: 'Verde', cor: '#50fa7b' },
    { nome: 'Roxo', cor: '#bd93f9' },
    { nome: 'Ciano', cor: '#8be9fd' },
    { nome: 'Rosa', cor: '#ff79c6' },
    { nome: 'Laranja', cor: '#ffb86c' },
    { nome: 'Amarelo', cor: '#f1fa8c' },
  ];

  /** Cor escolhida, ou `null` para o padrão do tema. */
  readonly accent = signal<string | null>(this.inicial());

  constructor() {
    effect(() => {
      const cor = this.accent();
      try {
        const root = document.documentElement;
        if (cor) {
          root.style.setProperty('--accent', cor);
          // Tint translúcido derivado, funciona sobre fundo claro e escuro.
          root.style.setProperty('--accent-soft', `color-mix(in srgb, ${cor} 16%, transparent)`);
          localStorage.setItem(CHAVE, cor);
        } else {
          root.style.removeProperty('--accent');
          root.style.removeProperty('--accent-soft');
          localStorage.removeItem(CHAVE);
        }
      } catch {
        // ambiente sem DOM/storage
      }
    });
  }

  selecionar(cor: string | null): void {
    this.accent.set(cor);
  }

  private inicial(): string | null {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo && /^#[0-9a-fA-F]{6}$/.test(salvo)) {
        return salvo;
      }
    } catch {
      // ignora
    }
    return null;
  }
}
