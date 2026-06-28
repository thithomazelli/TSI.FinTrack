import { Injectable, signal } from '@angular/core';

const KEY = 'tsi-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem(KEY);
    // Default is light mode; only go dark if user explicitly chose it
    const dark = saved === 'dark';
    this.apply(dark);
  }

  toggle(): void {
    this.apply(!this.isDark());
  }

  private apply(dark: boolean): void {
    this.isDark.set(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
  }
}
