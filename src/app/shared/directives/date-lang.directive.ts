import { Directive, ElementRef, OnInit, inject } from '@angular/core';

/**
 * Applied automatically to every <input type="date">.
 *
 * Converts the input to type="text" at runtime and handles the
 * DD/MM/AAAA ↔ YYYY-MM-DD translation transparently, so all existing
 * [(ngModel)] bindings continue to work with ISO dates unchanged.
 */
@Directive({ selector: 'input[type=date]', standalone: true })
export class DateLangDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  ngOnInit(): void {
    const input = this.el.nativeElement as HTMLInputElement;
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const nativeSet = nativeDescriptor.set!;
    const nativeGet = nativeDescriptor.get!;

    // The ISO value (YYYY-MM-DD) stored separately so the getter can return it.
    let isoValue = input.value ?? '';

    // Switch to text so browser locale no longer controls display.
    input.setAttribute('type', 'text');
    input.placeholder = 'DD/MM/AAAA';

    // Show current value as DD/MM/AAAA if already set.
    if (isoValue) nativeSet.call(input, toDisplay(isoValue));

    // Override value property:
    //   getter → returns ISO (what ngModel reads)
    //   setter → stores ISO and renders DD/MM/AAAA (what Angular writes)
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return isoValue; },
      set(v: string) {
        isoValue = v ?? '';
        nativeSet.call(input, v ? toDisplay(v) : '');
      },
    });

    // Mask: only digits, auto-insert slashes.
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      const nav = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight',
                   'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key);
      if (!nav && !/^\d$/.test(e.key)) e.preventDefault();
    });

    // capture: true → fires before Angular's bubble-phase ngModel listener,
    // so isoValue is up-to-date when Angular reads input.value.
    input.addEventListener('input', () => {
      const raw    = nativeGet.call(input);          // what browser shows
      const digits = raw.replace(/\D/g, '').slice(0, 8);
      let masked   = digits;
      if (digits.length > 4) masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      else if (digits.length > 2) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;

      const sel = input.selectionStart ?? masked.length;
      nativeSet.call(input, masked);
      input.setSelectionRange(Math.min(sel, masked.length), Math.min(sel, masked.length));

      // Update ISO store before Angular reads input.value via its own listener.
      isoValue = toISO(masked);
    }, { capture: true });
  }
}

function toDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toISO(display: string): string {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(display)) return '';
  const [d, m, y] = display.split('/');
  return `${y}-${m}-${d}`;
}
