import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'tsi-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly navItems = [
    { path: '/dashboard', labelKey: 'nav.dashboard' },
    { path: '/entries', labelKey: 'nav.entries' },
    { path: '/transactions', labelKey: 'nav.transactions' },
    { path: '/credit-cards', labelKey: 'nav.creditCards' },
    { path: '/savings', labelKey: 'nav.savings' },
    { path: '/goals', labelKey: 'nav.goals' },
    { path: '/reports', labelKey: 'nav.reports' },
    { path: '/import', labelKey: 'nav.import' },
    { path: '/settings', labelKey: 'nav.settings' },
  ];
}
