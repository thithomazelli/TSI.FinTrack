import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Language } from '../models/enums/language.enum';

const STORAGE_KEY = 'tsi_language';
const DEFAULT_LANGUAGE = Language.PtBR;

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly availableLanguages: Language[] = [Language.PtBR, Language.En];

  get currentLanguage(): Language {
    return (this.translate.currentLang ?? DEFAULT_LANGUAGE) as unknown as Language;
  }

  initialize(): void {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    const initial = saved ?? DEFAULT_LANGUAGE;
    this.translate.addLangs(this.availableLanguages);
    this.translate.use(initial);
  }

  setLanguage(lang: Language): void {
    this.translate.use(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }
}
