import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { Language } from '../../core/models/enums/language.enum';

@Component({
  selector: 'tsi-header',
  standalone: true,
  imports: [AsyncPipe, TranslatePipe],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly authService = inject(AuthService);
  readonly languageService = inject(LanguageService);
  readonly session$ = this.authService.session$;
  readonly Language = Language;

  signOut(): void {
    this.authService.signOut().subscribe();
  }

  setLanguage(lang: Language): void {
    this.languageService.setLanguage(lang);
  }
}
