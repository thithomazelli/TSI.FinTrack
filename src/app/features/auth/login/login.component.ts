import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { LoggingService } from '../../../core/services/logging.service';

@Component({
  selector: 'tsi-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly logger = inject(LoggingService);

  signInWithGoogle(): void {
    this.logger.info('User signing in with Google');
    this.authService.signInWithGoogle().subscribe({
      error: err => this.logger.error('Google sign-in failed', err),
    });
  }

  signInWithApple(): void {
    this.logger.info('User signing in with Apple');
    this.authService.signInWithApple().subscribe({
      error: err => this.logger.error('Apple sign-in failed', err),
    });
  }
}
