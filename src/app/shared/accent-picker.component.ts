import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AccentService } from '../core/theme/accent.service';

/**
 * Seletor de cor de destaque em "bolinhas". A primeira bolinha (contorno) volta
 * ao padrão do tema; as demais aplicam uma cor da paleta. A bolinha ativa ganha
 * um anel. Reflete e altera o {@link AccentService}.
 */
@Component({
  selector: 'app-accent-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cores" role="group" aria-label="Cor de destaque">
      <button
        type="button"
        class="bolinha bolinha--padrao"
        [class.ativa]="accent.accent() === null"
        [attr.aria-pressed]="accent.accent() === null"
        (click)="accent.selecionar(null)"
        title="Padrão do tema"
        aria-label="Cor de destaque padrão do tema"
      ></button>
      @for (opcao of accent.paleta; track opcao.cor) {
        <button
          type="button"
          class="bolinha"
          [style.--cor]="opcao.cor"
          [class.ativa]="accent.accent() === opcao.cor"
          [attr.aria-pressed]="accent.accent() === opcao.cor"
          (click)="accent.selecionar(opcao.cor)"
          [title]="opcao.nome"
          [attr.aria-label]="'Cor de destaque ' + opcao.nome"
        ></button>
      }
    </div>
  `,
  styleUrl: './accent-picker.component.scss',
})
export class AccentPickerComponent {
  readonly accent = inject(AccentService);
}
