import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LoggingService } from '../../../core/services/logging.service';
import { UserProfile } from '../../../core/models/interfaces/user-profile.interface';

@Component({
  selector: 'tsi-profile-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './profile-settings.component.html',
  styleUrls: ['./profile-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent implements OnInit {
  private readonly profileService = inject(UserProfileService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggingService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);

  readonly formName = signal('');

  ngOnInit(): void {
    const userId = this.auth.currentUser?.id;
    if (!userId) return;
    this.loading.set(true);
    this.profileService.getById(userId).subscribe({
      next: (p) => {
        this.profile.set(p);
        this.formName.set(p.fullName ?? '');
        this.loading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to load profile', err);
        this.loading.set(false);
      },
    });
  }

  save(): void {
    const userId = this.auth.currentUser?.id;
    if (!userId) return;
    this.saving.set(true);
    this.saved.set(false);
    this.profileService
      .upsert({ id: userId, fullName: this.formName() })
      .subscribe({
        next: (updated) => {
          this.profile.set(updated);
          this.saving.set(false);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 3000);
        },
        error: (err) => {
          this.logger.error('Failed to save profile', err);
          this.saving.set(false);
        },
      });
  }
}
