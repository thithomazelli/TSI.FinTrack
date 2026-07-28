import { Directive, ElementRef, OnInit, inject } from '@angular/core';

/**
 * Applied automatically to every <input type="date">.
 * Sets lang="pt-BR" on the element itself so the browser renders
 * the date picker and format in Portuguese (DD/MM/AAAA) regardless
 * of the OS/browser UI language.
 */
@Directive({ selector: 'input[type=date]', standalone: true })
export class DateLangDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  ngOnInit(): void {
    this.el.nativeElement.lang = 'pt-BR';
  }
}
