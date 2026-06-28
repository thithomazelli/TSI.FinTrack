import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../../core/services/category.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Category } from '../../../core/models/interfaces/category.interface';

const DEFAULT_COLOR = '#6366f1';

@Component({
  selector: 'tsi-categories-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './categories-settings.component.html',
  styleUrls: ['./categories-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesSettingsComponent implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly deletingCat = signal<Category | null>(null);

  formName = '';
  formColor = DEFAULT_COLOR;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.categoryService.getAll().subscribe({
      next: data => {
        this.categories.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.logger.error('Failed to load categories', err);
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName = '';
    this.formColor = DEFAULT_COLOR;
    this.showForm.set(true);
  }

  openEdit(cat: Category): void {
    this.editingId.set(cat.id);
    this.formName = cat.name;
    this.formColor = cat.color;
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formName.trim()) return;
    this.saving.set(true);
    const payload = { name: this.formName.trim(), color: this.formColor };
    const id = this.editingId();

    const op$ = id
      ? this.categoryService.update(id, payload)
      : this.categoryService.create(payload);

    op$.subscribe({
      next: saved => {
        this.categories.update(list =>
          id
            ? list.map(c => (c.id === id ? saved : c))
            : [...list, saved].sort((a, b) => a.name.localeCompare(b.name))
        );
        this.toast.success(id ? 'Categoria atualizada!' : 'Categoria criada!');
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save category', err);
        this.toast.error('Erro ao salvar categoria.');
        this.saving.set(false);
      },
    });
  }

  confirmDelete(cat: Category): void {
    this.deletingCat.set(cat);
  }

  cancelDelete(): void {
    this.deletingCat.set(null);
  }

  delete(): void {
    const cat = this.deletingCat();
    if (!cat) return;
    this.saving.set(true);
    this.categoryService.delete(cat.id).subscribe({
      next: () => {
        this.categories.update(list => list.filter(c => c.id !== cat.id));
        this.toast.success('Categoria excluída.');
        this.deletingCat.set(null);
        this.saving.set(false);
      },
      error: err => {
        this.logger.error('Failed to delete category', err);
        this.toast.error('Erro ao excluir categoria.');
        this.saving.set(false);
      },
    });
  }
}
