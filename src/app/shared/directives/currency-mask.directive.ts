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

  @HostListener('input', ['$event.target.value'])
  onInput(raw: string): void {
    const digits = raw.replace(/\D/g, '');
    const num = parseInt(digits || '0', 10) / 100;
    this.el.nativeElement.value = this.fmt(num);
    this.onChange(num);
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
