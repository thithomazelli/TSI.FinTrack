import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit,
  inject, output, signal, computed, ViewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { AlertService, Alert } from '../../core/services/alert.service';
import { UserProfileService } from '../../core/services/user-profile.service';
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
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly profileService = inject(UserProfileService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService);
  readonly themeService = inject(ThemeService);
  readonly lang = inject(LanguageService);

  readonly session$ = this.authService.session$;
  readonly menuToggle = output<void>();

  readonly alerts = signal<Alert[]>([]);
  readonly bellOpen = signal(false);
  readonly userMenuOpen = signal(false);

  readonly alertCount = computed(() => this.alerts().length);
  readonly previewAlerts = computed(() => this.alerts().slice(0, 5));

  // User profile
  readonly avatarUrl = signal<string | null>(null);
  readonly fullName = signal('');
  readonly userEmail = signal('');
  readonly avatarUploading = signal(false);

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
    const user = this.authService.currentUser;
    if (user) {
      this.userEmail.set(user.email ?? '');
      this.profileService.getById(user.id).subscribe({
        next: p => {
          this.fullName.set(p.fullName ?? '');
          this.avatarUrl.set(p.avatarUrl ?? null);
        },
        error: () => {},
      });
    }
  }

  toggleBell(): void { this.bellOpen.update(v => !v); this.userMenuOpen.set(false); }
  closeBell(): void { this.bellOpen.set(false); }

  toggleUserMenu(): void { this.userMenuOpen.update(v => !v); this.bellOpen.set(false); }
  closeUserMenu(): void { this.userMenuOpen.set(false); }

  signOut(): void {
    this.closeUserMenu();
    this.authService.signOut().subscribe();
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

  private handleFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const user = this.authService.currentUser;
    if (!user) return;
    this.avatarUploading.set(true);
    this.profileService.uploadAvatar(user.id, file).subscribe({
      next: (url) => {
        this.profileService.upsert({ id: user.id, avatarUrl: url }).subscribe({
          next: () => {
            this.avatarUrl.set(url);
            this.avatarUploading.set(false);
            this.toast.success(this.t.instant('profile.saved'));
          },
          error: () => { this.avatarUploading.set(false); this.toast.error(this.t.instant('common.error.save')); },
        });
      },
      error: (err) => {
        this.logger.error('Avatar upload failed', err);
        this.avatarUploading.set(false);
        this.toast.error(this.t.instant('common.error.save'));
      },
    });
  }
}
