import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import flatpickr from 'flatpickr';
import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
import { Instance } from 'flatpickr/dist/types/instance';

/**
 * Applied automatically to every <input type="date">.
 * Replaces the native picker with flatpickr (pt-BR), showing DD/MM/YYYY to the
 * user while keeping YYYY-MM-DD as the ngModel value — no existing bindings change.
 */
@Directive({ selector: 'input[type=date]', standalone: true })
export class DateLangDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private fp: Instance | null = null;

  ngOnInit(): void {
    const input = this.el.nativeElement as HTMLInputElement;

    this.fp = flatpickr(input, {
      locale: Portuguese,
      dateFormat: 'Y-m-d',       // ISO value kept for ngModel
      altInput: true,            // visible input shows friendly format
      altFormat: 'd/m/Y',
      altInputClass: input.className,
      allowInput: true,
      disableMobile: true,
      onChange: (_dates, dateStr) => {
        input.value = dateStr;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }) as Instance;

    // Copy placeholder to the alt input after flatpickr creates it
    const alt = input.nextElementSibling as HTMLInputElement | null;
    if (alt && input.placeholder) alt.placeholder = input.placeholder;
  }

  ngOnDestroy(): void {
    this.fp?.destroy();
  }
}
