import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
    selector: 'tsi-settings-shell',
    imports: [RouterOutlet, RouterLink, RouterLinkActive],
    templateUrl: './settings-shell.component.html',
    styleUrls: ['./settings-shell.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsShellComponent {
  readonly tabs = [
    { path: '/settings/profile',      label: 'Perfil' },
    { path: '/settings/accounts',     label: 'Contas' },
    { path: '/settings/credit-cards', label: 'Cartões' },
    { path: '/settings/categories',   label: 'Categorias' },
    { path: '/settings/domains',      label: 'Domínios' },
    { path: '/settings/family',       label: 'Família' },
  ];
}
