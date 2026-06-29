import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { DomainListService } from '../../../core/services/domain-list.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { DomainList } from '../../../core/models/interfaces/domain-list.interface';

@Component({
  selector: 'tsi-domains-settings',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './domains-settings.component.html',
  styleUrls: ['./domains-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DomainsSettingsComponent implements OnInit {
  private readonly domainListService = inject(DomainListService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly allItems = signal<DomainList[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly selectedCode = signal<string | null>(null);
  readonly deletingItem = signal<DomainList | null>(null);

  readonly codes = computed(() =>
    [...new Set(this.allItems().map(i => i.code))]
  );

  readonly filteredItems = computed(() => {
    const code = this.selectedCode();
    return code
      ? this.allItems().filter(i => i.code === code)
      : this.allItems();
  });

  formName = '';
  formColor = '';
  formSortOrder = 0;
  formCode = '';
  formValue = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.domainListService.getAll().subscribe({
      next: data => {
        this.allItems.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.logger.error('Failed to load domain lists', err);
        this.loading.set(false);
      },
    });
  }

  selectCode(code: string | null): void {
    this.selectedCode.set(code);
  }

  openEdit(item: DomainList): void {
    this.editingId.set(item.id);
    this.formName = item.name;
    this.formColor = item.color ?? '';
    this.formSortOrder = item.sortOrder;
    this.formCode = item.code;
    this.formValue = item.value;
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formName.trim()) return;
    this.saving.set(true);
    const id = this.editingId()!;

    this.domainListService
      .update(id, { name: this.formName.trim(), color: this.formColor, sortOrder: this.formSortOrder })
      .subscribe({
        next: saved => {
          this.allItems.update(list => list.map(i => (i.id === id ? saved : i)));
          this.toast.success('Domínio atualizado com sucesso!');
          this.saving.set(false);
          this.closeForm();
        },
        error: err => {
          this.logger.error('Failed to update domain list item', err);
          this.toast.error('Erro ao atualizar domínio.');
          this.saving.set(false);
        },
      });
  }

  confirmDelete(item: DomainList): void {
    if (item.isSystem) return;
    this.deletingItem.set(item);
  }

  cancelDelete(): void {
    this.deletingItem.set(null);
  }

  delete(): void {
    const item = this.deletingItem();
    if (!item) return;
    this.saving.set(true);
    this.domainListService.delete(item.id).subscribe({
      next: () => {
        this.allItems.update(list => list.filter(i => i.id !== item.id));
        this.toast.success('Domínio excluído.');
        this.deletingItem.set(null);
        this.saving.set(false);
      },
      error: err => {
        this.logger.error('Failed to delete domain list item', err);
        this.toast.error('Erro ao excluir domínio.');
        this.saving.set(false);
      },
    });
  }
}
