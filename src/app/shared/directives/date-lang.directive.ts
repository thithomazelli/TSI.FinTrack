import { Directive, ElementRef, inject, effect } from '@angular/core';
import { LanguageService } from '../../core/services/language.service';

@Directive({
  selector: 'input[type=date]',
  standalone: true,
})
export class DateLangDirective {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private readonly lang = inject(LanguageService);

  constructor() {
    effect(() => {
      this.el.nativeElement.lang = this.lang.current();
    });
  }
}
