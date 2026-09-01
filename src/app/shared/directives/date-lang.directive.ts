import { Directive, ElementRef, OnInit, inject } from '@angular/core';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_PT   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

/**
 * Applied automatically to every <input type="date">.
 *
 * Converts the input to type="text" at runtime and handles the
 * DD/MM/AAAA ↔ YYYY-MM-DD translation transparently, so all existing
 * [(ngModel)] bindings continue to work with ISO dates unchanged.
 *
 * A custom calendar popup (fully in Portuguese) opens when the user
 * clicks the calendar icon injected at the right edge of the input.
 * The original placeholder is preserved so floating-label CSS works.
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

    if (isoValue) nativeSet.call(input, toDisplay(isoValue));

    // ── Ensure parent is a positioning context for the absolute button ─────────
    const parent = input.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

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
    input.insertAdjacentElement('afterend', btn);

    input.style.paddingRight = '2.2rem';

    // ── Value property override ───────────────────────────────────────────────
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return isoValue; },
      set(v: string) {
        isoValue = v ?? '';
        nativeSet.call(input, v ? toDisplay(v) : '');
      },
    });

    // ── Keyboard mask ─────────────────────────────────────────────────────────
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      const nav = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight',
                   'ArrowUp','ArrowDown','Home','End'].includes(e.key);
      if (!nav && !/^\d$/.test(e.key)) e.preventDefault();
    });

    input.addEventListener('input', () => {
      const raw    = nativeGet.call(input);
      const digits = raw.replace(/\D/g, '').slice(0, 8);
      let masked   = digits;
      if (digits.length > 4) masked = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
      else if (digits.length > 2) masked = `${digits.slice(0,2)}/${digits.slice(2)}`;

      const rawSel       = input.selectionStart ?? raw.length;
      const digitsBefore = raw.slice(0, rawSel).replace(/\D/g, '').length;
      const maskedCursor = digitsBefore <= 2 ? digitsBefore
                         : digitsBefore <= 4 ? digitsBefore + 1
                         :                     digitsBefore + 2;

      nativeSet.call(input, masked);
      const clamped = Math.min(maskedCursor, masked.length);
      input.setSelectionRange(clamped, clamped);

      isoValue = toISO(masked);
    }, { capture: true });

    // ── Custom calendar popup ─────────────────────────────────────────────────
    let popup: HTMLElement | null = null;
    let popupYear  = 0;
    let popupMonth = 0;

    const closePopup = () => { popup?.remove(); popup = null; };

    const openPopup = () => {
      closePopup();
      const now   = isoValue ? new Date(isoValue + 'T12:00:00') : new Date();
      popupYear   = now.getFullYear();
      popupMonth  = now.getMonth();
      popup = buildPopup();
      document.body.appendChild(popup);
      positionPopup();
    };

    const positionPopup = () => {
      if (!popup) return;
      const rect = input.getBoundingClientRect();
      const ph   = popup.offsetHeight || 290;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top  = spaceBelow >= ph + 8
        ? rect.bottom + window.scrollY + 4
        : rect.top   + window.scrollY - ph - 4;
      popup.style.top  = `${top}px`;
      popup.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 290)}px`;
    };

    const buildPopup = (): HTMLElement => {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;z-index:9999;background:var(--color-surface);' +
        'border:1px solid var(--color-border);border-radius:10px;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px;width:268px;' +
        'font-family:inherit;font-size:.85rem;color:var(--color-text);';
      el.addEventListener('mousedown', e => e.preventDefault()); // don't blur input

      const renderMonth = () => {
        el.innerHTML = '';

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

        const prev = navBtn('‹');
        prev.addEventListener('click', (e) => {
          e.stopPropagation();
          popupMonth--;
          if (popupMonth < 0) { popupMonth = 11; popupYear--; }
          renderMonth();
        });

        const title = document.createElement('span');
        title.style.cssText = 'font-weight:600;font-size:.9rem;cursor:pointer;';
        title.textContent = `${MONTHS_PT[popupMonth]} ${popupYear}`;

        const next = navBtn('›');
        next.addEventListener('click', (e) => {
          e.stopPropagation();
          popupMonth++;
          if (popupMonth > 11) { popupMonth = 0; popupYear++; }
          renderMonth();
        });

        hdr.append(prev, title, next);
        el.appendChild(hdr);

        // Weekday headers
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;';
        DAYS_PT.forEach(d => {
          const s = document.createElement('span');
          s.style.cssText = 'font-size:.72rem;font-weight:600;color:var(--color-text-3);padding:4px 0;';
          s.textContent = d;
          grid.appendChild(s);
        });

        // Days
        const firstDay = new Date(popupYear, popupMonth, 1).getDay();
        const daysInMonth = new Date(popupYear, popupMonth + 1, 0).getDate();
        const today = new Date();
        const selDate = isoValue ? new Date(isoValue + 'T12:00:00') : null;

        for (let i = 0; i < firstDay; i++) {
          grid.appendChild(document.createElement('span'));
        }

        for (let d = 1; d <= daysInMonth; d++) {
          const dayBtn = document.createElement('button');
          dayBtn.type = 'button';
          dayBtn.textContent = String(d);

          const isToday = d === today.getDate() && popupMonth === today.getMonth() && popupYear === today.getFullYear();
          const isSel   = selDate && d === selDate.getDate() && popupMonth === selDate.getMonth() && popupYear === selDate.getFullYear();

          dayBtn.style.cssText =
            'border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;' +
            'font-size:.82rem;transition:background .12s;' +
            (isSel   ? 'background:var(--color-accent);color:#fff;font-weight:700;'
            : isToday ? 'background:var(--color-accent-soft);color:var(--color-accent);font-weight:600;'
            :           'background:transparent;color:var(--color-text);');

          dayBtn.addEventListener('mouseenter', () => {
            if (!isSel) dayBtn.style.background = 'var(--color-surface-2)';
          });
          dayBtn.addEventListener('mouseleave', () => {
            if (!isSel) dayBtn.style.background = isToday ? 'var(--color-accent-soft)' : 'transparent';
          });

          dayBtn.addEventListener('click', () => {
            const mm  = String(popupMonth + 1).padStart(2, '0');
            const dd  = String(d).padStart(2, '0');
            isoValue  = `${popupYear}-${mm}-${dd}`;
            nativeSet.call(input, toDisplay(isoValue));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            closePopup();
          });

          grid.appendChild(dayBtn);
        }

        el.appendChild(grid);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:space-between;margin-top:10px;border-top:1px solid var(--color-border);padding-top:8px;';

        const clearBtn = footerBtn('Limpar');
        clearBtn.addEventListener('click', () => {
          isoValue = '';
          nativeSet.call(input, '');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          closePopup();
        });

        const todayBtn = footerBtn('Hoje');
        todayBtn.addEventListener('click', () => {
          const t  = new Date();
          const mm = String(t.getMonth() + 1).padStart(2, '0');
          const dd = String(t.getDate()).padStart(2, '0');
          isoValue = `${t.getFullYear()}-${mm}-${dd}`;
          nativeSet.call(input, toDisplay(isoValue));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          closePopup();
        });

        footer.append(clearBtn, todayBtn);
        el.appendChild(footer);
      };

      renderMonth();
      return el;
    };

    btn.addEventListener('click', () => {
      if (popup) { closePopup(); } else { openPopup(); }
    });

    // Close on outside click
    document.addEventListener('click', (e: MouseEvent) => {
      if (popup && !popup.contains(e.target as Node) && !btn.contains(e.target as Node)) {
        closePopup();
      }
    });
  }
}

function navBtn(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    'background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--color-text-2);' +
    'padding:2px 8px;border-radius:4px;line-height:1;';
  return b;
}

function footerBtn(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    'background:none;border:none;cursor:pointer;font-size:.82rem;' +
    'color:var(--color-accent);font-weight:600;padding:2px 4px;';
  return b;
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
