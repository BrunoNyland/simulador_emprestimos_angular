import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Torna um elemento não-interativo (ex.: `<div class="card">`) acionável por
 * teclado, equiparando-o a um botão: expõe `role="button"` + `tabindex="0"` e
 * dispara o mesmo `(click)` já existente ao pressionar Enter ou Espaço.
 *
 * Uso: aplique `appClicavel` ao lado do `(click)` do elemento. Mantém o
 * handler de clique como fonte única de verdade (o teclado apenas o reusa),
 * evitando duplicar a lógica de cada card no template.
 */
@Directive({
  selector: '[appClicavel]',
  standalone: true,
  host: {
    role: 'button',
    tabindex: '0',
    '(keydown.enter)': 'acionar($event)',
    '(keydown.space)': 'acionar($event)',
  },
})
export class ClicavelDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  acionar(evento: Event): void {
    evento.preventDefault(); // Espaço rola a página por padrão; Enter "envia".
    this.el.nativeElement.click();
  }
}
