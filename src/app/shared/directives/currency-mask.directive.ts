import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

@Directive({
  selector: 'input[tsiCurrencyMask]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: CurrencyMaskDirective, multi: true }],
})
export class CurrencyMaskDirective implements ControlValueAccessor {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private onChange: (v: number) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const raw    = (event.target as HTMLInputElement).value ?? '';
    const negative = raw.trimStart().startsWith('-');
    const digits = raw.replace(/\D/g, '');
    const num    = (parseInt(digits || '0', 10) / 100) * (negative ? -1 : 1);
    this.el.nativeElement.value = this.fmt(num);
    this.onChange(num);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Allow "-" only at position 0 when the field is empty or all selected
    if (event.key === '-') {
      const input = this.el.nativeElement;
      const val   = input.value;
      const alreadyNegative = val.trimStart().startsWith('-');
      // Toggle sign: if already negative remove it, otherwise allow insertion at start
      if (alreadyNegative) {
        event.preventDefault();
        const digits = val.replace(/\D/g, '');
        const num    = parseInt(digits || '0', 10) / 100;
        input.value  = this.fmt(num);
        this.onChange(num);
      }
      // else: let the browser insert '-' and onInput will handle it
    }
  }

  @HostListener('focus')
  onFocus(): void {
    const cur = this.el.nativeElement.value;
    this.el.nativeElement.setSelectionRange(cur.length, cur.length);
  }

  @HostListener('blur')
  onBlur(): void { this.onTouched(); }

  writeValue(val: number): void {
    this.el.nativeElement.value = this.fmt(val ?? 0);
  }

  registerOnChange(fn: (v: number) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  private fmt(num: number): string {
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
