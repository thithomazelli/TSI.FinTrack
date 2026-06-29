import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Language } from '../models/enums/language.enum';

const STORAGE_KEY = 'tsi_language';
const DEFAULT_LANGUAGE = Language.PtBR;

export interface LanguageOption {
  code: Language;
  label: string;
  flag: string;
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  /** Lista de idiomas suportados (expansível: basta adicionar aqui + arquivo i18n). */
  readonly languages: LanguageOption[] = [
    { code: Language.PtBR, label: 'Português', flag: '🇧🇷' },
    { code: Language.En, label: 'English', flag: '🇺🇸' },
  ];

  /** Idioma atual como signal reativo. */
  readonly current = signal<Language>(DEFAULT_LANGUAGE);

  get availableLanguages(): Language[] {
    return this.languages.map(l => l.code);
  }

  get currentLanguage(): Language {
    return this.current();
  }

  initialize(): void {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    const initial = saved && this.availableLanguages.includes(saved) ? saved : DEFAULT_LANGUAGE;
    this.translate.addLangs(this.availableLanguages);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE);
    this.translate.use(initial);
    this.current.set(initial);
    document.documentElement.lang = initial;
  }

  setLanguage(lang: Language): void {
    this.translate.use(lang);
    this.current.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }

  optionFor(code: Language): LanguageOption {
    return this.languages.find(l => l.code === code) ?? this.languages[0];
  }
}
