import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/entries':      'Entradas',
  '/transactions': 'Transações',
  '/credit-cards': 'Cartões de Crédito',
  '/savings':      'Poupança',
  '/goals':        'Metas',
  '/reports':      'Relatórios',
  '/import':       'Importar',
  '/settings':     'Configurações',
};

@Component({
  selector: 'tsi-header',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly session$ = this.authService.session$;
  readonly menuToggle = output<void>();

  get pageTitle(): string {
    const url = this.router.url.split('?')[0];
    return ROUTE_TITLES[url] ?? 'TSI FinTrack';
  }

  signOut(): void {
    this.authService.signOut().subscribe();
  }
}
