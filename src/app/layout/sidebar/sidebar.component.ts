import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'tsi-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly navItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/entries', label: 'Entradas' },
    { path: '/transactions', label: 'Transações' },
    { path: '/credit-cards', label: 'Cartões' },
    { path: '/savings', label: 'Poupança' },
    { path: '/goals', label: 'Metas' },
    { path: '/reports', label: 'Relatórios' },
    { path: '/import', label: 'Importar' },
    { path: '/settings', label: 'Configurações' },
  ];
}
