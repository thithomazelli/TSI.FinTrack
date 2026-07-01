import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SavingsService } from '../../core/services/savings.service';
import { DomainListService } from '../../core/services/domain-list.service';
import { AccountService } from '../../core/services/account.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { SavingsMovement } from '../../core/models/interfaces/savings-movement.interface';
import { DomainList } from '../../core/models/interfaces/domain-list.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { BalanceCardComponent } from '../../shared/components/balance-card/balance-card.component';

@Component({
  selector: 'tsi-savings',
  standalone: true,
  imports: [DecimalPipe, SlicePipe, FormsModule, TranslatePipe, MonthPickerComponent, BalanceCardComponent],
  templateUrl: './savings.component.html',
  styleUrls: ['./savings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsComponent implements OnInit {
  private readonly savingsService = inject(SavingsService);
  private readonly domainService = inject(DomainListService);
  private readonly accountService = inject(AccountService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly allMovements = signal<SavingsMovement[]>([]);
  readonly monthMovements = signal<SavingsMovement[]>([]);
  readonly types = signal<DomainList[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly deletingId = signal<string | null>(null);

  readonly filterTypeId = signal('');

  readonly formDescription = signal('');
  readonly formAmount = signal<number | null>(null);
  readonly formDate = signal(new Date().toISOString().split('T')[0]);
  readonly formTypeId = signal('');
  readonly formAccountId = signal('');

  readonly cumulativeBalance = computed(() =>
    this.allMovements().reduce((sum, m) => {
      const code = this.types().find((t) => t.id === m.typeId)?.code ?? '';
      return code === 'WITHDRAWAL' ? sum - m.amount : sum + m.amount;
    }, 0)
  );

  readonly filteredMovements = computed(() => {
    const typeId = this.filterTypeId();
    return this.monthMovements().filter((m) => !typeId || m.typeId === typeId);
  });

  readonly monthDeposits = computed(() =>
    this.filteredMovements().reduce((sum, m) => {
      const code = this.types().find((t) => t.id === m.typeId)?.code ?? '';
      return code !== 'WITHDRAWAL' ? sum + m.amount : sum;
    }, 0)
  );

  readonly monthWithdrawals = computed(() =>
    this.filteredMovements().reduce((sum, m) => {
      const code = this.types().find((t) => t.id === m.typeId)?.code ?? '';
      return code === 'WITHDRAWAL' ? sum + m.amount : sum;
    }, 0)
  );

  readonly monthNet = computed(() => this.monthDeposits() - this.monthWithdrawals());

  ngOnInit(): void {
    this.accountService.getAll(false).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (err) => this.logger.error('Failed to load accounts', err),
    });
    this.domainService.getByCode('savings_movement_type').subscribe({
      next: (types) => {
        this.types.set(types);
        if (types.length > 0) this.formTypeId.set(types[0].id);
      },
      error: (err) => this.logger.error('Failed to load savings types', err),
    });
    this.loadAll();
    this.loadMonth();
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
    this.loadMonth();
  }

  private loadAll(): void {
    this.savingsService.getAll().subscribe({
      next: (m) => this.allMovements.set(m),
      error: (err) => this.logger.error('Failed to load savings', err),
    });
  }

  private loadMonth(): void {
    this.loading.set(true);
    this.savingsService.getByMonth(this.year(), this.month()).subscribe({
      next: (m) => {
        this.monthMovements.set(m);
        this.loading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to load savings', err);
        this.loading.set(false);
      },
    });
  }

  openForm(): void {
    this.formDescription.set('');
    this.formAmount.set(null);
    this.formDate.set(new Date().toISOString().split('T')[0]);
    const firstType = this.types()[0];
    if (firstType) this.formTypeId.set(firstType.id);
    this.formAccountId.set('');
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); }

  saveMovement(): void {
    const description = this.formDescription();
    const amount = this.formAmount();
    const date = this.formDate();
    const typeId = this.formTypeId();
    if (!description || !amount || !date || !typeId) return;

    this.saving.set(true);
    this.savingsService
      .create({ description, amount, date, typeId, accountId: this.formAccountId() })
      .subscribe({
        next: (movement) => {
          this.allMovements.update((list) => [movement, ...list]);
          // Add to month list if in current month view
          const d = new Date(movement.date + 'T12:00:00');
          if (d.getFullYear() === this.year() && d.getMonth() + 1 === this.month()) {
            this.monthMovements.update((list) => [movement, ...list]);
          }
          this.saving.set(false);
          this.closeForm();
          this.toast.success('Movimentação registrada com sucesso!');
        },
        error: (err) => {
          this.logger.error('Failed to save movement', err);
          this.saving.set(false);
          this.toast.error('Erro ao registrar movimentação.');
        },
      });
  }

  deleteMovement(id: string): void {
    if (!confirm('Confirma a exclusão?')) return;
    this.deletingId.set(id);
    this.savingsService.delete(id).subscribe({
      next: () => {
        this.allMovements.update((list) => list.filter((m) => m.id !== id));
        this.monthMovements.update((list) => list.filter((m) => m.id !== id));
        this.deletingId.set(null);
        this.toast.success('Movimentação excluída.');
      },
      error: (err) => {
        this.logger.error('Failed to delete movement', err);
        this.deletingId.set(null);
        this.toast.error('Erro ao excluir movimentação.');
      },
    });
  }

  typeLabel(typeId: string): string {
    return this.types().find((t) => t.id === typeId)?.value ?? typeId;
  }

  typeCode(typeId: string): string {
    return this.types().find((t) => t.id === typeId)?.code ?? '';
  }

  accountName(accountId: string): string {
    return this.accounts().find((a) => a.id === accountId)?.name ?? '';
  }
}
