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
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      altInputClass: input.className,
      allowInput: false,
      disableMobile: true,
      onChange: (_dates, dateStr) => {
        input.value = dateStr;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }) as Instance;

    // The altInput is created outside Angular's view, so it has no _ngcontent-*
    // attribute and component-scoped CSS won't apply. Copy all attributes from
    // the original input (including _ngcontent-* and placeholder) so scoped
    // styles work correctly.
    const alt = input.nextElementSibling as HTMLInputElement | null;
    if (alt) {
      for (const attr of Array.from(input.attributes)) {
        if (attr.name === 'type' || attr.name === 'class' || attr.name === 'style') continue;
        alt.setAttribute(attr.name, attr.value);
      }
    }
  }

  ngOnDestroy(): void {
    this.fp?.destroy();
  }
}
