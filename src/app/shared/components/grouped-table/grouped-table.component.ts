import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  TemplateRef,
  effect,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TableGroup<T = any> {
  id: string;
  label: string;
  items: T[];
  total?: number;
  status?: 'REALIZED' | 'PROJECTED';
  badge?: string;
  badgeClass?: string;
  defaultExpanded?: boolean;
  meta?: any;
}

export interface GroupInsertEvent {
  groupId: string;
  afterItemId: string | null;
}

export interface GroupReorderEvent {
  id: string;
  groupId: string;
  aboveId: string | null;
  belowId: string | null;
}

export type GroupSearchFn<T = any> = (item: T, query: string) => boolean;

@Component({
  selector: 'tsi-grouped-table',
  imports: [NgTemplateOutlet, FormsModule],
  templateUrl: './grouped-table.component.html',
  styleUrls: ['./grouped-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupedTableComponent {
  readonly groups          = input<TableGroup[]>([]);
  readonly draggable       = input<boolean>(false);
  readonly searchFn        = input<GroupSearchFn | null>(null);
  readonly searchPlaceholder = input<string>('Buscar...');
  readonly emptyMsg        = input<string>('Nenhum resultado encontrado.');
  readonly activeInsert    = input<GroupInsertEvent | null>(null);

  readonly rowReordered    = output<GroupReorderEvent>();
  readonly insertRequested = output<GroupInsertEvent>();

  @ContentChild('theadRow') theadRowTpl?: TemplateRef<void>;
  @ContentChild('row')       rowTpl!:      TemplateRef<{ $implicit: any }>;
  @ContentChild('insertForm') insertFormTpl?: TemplateRef<{ groupId: string; afterItemId: string | null }>;
  @ContentChild('filterBtn')  filterBtnTpl?:  TemplateRef<void>;
  @ContentChild('filterPanel') filterPanelTpl?: TemplateRef<void>;
  @ContentChild('totals')     totalsTpl?: TemplateRef<{ $implicit: any[] }>;

  readonly query = signal('');
  private readonly _expanded = signal<Map<string, boolean>>(new Map());

  // Drag state
  dragGroupId: string | null = null;
  dragFromIndex = -1;
  readonly dragOverIndex = signal(-1);

  constructor() {
    effect(() => {
      const groups = this.groups();
      this._expanded.update(map => {
        const next = new Map(map);
        for (const g of groups) {
          if (!next.has(g.id)) {
            next.set(g.id, g.defaultExpanded ?? true);
          }
        }
        return next;
      });
    });
  }

  readonly visibleGroups = computed(() => {
    const q = this.query().toLowerCase().trim();
    const fn = this.searchFn();
    return this.groups()
      .map(g => ({ ...g, items: (!q || !fn) ? g.items : g.items.filter(item => fn(item, q)) }))
      .filter(g => !q || g.items.length > 0);
  });

  readonly allFilteredItems = computed(() =>
    this.visibleGroups().flatMap(g => g.items)
  );

  isExpanded(groupId: string): boolean {
    return this._expanded().get(groupId) ?? true;
  }

  toggleGroup(groupId: string): void {
    this._expanded.update(map => {
      const next = new Map(map);
      next.set(groupId, !(next.get(groupId) ?? true));
      return next;
    });
  }

  onSearch(q: string): void {
    this.query.set(q);
  }

  // ── Insert zones ───────────────────────────────────────────────────────────

  requestInsert(groupId: string, afterItemId: string | null): void {
    this.insertRequested.emit({ groupId, afterItemId });
  }

  isActiveInsert(groupId: string, afterItemId: string | null): boolean {
    const ai = this.activeInsert();
    if (!ai) return false;
    return ai.groupId === groupId && ai.afterItemId === afterItemId;
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  onDragStart(groupId: string, index: number, event: DragEvent): void {
    this.dragGroupId = groupId;
    this.dragFromIndex = index;
    this.dragOverIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onDragOver(groupId: string, index: number, event: DragEvent): void {
    if (groupId !== this.dragGroupId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex.set(index);
  }

  onDrop(groupId: string, toIndex: number, event: DragEvent): void {
    event.preventDefault();
    const fromIndex = this.dragFromIndex;
    if (groupId !== this.dragGroupId || fromIndex === -1 || fromIndex === toIndex) {
      this.dragOverIndex.set(-1);
      return;
    }
    const group = this.visibleGroups().find(g => g.id === groupId);
    if (!group) return;

    const items = group.items;
    const dragged = items[fromIndex];
    const newOrder = [...items];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, dragged);

    const aboveId = toIndex > 0 ? newOrder[toIndex - 1].id : null;
    const belowId = toIndex < newOrder.length - 1 ? newOrder[toIndex + 1].id : null;

    this.dragOverIndex.set(-1);
    this.dragFromIndex = -1;
    this.dragGroupId = null;
    this.rowReordered.emit({ id: dragged.id, groupId, aboveId, belowId });
  }

  onDragEnd(): void {
    this.dragOverIndex.set(-1);
    this.dragFromIndex = -1;
    this.dragGroupId = null;
  }

  isDragOver(groupId: string, index: number): boolean {
    return this.draggable() && this.dragGroupId === groupId &&
      this.dragOverIndex() === index && this.dragFromIndex !== index;
  }
}
