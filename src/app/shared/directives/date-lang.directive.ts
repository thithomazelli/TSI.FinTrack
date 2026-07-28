import { Directive, ElementRef, OnInit, inject } from '@angular/core';

/**
 * Applied automatically to every <input type="date">.
 *
 * Converts the input to type="text" at runtime and handles the
 * DD/MM/AAAA ↔ YYYY-MM-DD translation transparently, so all existing
 * [(ngModel)] bindings continue to work with ISO dates unchanged.
 *
 * A hidden <input type="date"> sibling is injected and opened via a
 * calendar icon button, so the native picker remains accessible.
 * The original placeholder attribute is preserved so floating-label CSS
 * (which relies on :not(:placeholder-shown)) continues to work.
 */
@Directive({ selector: 'input[type=date]', standalone: true })
export class DateLangDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  ngOnInit(): void {
    const input = this.el.nativeElement as HTMLInputElement;
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const nativeSet = nativeDescriptor.set!;
    const nativeGet = nativeDescriptor.get!;

    let isoValue = input.value ?? '';

    input.setAttribute('type', 'text');
    // Preserve the original placeholder (e.g. " ") so floating-label CSS works.
    // Do NOT set input.placeholder = 'DD/MM/AAAA' here.

    if (isoValue) nativeSet.call(input, toDisplay(isoValue));

    // ── Hidden date input for the native calendar picker ─────────────────────
    const hiddenDate = document.createElement('input');
    hiddenDate.type = 'date';
    hiddenDate.style.cssText =
      'position:absolute;width:1px;height:1px;opacity:.01;pointer-events:none;' +
      'overflow:hidden;border:0;padding:0;margin:0;top:0;left:0;';
    input.insertAdjacentElement('afterend', hiddenDate);
    if (isoValue) hiddenDate.value = isoValue;

    // ── Calendar icon button ──────────────────────────────────────────────────
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Abrir calendário');
    btn.style.cssText =
      'position:absolute;right:0.5rem;top:50%;transform:translateY(-50%);' +
      'background:none;border:none;cursor:pointer;padding:0.2rem;line-height:1;' +
      'color:var(--color-text-3);display:flex;align-items:center;z-index:1;';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">' +
      '<path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>' +
      '</svg>';
    hiddenDate.insertAdjacentElement('afterend', btn);

    // Reserve space on the right so text doesn't overlap the icon.
    input.style.paddingRight = '2.2rem';

    // ── Value property override ───────────────────────────────────────────────
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return isoValue; },
      set(v: string) {
        isoValue = v ?? '';
        nativeSet.call(input, v ? toDisplay(v) : '');
        hiddenDate.value = isoValue;
      },
    });

    // ── Keyboard mask: digits only + auto-slashes ─────────────────────────────
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

      isoValue = toISO(masked);
      hiddenDate.value = isoValue;
    }, { capture: true });

    // ── Calendar button: open native picker ───────────────────────────────────
    btn.addEventListener('click', () => {
      try { hiddenDate.showPicker(); } catch { /* browser may not support */ }
    });

    // ── Hidden date picker: propagate selection back to text input ────────────
    hiddenDate.addEventListener('change', () => {
      const iso = hiddenDate.value; // YYYY-MM-DD
      isoValue = iso;
      nativeSet.call(input, iso ? toDisplay(iso) : '');
      // Notify Angular's ngModel (capture listener re-masks + sets isoValue,
      // then bubble listener reads input.value → isoValue → updates model).
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
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
