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
      allowInput: true,
      disableMobile: true,
      onChange: (_dates, dateStr) => {
        input.value = dateStr;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }) as Instance;

    // When Angular writes to ngModel it sets input.value directly (no DOM event).
    // Override the value setter so flatpickr stays in sync with model changes.
    const fp = this.fp!;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(input, 'value', {
      get: descriptor.get,
      set(v: string) {
        descriptor.set!.call(this, v);
        if (v) fp.setDate(v, false);   // false = don't fire onChange again
        else   fp.clear(false);
      },
    });

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
      alt.placeholder = 'DD/MM/AAAA';
      this.attachMask(alt);
    }
  }

  /** DD/MM/AAAA mask — auto-inserts slashes, blocks non-digits. */
  private attachMask(alt: HTMLInputElement): void {
    alt.addEventListener('keydown', (e: KeyboardEvent) => {
      const allowed = /^[0-9]$/.test(e.key) ||
        ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
      if (!allowed) e.preventDefault();
    });

    alt.addEventListener('input', () => {
      const pos = alt.selectionStart ?? alt.value.length;
      const digits = alt.value.replace(/\D/g, '').slice(0, 8);
      let masked = digits;
      if (digits.length > 4) masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      else if (digits.length > 2) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      alt.value = masked;
      // Restore cursor: count forward past auto-inserted slashes
      const newPos = pos + (masked.length - (alt.value.replace(/\//g, '').length + (masked.match(/\//g) ?? []).length - (digits.length - masked.replace(/\D/g, '').length)));
      alt.setSelectionRange(Math.min(pos, masked.length), Math.min(pos, masked.length));
    });
  }

  ngOnDestroy(): void {
    this.fp?.destroy();
  }
}
