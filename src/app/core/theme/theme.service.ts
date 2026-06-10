import { effect, Injectable, signal } from '@angular/core';

export type Tema = 'claro' | 'escuro';
const CHAVE = 'simulador-tema';

/**
 * Tema claro/escuro: aplica `data-theme` no <html>, persiste em localStorage e
 * respeita prefers-color-scheme no primeiro acesso. Tolerante a ambientes sem
 * matchMedia/localStorage (testes).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly tema = signal<Tema>(this.temaInicial());

  constructor() {
    effect(() => {
      const t = this.tema();
      try {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem(CHAVE, t);
      } catch {
        // ambiente sem DOM/storage
      }
    });
  }

  alternar(): void {
    this.tema.update((t) => (t === 'claro' ? 'escuro' : 'claro'));
  }

  private temaInicial(): Tema {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === 'claro' || salvo === 'escuro') {
        return salvo;
      }
      if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'escuro';
      }
    } catch {
      // ignora
    }
    return 'claro';
  }
}
