import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then(m => m.LoginComponent),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'entries',
        loadComponent: () =>
          import('./features/entries/entries.component').then(m => m.EntriesComponent),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then(m => m.TransactionsComponent),
      },
      {
        path: 'credit-cards',
        loadComponent: () =>
          import('./features/credit-cards/credit-cards.component').then(m => m.CreditCardsComponent),
      },
      {
        path: 'savings',
        loadComponent: () =>
          import('./features/savings/savings.component').then(m => m.SavingsComponent),
      },
      {
        path: 'goals',
        loadComponent: () =>
          import('./features/goals/goals.component').then(m => m.GoalsComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then(m => m.ReportsComponent),
      },
      {
        path: 'import',
        loadComponent: () =>
          import('./features/import/import.component').then(m => m.ImportComponent),
      },
      {
        path: 'settings',
        children: [
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/settings/profile/profile-settings.component').then(m => m.ProfileSettingsComponent),
          },
          {
            path: 'family',
            loadComponent: () =>
              import('./features/settings/family/family-settings.component').then(m => m.FamilySettingsComponent),
          },
          {
            path: 'accounts',
            loadComponent: () =>
              import('./features/settings/accounts/accounts-settings.component').then(m => m.AccountsSettingsComponent),
          },
          {
            path: 'credit-cards',
            loadComponent: () =>
              import('./features/settings/credit-cards/credit-cards-settings.component').then(m => m.CreditCardsSettingsComponent),
          },
          {
            path: 'categories',
            loadComponent: () =>
              import('./features/settings/categories/categories-settings.component').then(m => m.CategoriesSettingsComponent),
          },
          {
            path: 'goals',
            loadComponent: () =>
              import('./features/settings/goals/goals-settings.component').then(m => m.GoalsSettingsComponent),
          },
          {
            path: 'domains',
            loadComponent: () =>
              import('./features/settings/domains/domains-settings.component').then(m => m.DomainsSettingsComponent),
          },
          { path: '', redirectTo: 'profile', pathMatch: 'full' },
        ],
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '/dashboard' },
];
