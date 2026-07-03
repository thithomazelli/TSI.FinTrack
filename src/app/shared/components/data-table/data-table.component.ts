import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  OnInit,
  TemplateRef,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  headerClass?: string;
  numeric?: boolean;
}

export type SortDir = 'asc' | 'desc';
export type SearchFn<T = any> = (item: T, query: string) => boolean;
export type CompareFn<T = any> = (a: T, b: T) => number;
export type RowClassFn<T = any> = (item: T) => string;

const PAGE_SIZES = [10, 25, 50, 100];

@Component({
    selector: 'tsi-data-table',
    imports: [NgTemplateOutlet, FormsModule, TranslatePipe],
    templateUrl: './data-table.component.html',
    styleUrls: ['./data-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataTableComponent implements OnInit {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly items           = input<any[]>([]);
  readonly columns         = input<TableColumn[]>([]);
  readonly searchFn        = input<SearchFn | null>(null);
  readonly searchPlaceholder = input<string>('Buscar...');
  readonly sortComparators = input<Record<string, CompareFn>>({});
  readonly initialSortKey  = input<string | null>(null);
  readonly initialSortDir  = input<SortDir>('desc');
  readonly defaultPageSize = input<number>(25);
  readonly rowClassFn      = input<RowClassFn | null>(null);
  readonly emptyMsg        = input<string>('Nenhum resultado encontrado.');
  readonly onRowClick      = input<((item: any) => void) | null>(null);

  // ── Content templates ─────────────────────────────────────────────────────
  @ContentChild('row')         rowTpl!: TemplateRef<{ $implicit: any }>;
  @ContentChild('extraTh')     extraThTpl?: TemplateRef<void>;
  @ContentChild('filterBtn')   filterBtnTpl?: TemplateRef<void>;
  @ContentChild('filterPanel') filterPanelTpl?: TemplateRef<void>;
  @ContentChild('totals')      totalsTpl?: TemplateRef<{ $implicit: any[] }>;

  // ── Internal state ────────────────────────────────────────────────────────
  readonly query    = signal('');
  readonly sortKey  = signal<string | null>(null);
  readonly sortDir  = signal<SortDir>('desc');
  // Resets to 0 whenever items reference changes, but can be updated manually
  readonly page     = linkedSignal({ source: this.items, computation: () => 0 });
  readonly pageSize = signal(25);
  readonly pageSizeOptions = PAGE_SIZES;

  ngOnInit() {
    this.sortKey.set(this.initialSortKey());
    this.sortDir.set(this.initialSortDir());
    this.pageSize.set(this.defaultPageSize());
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const fn = this.searchFn();
    if (!q || !fn) return this.items();
    return this.items().filter(item => fn(item, q));
  });

  readonly sorted = computed(() => {
    const key = this.sortKey();
    const dir = this.sortDir();
    const comparators = this.sortComparators();
    const data = [...this.filtered()];
    if (!key) return data;

    const cmp = comparators[key] ??
      ((a: any, b: any) => {
        const av = a[key] ?? '';
        const bv = b[key] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av).localeCompare(String(bv), 'pt-BR');
      });

    return data.sort((a, b) => dir === 'asc' ? cmp(a, b) : -cmp(a, b));
  });

  readonly totalItems = computed(() => this.filtered().length);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );

  readonly safePage = computed(() =>
    Math.min(this.page(), this.totalPages() - 1)
  );

  readonly pageItems = computed(() => {
    const start = this.safePage() * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });

  readonly pageDisplay = computed(() => {
    const total = this.totalItems();
    const p = this.safePage();
    const ps = this.pageSize();
    return {
      start: total === 0 ? 0 : p * ps + 1,
      end: Math.min((p + 1) * ps, total),
      total,
    };
  });

  readonly pages = computed(() => {
    const tp = this.totalPages();
    const cur = this.safePage();
    // Show up to 7 page buttons: first, last, current ±2, and ellipsis
    const all = Array.from({ length: tp }, (_, i) => i);
    if (tp <= 7) return all.map(i => ({ n: i, ellipsis: false }));
    const visible = new Set<number>([0, tp - 1, cur, cur - 1, cur + 1, cur - 2, cur + 2]
      .filter(n => n >= 0 && n < tp));
    const sorted = [...visible].sort((a, b) => a - b);
    const result: { n: number; ellipsis: boolean }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push({ n: -1, ellipsis: true });
      result.push({ n: sorted[i], ellipsis: false });
    }
    return result;
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  toggleSort(key: string) {
    if (this.sortKey() === key) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
    this.page.set(0);
  }

  onSearch(q: string) {
    this.query.set(q);
    this.page.set(0);
  }

  setPage(n: number) {
    if (n < 0 || n >= this.totalPages()) return;
    this.page.set(n);
  }

  onPageSizeChange(ps: number) {
    this.pageSize.set(ps);
    this.page.set(0);
  }

  rowClass(item: any): string {
    return this.rowClassFn()?.(item) ?? '';
  }
}
