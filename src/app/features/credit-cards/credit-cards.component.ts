import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { CreditCardBillService } from '../../core/services/credit-card-bill.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { CreditCardBill } from '../../core/models/interfaces/credit-card-bill.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { BillStatus } from '../../core/models/enums/bill-status.enum';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';

interface BillWithCard extends CreditCardBill {
  credit_cards?: { name: string; last_four_digits: string };
}

@Component({
    selector: 'tsi-credit-cards',
    imports: [DecimalPipe, SlicePipe, TranslatePipe, MonthPickerComponent],
    templateUrl: './credit-cards.component.html',
    styleUrls: ['./credit-cards.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreditCardsComponent implements OnInit {
  private readonly billService = inject(CreditCardBillService);
  private readonly cardService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly BillStatus = BillStatus;

  readonly bills = signal<BillWithCard[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly loading = signal(false);
  readonly updatingId = signal<string | null>(null);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly totalAmount = computed(() =>
    this.bills().reduce((sum, b) => sum + (b.totalAmount ?? 0), 0)
  );

  readonly cardsWithoutBill = computed(() => {
    const billCardIds = new Set(this.bills().map((b) => b.creditCardId));
    return this.cards().filter((c) => !billCardIds.has(c.id));
  });

  ngOnInit(): void {
    this.cardService.getAll(false).subscribe({
      next: (cards) => this.cards.set(cards),
      error: (err) => this.logger.error('Failed to load cards', err),
    });
    this.loadBills();
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
    this.loadBills();
  }

  private loadBills(): void {
    this.loading.set(true);
    this.billService.getByMonth(this.year(), this.month()).subscribe({
      next: (bills) => {
        this.bills.set(bills as BillWithCard[]);
        this.loading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to load bills', err);
        this.loading.set(false);
      },
    });
  }

  updateStatus(bill: BillWithCard, status: BillStatus): void {
    this.updatingId.set(bill.id);
    this.billService.updateStatus(bill.id, status).subscribe({
      next: (updated) => {
        this.bills.update((list) =>
          list.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
        );
        this.updatingId.set(null);
        this.toast.success('Status da fatura atualizado.');
      },
      error: (err) => {
        this.logger.error('Failed to update bill status', err);
        this.updatingId.set(null);
        this.toast.error('Erro ao atualizar status da fatura.');
      },
    });
  }

  createBillForCard(card: CreditCard): void {
    this.billService
      .upsert({ creditCardId: card.id, year: this.year(), month: this.month() })
      .subscribe({
        next: (bill) => {
          const exists = this.bills().some((b) => b.id === bill.id);
          if (!exists) {
            const billWithCard: BillWithCard = {
              ...(bill as BillWithCard),
              credit_cards: { name: card.name, last_four_digits: card.lastFourDigits },
            };
            this.bills.update((list) => [...list, billWithCard]);
          }
        },
        error: (err) => this.logger.error('Failed to create bill', err),
      });
  }

  nextStatus(current: BillStatus): BillStatus {
    if (current === BillStatus.Open) return BillStatus.Closed;
    if (current === BillStatus.Closed) return BillStatus.Paid;
    return BillStatus.Open;
  }

  statusClass(status: BillStatus): string {
    const map: Record<BillStatus, string> = {
      [BillStatus.Open]: 'status-open',
      [BillStatus.Closed]: 'status-closed',
      [BillStatus.Paid]: 'status-paid',
    };
    return map[status] ?? '';
  }
}
