import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../core/services/account.service';
import { DomainListService } from '../../../core/services/domain-list.service';
import { LoggingService } from '../../../core/services/logging.service';
import { Account } from '../../../core/models/interfaces/account.interface';
import { DomainList } from '../../../core/models/interfaces/domain-list.interface';

@Component({
  selector: 'tsi-accounts-settings',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslatePipe],
  templateUrl: './accounts-settings.component.html',
  styleUrls: ['./accounts-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsSettingsComponent implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly domainListService = inject(DomainListService);
  private readonly logger = inject(LoggingService);

  readonly accounts = signal<Account[]>([]);
  readonly accountTypes = signal<DomainList[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);

  formName = '';
  formTypeId = '';
  formBalance = 0;

  ngOnInit(): void {
    this.domainListService.getByCode('account_type').subscribe({
      next: types => this.accountTypes.set(types),
      error: err => this.logger.error('Failed to load account types', err),
    });
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.accountService.getAll(this.showArchived()).subscribe({
      next: data => {
        this.accounts.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.logger.error('Failed to load accounts', err);
        this.loading.set(false);
      },
    });
  }

  toggleArchived(): void {
    this.showArchived.update(v => !v);
    this.load();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName = '';
    this.formTypeId = this.accountTypes()[0]?.id ?? '';
    this.formBalance = 0;
    this.showForm.set(true);
  }

  openEdit(account: Account): void {
    this.editingId.set(account.id);
    this.formName = account.name;
    this.formTypeId = account.typeId ?? '';
    this.formBalance = account.balance;
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formName.trim()) return;
    this.saving.set(true);
    const payload = { name: this.formName.trim(), typeId: this.formTypeId, balance: this.formBalance };
    const id = this.editingId();

    const op$ = id
      ? this.accountService.update(id, payload)
      : this.accountService.create(payload);

    op$.subscribe({
      next: saved => {
        this.accounts.update(list =>
          id ? list.map(a => (a.id === id ? saved : a)) : [...list, saved]
        );
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save account', err);
        this.saving.set(false);
      },
    });
  }

  archive(account: Account): void {
    this.accountService.archive(account.id).subscribe({
      next: () => this.load(),
      error: err => this.logger.error('Failed to archive account', err),
    });
  }

  restore(account: Account): void {
    this.accountService.restore(account.id).subscribe({
      next: () => this.load(),
      error: err => this.logger.error('Failed to restore account', err),
    });
  }

  typeName(typeId: string | null): string {
    return this.accountTypes().find(t => t.id === typeId)?.name ?? '';
  }
}
