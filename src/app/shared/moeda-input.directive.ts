import { Directive, ElementRef, forwardRef, HostListener, inject, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Input de moeda (pt-BR): exibe com separador de milhar e 2 casas; o valor do
 * FormControl e uma string numerica "1234.56". Nao aceita negativos; aplica
 * teto opcional via [max]. Usar em <input type="text" appMoeda>.
 */
@Directive({
  selector: 'input[appMoeda]',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoedaInputDirective), multi: true },
  ],
})
export class MoedaInputDirective implements ControlValueAccessor {
  @Input() max: number | null = null;

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('input')
  handleInput(): void {
    const digitos = this.el.value.replace(/\D/g, '');
    let valor = digitos ? parseInt(digitos, 10) / 100 : 0;
    if (this.max != null && valor > this.max) {
      valor = this.max;
    }
    this.el.value = this.formatar(valor);
    this.onChange(valor.toFixed(2));
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(v: string | number | null): void {
    const n = Number(v);
    this.el.value = v != null && v !== '' && Number.isFinite(n) ? this.formatar(n) : '';
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.el.disabled = disabled;
  }

  private formatar(n: number): string {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
