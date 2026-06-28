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
import { SavingsMovement } from '../../core/models/interfaces/savings-movement.interface';
import { DomainList } from '../../core/models/interfaces/domain-list.interface';
import { Account } from '../../core/models/interfaces/account.interface';

@Component({
  selector: 'tsi-savings',
  standalone: true,
  imports: [DecimalPipe, SlicePipe, FormsModule, TranslatePipe],
  templateUrl: './savings.component.html',
  styleUrls: ['./savings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsComponent implements OnInit {
  private readonly savingsService = inject(SavingsService);
  private readonly domainService = inject(DomainListService);
  private readonly accountService = inject(AccountService);
  private readonly logger = inject(LoggingService);

  readonly movements = signal<SavingsMovement[]>([]);
  readonly types = signal<DomainList[]>([]);
  readonly accounts = signal<Account[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly deletingId = signal<string | null>(null);

  readonly formDescription = signal('');
  readonly formAmount = signal<number | null>(null);
  readonly formDate = signal(new Date().toISOString().split('T')[0]);
  readonly formTypeId = signal('');
  readonly formAccountId = signal('');

  readonly balance = computed(() =>
    this.movements().reduce((sum, m) => {
      const typeCode = this.types().find((t) => t.id === m.typeId)?.code ?? '';
      return typeCode === 'WITHDRAWAL' ? sum - m.amount : sum + m.amount;
    }, 0)
  );

  ngOnInit(): void {
    this.accountService.getAll(false).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: (err) => this.logger.error('Failed to load accounts', err),
    });
    this.domainService.getByCode('savings_type').subscribe({
      next: (types) => {
        this.types.set(types);
        if (types.length > 0) this.formTypeId.set(types[0].id);
      },
      error: (err) => this.logger.error('Failed to load savings types', err),
    });
    this.loadMovements();
  }

  private loadMovements(): void {
    this.loading.set(true);
    this.savingsService.getAll().subscribe({
      next: (movements) => {
        this.movements.set(movements);
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

  closeForm(): void {
    this.showForm.set(false);
  }

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
          this.movements.update((list) => [movement, ...list]);
          this.saving.set(false);
          this.closeForm();
        },
        error: (err) => {
          this.logger.error('Failed to save movement', err);
          this.saving.set(false);
        },
      });
  }

  deleteMovement(id: string): void {
    if (!confirm('')) return;
    this.deletingId.set(id);
    this.savingsService.delete(id).subscribe({
      next: () => {
        this.movements.update((list) => list.filter((m) => m.id !== id));
        this.deletingId.set(null);
      },
      error: (err) => {
        this.logger.error('Failed to delete movement', err);
        this.deletingId.set(null);
      },
    });
  }

  typeLabel(typeId: string): string {
    return this.types().find((t) => t.id === typeId)?.value ?? typeId;
  }

  accountName(accountId: string): string {
    return this.accounts().find((a) => a.id === accountId)?.name ?? '';
  }
}
