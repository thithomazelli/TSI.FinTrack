import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PeopleService } from '../../../core/services/people.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { People } from '../../../core/models/interfaces/people.interface';

@Component({
  selector: 'tsi-people-settings',
  imports: [FormsModule],
  templateUrl: './people-settings.component.html',
  styleUrls: ['./people-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeopleSettingsComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly people = signal<People[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly deletingPerson = signal<People | null>(null);

  formName = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.peopleService.getAll().subscribe({
      next: data => { this.people.set(data); this.loading.set(false); },
      error: err => { this.logger.error('Failed to load people', err); this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName = '';
    this.showForm.set(true);
  }

  openEdit(person: People): void {
    this.editingId.set(person.id);
    this.formName = person.name;
    this.showForm.set(true);
  }

  readonly saveAttempted = signal(false);
  private readonly _touched = new Set<string>();
  readonly touchedTick = signal(0);
  markTouched(f: string): void { this._touched.add(f); this.touchedTick.update(n => n + 1); }
  fi(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && !v; }
  fv(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && v; }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.saveAttempted.set(false);
    this._touched.clear();
  }

  save(): void {
    const name = this.formName.trim();
    if (!name) { this.saveAttempted.set(true); return; }
    this.saving.set(true);
    const id = this.editingId();

    const op$ = id
      ? this.peopleService.update(id, name)
      : this.peopleService.upsertByName(name);

    op$.subscribe({
      next: saved => {
        this.people.update(list =>
          id
            ? list.map(p => (p.id === id ? saved : p))
            : [...list, saved].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        );
        this.toast.success(id ? 'Pessoa atualizada!' : 'Pessoa adicionada!');
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save person', err);
        this.toast.error('Erro ao salvar.');
        this.saving.set(false);
      },
    });
  }

  confirmDelete(person: People): void {
    this.deletingPerson.set(person);
  }

  cancelDelete(): void {
    this.deletingPerson.set(null);
  }

  deletePerson(): void {
    const person = this.deletingPerson();
    if (!person) return;
    this.saving.set(true);
    this.peopleService.delete(person.id).subscribe({
      next: () => {
        this.people.update(list => list.filter(p => p.id !== person.id));
        this.toast.success('Pessoa removida.');
        this.deletingPerson.set(null);
        this.saving.set(false);
      },
      error: err => {
        this.logger.error('Failed to delete person', err);
        this.toast.error('Erro ao remover pessoa.');
        this.saving.set(false);
      },
    });
  }
}
