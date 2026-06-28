import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { EntryService, CreateEntryPayload } from '../../core/services/entry.service';
import { AccountService } from '../../core/services/account.service';
import { DomainListService } from '../../core/services/domain-list.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { DomainList } from '../../core/models/interfaces/domain-list.interface';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { LabelsInputComponent } from '../../shared/components/labels-input/labels-input.component';

@Component({
  selector: 'tsi-entries',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslatePipe, MonthPickerComponent, LabelsInputComponent],
  templateUrl: './entries.component.html',
  styleUrls: ['./entries.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntriesComponent implements OnInit {
  private readonly entryService = inject(EntryService);
  private readonly accountService = inject(AccountService);
  private readonly domainListService = inject(DomainListService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly entries = signal<Entry[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly entryTypes = signal<DomainList[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly total = computed(() =>
    this.entries().reduce((s, e) => s + e.amount, 0)
  );

  formDescription = '';
  formAmount = 0;
  formDate = new Date().toISOString().split('T')[0];
  formTypeId = '';
  formAccountId = '';
  formLabels: string[] = [];
  formStatus = 'REALIZED';

  ngOnInit(): void {
    this.accountService.getAll().subscribe({ next: d => this.accounts.set(d) });
    this.domainListService.getByCode('entry_type').subscribe({ next: d => this.entryTypes.set(d) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.entryService
      .getByMonth({ year: this.year(), month: this.month() })
      .subscribe({
        next: data => {
          this.entries.set(data);
          this.loading.set(false);
        },
        error: err => {
          this.logger.error('Failed to load entries', err);
          this.loading.set(false);
          this.toast.error('Erro ao carregar entradas.');
        },
      });
  }

  onMonthChanged(e: { year: number; month: number }): void {
    this.year.set(e.year);
    this.month.set(e.month);
    this.load();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formDescription = '';
    this.formAmount = 0;
    this.formDate = new Date().toISOString().split('T')[0];
    this.formTypeId = this.entryTypes()[0]?.id ?? '';
    this.formAccountId = this.accounts()[0]?.id ?? '';
    this.formLabels = [];
    this.formStatus = 'REALIZED';
    this.showForm.set(true);
  }

  openEdit(entry: Entry): void {
    this.editingId.set(entry.id);
    this.formDescription = entry.description;
    this.formAmount = entry.amount;
    this.formDate = entry.date;
    this.formTypeId = entry.typeId ?? '';
    this.formAccountId = entry.accountId ?? '';
    this.formLabels = [...entry.labels];
    this.formStatus = entry.status ?? 'REALIZED';
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formDescription.trim() || this.formAmount <= 0) return;
    this.saving.set(true);

    const payload: CreateEntryPayload = {
      description: this.formDescription.trim(),
      amount: this.formAmount,
      date: this.formDate,
      typeId: this.formTypeId || null,
      accountId: this.formAccountId || null,
      labels: this.formLabels,
      status: this.formStatus,
    };

    const id = this.editingId();
    const op$ = id
      ? this.entryService.update(id, payload)
      : this.entryService.create(payload);

    op$.subscribe({
      next: saved => {
        if (id) {
          this.entries.update(list => list.map(e => (e.id === id ? saved : e)));
          this.toast.success('Entrada atualizada com sucesso!');
        } else {
          this.load();
          this.toast.success('Entrada adicionada com sucesso!');
        }
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save entry', err);
        this.saving.set(false);
        this.toast.error('Erro ao salvar entrada.');
      },
    });
  }

  delete(entry: Entry): void {
    this.entryService.delete(entry.id).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.id !== entry.id));
        this.toast.success('Entrada excluída.');
      },
      error: err => {
        this.logger.error('Failed to delete entry', err);
        this.toast.error('Erro ao excluir entrada.');
      },
    });
  }

  typeName(typeId: string | null): string {
    return this.entryTypes().find(t => t.id === typeId)?.name ?? '';
  }

  accountName(id: string | null): string {
    return this.accounts().find(a => a.id === id)?.name ?? '';
  }
}
