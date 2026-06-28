import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { TelegramService, TelegramSubscription } from '../../../core/services/telegram.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'tsi-profile-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-settings.component.html',
  styleUrls: ['./profile-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(UserProfileService);
  private readonly telegramService = inject(TelegramService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);

  readonly fullName = signal('');
  readonly email = signal('');

  readonly telegramSub = signal<TelegramSubscription | null>(null);
  readonly telegramLoading = signal(false);
  readonly telegramLinkUrl = signal<string | null>(null);
  readonly telegramToken = signal<string | null>(null);
  readonly telegramError = signal<string | null>(null);
  readonly copied = signal(false);
  readonly telegramNotifications = signal(true);

  readonly botUsername = (environment as Record<string, unknown>)['telegramBotUsername'] as string | undefined ?? 'TSIFinTrackBot';

  ngOnInit(): void {
    const user = this.auth.currentUser;
    if (!user) return;

    this.email.set(user.email ?? '');
    this.loading.set(true);

    this.profileService.getById(user.id).subscribe({
      next: (profile) => {
        this.fullName.set(profile.fullName ?? '');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.telegramLoading.set(true);
    this.telegramService.getSubscription(user.id).subscribe({
      next: (sub) => {
        this.telegramSub.set(sub);
        if (sub) this.telegramNotifications.set(sub.notificationsEnabled);
        this.telegramLoading.set(false);
      },
      error: () => this.telegramLoading.set(false),
    });
  }

  saveProfile(): void {
    const user = this.auth.currentUser;
    if (!user) return;
    this.saving.set(true);
    this.profileService.upsert({ id: user.id, fullName: this.fullName(), email: user.email ?? '' }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
        this.toast.success('Perfil salvo com sucesso!');
      },
      error: (err) => {
        this.logger.error('Failed to save profile', err);
        this.saving.set(false);
        this.toast.error('Erro ao salvar perfil.');
      },
    });
  }

  generateTelegramLink(): void {
    const user = this.auth.currentUser;
    if (!user) return;
    this.telegramLoading.set(true);
    this.telegramService.generateLinkToken(user.id, this.botUsername).subscribe({
      next: ({ url, token }) => {
        this.telegramLinkUrl.set(url);
        this.telegramToken.set(token);
        this.telegramError.set(null);
        this.telegramLoading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to generate Telegram link', err);
        this.telegramError.set(err?.message ?? 'Erro ao gerar token. Verifique o console.');
        this.telegramLoading.set(false);
      },
    });
  }

  disconnectTelegram(): void {
    const user = this.auth.currentUser;
    if (!user) return;
    this.telegramLoading.set(true);
    this.telegramService.disconnect(user.id).subscribe({
      next: () => {
        this.telegramSub.set(null);
        this.telegramLinkUrl.set(null);
        this.telegramToken.set(null);
        this.telegramLoading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to disconnect Telegram', err);
        this.telegramLoading.set(false);
      },
    });
  }

  copyToken(): void {
    const token = this.telegramToken();
    if (!token) return;
    navigator.clipboard.writeText(`/start ${token}`).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    });
  }

  toggleNotifications(): void {
    const user = this.auth.currentUser;
    const sub = this.telegramSub();
    if (!user || !sub) return;
    const newValue = !this.telegramNotifications();
    this.telegramNotifications.set(newValue);
    this.telegramService.setNotifications(user.id, newValue).subscribe({
      error: (err) => {
        this.logger.error('Failed to update notifications', err);
        this.telegramNotifications.set(!newValue);
      },
    });
  }
}
