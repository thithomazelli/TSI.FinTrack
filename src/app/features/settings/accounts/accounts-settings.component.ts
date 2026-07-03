import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountService } from '../../../core/services/account.service';
import { DomainListService } from '../../../core/services/domain-list.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Account } from '../../../core/models/interfaces/account.interface';
import { DomainList } from '../../../core/models/interfaces/domain-list.interface';

@Component({
    selector: 'tsi-accounts-settings',
    imports: [TranslatePipe, CurrencyPipe, FormsModule],
    templateUrl: './accounts-settings.component.html',
    styleUrls: ['./accounts-settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountsSettingsComponent implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly domainListService = inject(DomainListService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly accounts = signal<Account[]>([]);
  readonly accountTypes = signal<DomainList[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly deletingItem = signal<Account | null>(null);

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
        this.toast.success(id ? 'Conta atualizada com sucesso!' : 'Conta criada com sucesso!');
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save account', err);
        this.toast.error('Erro ao salvar conta.');
        this.saving.set(false);
      },
    });
  }

  confirmDelete(account: Account): void {
    this.deletingItem.set(account);
  }

  cancelDelete(): void {
    this.deletingItem.set(null);
  }

  archive(): void {
    const account = this.deletingItem();
    if (!account) return;
    this.saving.set(true);
    this.accountService.archive(account.id).subscribe({
      next: () => {
        this.toast.success('Conta arquivada.');
        this.deletingItem.set(null);
        this.saving.set(false);
        this.load();
      },
      error: err => {
        this.logger.error('Failed to archive account', err);
        this.toast.error('Erro ao arquivar conta.');
        this.saving.set(false);
      },
    });
  }

  restore(account: Account): void {
    this.accountService.restore(account.id).subscribe({
      next: () => {
        this.toast.success('Conta restaurada com sucesso!');
        this.load();
      },
      error: err => {
        this.logger.error('Failed to restore account', err);
        this.toast.error('Erro ao restaurar conta.');
      },
    });
  }

  typeName(typeId: string | null): string {
    return this.accountTypes().find(t => t.id === typeId)?.name ?? '';
  }
}
