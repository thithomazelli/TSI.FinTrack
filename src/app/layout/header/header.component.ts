import {
  ChangeDetectionStrategy, Component, OnInit, OnDestroy,
  inject, output, signal, computed, HostListener, ElementRef, untracked, effect,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { AlertService, Alert } from '../../core/services/alert.service';
import { UserProfileService } from '../../core/services/user-profile.service';
import { BalanceService } from '../../core/services/balance.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { LanguageService } from '../../core/services/language.service';
import { Language } from '../../core/models/enums/language.enum';

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
  '/simulations':    'nav.simulations',
};

@Component({
    selector: 'tsi-header',
    imports: [DecimalPipe, TranslatePipe, RouterLink],
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit, OnDestroy {
  private routeSub: { unsubscribe(): void } | null = null;
  private readonly el = inject(ElementRef);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly balanceService = inject(BalanceService);
  private readonly profileService = inject(UserProfileService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService);
  readonly themeService = inject(ThemeService);
  readonly lang = inject(LanguageService);

  readonly session = this.authService.session;
  readonly menuToggle = output<void>();

  readonly alerts = signal<Alert[]>([]);
  readonly bellOpen = signal(false);
  readonly userMenuOpen = signal(false);

  readonly alertCount = computed(() => this.alerts().length);
  readonly previewAlerts = computed(() => this.alerts().slice(0, 5));

  // Balance popover
  readonly balanceOpen = signal(false);
  readonly availableBalance = signal<number | null>(null);
  readonly projectedBalance = signal<number | null>(null);
  readonly balanceSummary = signal<{ totalIncome: number; totalExpenses: number; balance: number } | null>(null);

  toggleBalance(): void { this.balanceOpen.update(v => !v); this.bellOpen.set(false); this.userMenuOpen.set(false); }
  closeBalance(): void { this.balanceOpen.set(false); }

  // User profile
  readonly avatarUrl = signal<string | null>(null);
  readonly fullName = signal('');
  readonly userEmail = signal('');
  readonly avatarUploading = signal(false);

  readonly pageTitleKey = signal(this.resolveTitle(this.router.url));

  private readonly now = new Date();
  private readonly year = this.now.getFullYear();
  private readonly month = this.now.getMonth() + 1;
  private readonly end = new Date(this.year, this.month, 0).toISOString().split('T')[0];

  constructor() {
    effect(() => {
      this.balanceService.version();
      untracked(() => this.fetchBalance());
    });
  }

  private resolveTitle(url: string): string {
    const path = url.split('?')[0].split('#')[0];
    const key = Object.keys(ROUTE_TITLE_KEYS)
      .filter(k => path === k || path.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0];
    return key ? ROUTE_TITLE_KEYS[key] : '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.bellOpen.set(false);
      this.userMenuOpen.set(false);
      this.balanceOpen.set(false);
    }
  }

  private async fetchBalance(): Promise<void> {
    const [available, projected, summary] = await Promise.all([
      this.balanceService.getAvailableBalance(),
      this.balanceService.getBalanceUpTo(this.end),
      this.balanceService.getSummary(this.year, this.month),
    ]);
    this.availableBalance.set(available);
    this.projectedBalance.set(projected);
    this.balanceSummary.set(summary);
  }

  ngOnInit(): void {
    this.routeSub = this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.pageTitleKey.set(this.resolveTitle(e.urlAfterRedirects));
      }
    });

    this.alertService.getAlerts(this.year, this.month).then(alerts => this.alerts.set(alerts));

    const user = this.authService.currentUser;
    if (user) {
      this.userEmail.set(user.email ?? '');
      this.profileService.getById(user.id).then(p => {
        this.fullName.set(p?.fullName ?? '');
        this.avatarUrl.set(p?.avatarUrl ?? null);
      });
    }
  }

  ngOnDestroy(): void { this.routeSub?.unsubscribe(); }

  toggleBell(): void { this.bellOpen.update(v => !v); this.userMenuOpen.set(false); this.balanceOpen.set(false); }
  closeBell(): void { this.bellOpen.set(false); }

  toggleUserMenu(): void { this.userMenuOpen.update(v => !v); this.bellOpen.set(false); this.balanceOpen.set(false); }
  closeUserMenu(): void { this.userMenuOpen.set(false); }

  signOut(): void {
    this.closeUserMenu();
    this.authService.signOut();
  }

  readonly Language = Language;
  setLang(code: Language): void { this.lang.setLanguage(code); }

  get avatarInitial(): string {
    return this.fullName()?.[0]?.toUpperCase() || this.userEmail()?.[0]?.toUpperCase() || '?';
  }

  pickFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => this.handleFileChange(e);
    input.click();
  }

  pickCamera(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'user');
    input.onchange = (e) => this.handleFileChange(e);
    input.click();
  }

  private async handleFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const user = this.authService.currentUser;
    if (!user) return;
    this.avatarUploading.set(true);
    try {
      const url = await this.profileService.uploadAvatar(user.id, file);
      await this.profileService.upsert({ id: user.id, avatarUrl: url, email: this.userEmail(), fullName: this.fullName() });
      this.avatarUrl.set(url);
      this.toast.success(this.t.instant('profile.saved'));
    } catch (err) {
      this.logger.error('Avatar upload failed', err);
      this.toast.error(this.t.instant('common.error.save'));
    } finally {
      this.avatarUploading.set(false);
    }
  }
}
