import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  input,
  model,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { PeopleService } from '../../../core/services/people.service';
import { People } from '../../../core/models/interfaces/people.interface';

@Component({
    selector: 'tsi-labels-input',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './labels-input.component.html',
    styleUrls: ['./labels-input.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LabelsInputComponent implements OnInit {
  @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>;

  private readonly peopleService = inject(PeopleService);

  readonly labels = model<string[]>([]);
  readonly familyNames = input<string[]>([]);

  readonly allPeople = signal<People[]>([]);
  readonly inputValue = signal('');
  readonly showDropdown = signal(false);

  readonly suggestions = computed(() => {
    const val = this.inputValue().toLowerCase().trim();
    if (!val) return [];
    const existing = new Set(this.labels());
    const fromFamily = this.familyNames()
      .filter(n => n.toLowerCase().includes(val) && !existing.has(n));
    const fromPeople = this.allPeople()
      .map(p => p.name)
      .filter(n => n.toLowerCase().includes(val) && !existing.has(n) && !fromFamily.includes(n));
    return [...fromFamily, ...fromPeople].slice(0, 8);
  });

  ngOnInit(): void {
    this.peopleService.getAll().subscribe({
      next: people => this.allPeople.set(people),
    });
  }

  onInput(value: string): void {
    this.inputValue.set(value);
    this.showDropdown.set(value.trim().length > 0);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const val = this.inputValue().trim();
      if (val) this.addLabel(val);
    } else if (event.key === 'Backspace' && !this.inputValue() && this.labels().length > 0) {
      this.removeLabel(this.labels()[this.labels().length - 1]);
    }
  }

  addLabel(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || this.labels().includes(trimmed)) {
      this.inputValue.set('');
      this.showDropdown.set(false);
      return;
    }
    this.labels.update(l => [...l, trimmed]);
    this.peopleService.upsertByName(trimmed).subscribe();
    this.inputValue.set('');
    this.showDropdown.set(false);
    this.inputEl?.nativeElement.focus();
  }

  removeLabel(name: string): void {
    this.labels.update(l => l.filter(x => x !== name));
  }

  closeDropdown(): void {
    setTimeout(() => this.showDropdown.set(false), 150);
  }
}
