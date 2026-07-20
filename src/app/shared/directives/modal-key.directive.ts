import { AfterViewInit, Directive, ElementRef, HostListener, Input, inject } from '@angular/core';

/**
 * Apply to any <div class="modal"> to get Enter-to-save and Escape-to-close.
 * Keyboard events bubble up from child inputs, so no document-level listener needed.
 */
@Directive({ selector: '[tsiModalKey]', standalone: true })
export class ModalKeyDirective implements AfterViewInit {
  @Input('tsiModalKeyEnter')  onEnter?:  () => void;
  @Input('tsiModalKeyEscape') onEscape?: () => void;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    const el = this.el.nativeElement;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  @HostListener('keydown', ['$event'])
  handle(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onEscape?.();
      return;
    }
    if (event.key === 'Enter' && this.onEnter) {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      event.preventDefault();
      this.onEnter();
    }
  }
}
