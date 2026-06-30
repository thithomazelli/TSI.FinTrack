import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal, computed } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { AlertService, Alert } from '../../core/services/alert.service';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher.component';

const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/dashboard':      'nav.dashboard',
  '/movimentos':     'nav.movements',
  '/credit-cards':   'nav.creditCards',
  '/bills':          'nav.bills',
  '/savings':        'nav.savings',
  '/goals':          'nav.goals',
  '/recurring':      'nav.recurring',
  '/reports':        'nav.reports',
  '/import':         'nav.import',
  '/settings':       'nav.settings',
  '/notifications':  'nav.notifications',
};

@Component({
  selector: 'tsi-header',
  standalone: true,
  imports: [AsyncPipe, TranslatePipe, LanguageSwitcherComponent, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  readonly themeService = inject(ThemeService);

  readonly session$ = this.authService.session$;
  readonly menuToggle = output<void>();

  readonly alerts = signal<Alert[]>([]);
  readonly bellOpen = signal(false);

  readonly alertCount = computed(() => this.alerts().length);
  readonly previewAlerts = computed(() => this.alerts().slice(0, 5));

  get pageTitleKey(): string {
    const url = this.router.url.split('?')[0];
    return ROUTE_TITLE_KEYS[url] ?? '';
  }

  ngOnInit(): void {
    const now = new Date();
    this.alertService.getAlerts(now.getFullYear(), now.getMonth() + 1).subscribe({
      next: alerts => this.alerts.set(alerts),
      error: () => {},
    });
  }

  toggleBell(): void {
    this.bellOpen.update(v => !v);
  }

  closeBell(): void {
    this.bellOpen.set(false);
  }

  signOut(): void {
    this.authService.signOut().subscribe();
  }
}
