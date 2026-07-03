import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LanguageService } from '../../../core/services/language.service';
import { Language } from '../../../core/models/enums/language.enum';

@Component({
    selector: 'tsi-language-switcher',
    imports: [],
    templateUrl: './language-switcher.component.html',
    styleUrls: ['./language-switcher.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageSwitcherComponent {
  readonly lang = inject(LanguageService);

  /** 'compact' = só bandeiras (sidebar/nav); 'full' = bandeira + nome (configurações). */
  readonly variant = input<'compact' | 'full'>('compact');

  select(code: Language): void {
    this.lang.setLanguage(code);
  }
}
