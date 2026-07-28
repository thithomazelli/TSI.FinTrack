import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';
import flatpickr from 'flatpickr';
import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
import { Instance } from 'flatpickr/dist/types/instance';

/**
 * Applied automatically to every <input type="date">.
 * Replaces the native (browser-locale) date picker with flatpickr in pt-BR,
 * showing DD/MM/YYYY to the user while keeping YYYY-MM-DD as the model value
 * so all existing [(ngModel)] bindings continue to work unchanged.
 */
@Directive({
  selector: 'input[type=date]',
  standalone: true,
})
export class DateLangDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private fp: Instance | null = null;

  ngOnInit(): void {
    const input = this.el.nativeElement as HTMLInputElement;

    this.fp = flatpickr(input, {
      locale: Portuguese,
      dateFormat: 'Y-m-d',       // model value stays ISO (YYYY-MM-DD)
      altInput: true,             // show a friendly input to the user
      altFormat: 'd/m/Y',        // pt-BR display format
      allowInput: true,
      // Copy classes so the alt input inherits the same styling
      altInputClass: input.className,
      disableMobile: true,        // always use flatpickr even on mobile
      onChange: (_dates, dateStr) => {
        // Keep the original (hidden) input in sync so ngModel picks it up
        input.value = dateStr;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }) as Instance;
  }

  ngOnDestroy(): void {
    this.fp?.destroy();
  }
}
