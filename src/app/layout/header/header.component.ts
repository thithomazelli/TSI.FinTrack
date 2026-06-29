import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher.component';

const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/dashboard':    'nav.dashboard',
  '/movimentos':   'nav.movements',
  '/credit-cards': 'nav.creditCards',
  '/bills':        'nav.bills',
  '/savings':      'nav.savings',
  '/goals':        'nav.goals',
  '/recurring':    'nav.recurring',
  '/reports':      'nav.reports',
  '/import':       'nav.import',
  '/settings':     'nav.settings',
};

@Component({
  selector: 'tsi-header',
  standalone: true,
  imports: [AsyncPipe, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  readonly session$ = this.authService.session$;
  readonly menuToggle = output<void>();

  get pageTitleKey(): string {
    const url = this.router.url.split('?')[0];
    return ROUTE_TITLE_KEYS[url] ?? '';
  }

  signOut(): void {
    this.authService.signOut().subscribe();
  }
}
