export interface ParsedDebitRow {
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
}

export interface ParsedStatement {
  accountHolder: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  rows: ParsedDebitRow[];
}

const MONTHS_PT: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
  JANEIRO: '01', FEVEREIRO: '02', MARÇO: '03', ABRIL: '04', MAIO: '05', JUNHO: '06',
  JULHO: '07', AGOSTO: '08', SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
};

function parseFullDate(raw: string): string {
  // dd/mm/yyyy
  const slash = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;

  // dd MMM yyyy  or  dd/MMM/yyyy
  const mmm = raw.match(/(\d{2})[/ ](\w+)[/ ](\d{4})/);
  if (mmm) {
    const month = MONTHS_PT[mmm[2].toUpperCase()];
    if (month) return `${mmm[3]}-${month}-${mmm[1]}`;
  }

  return '';
}

function parseBRL(raw: string): number {
  // Remove thousand separators (.) and convert decimal (,) to (.)
  // Handle negative sign or C/D suffix
  const clean = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
  return Math.abs(parseFloat(clean)) || 0;
}

// Returns true if the token looks like a BRL monetary value
function isBRLAmount(token: string): boolean {
  return /^-?[\d.]+,\d{2}$/.test(token);
}

export async function parseItauStatement(file: File): Promise<ParsedStatement> {
  const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;

  const statement: ParsedStatement = {
    accountHolder: null,
    periodStart: null,
    periodEnd: null,
    rows: [],
  };

  // Collect all text items with their positions
  type TextItem = { str: string; x: number; y: number; page: number };
  const items: TextItem[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const height = viewport.height;

    for (const item of content.items) {
      const i = item as { str: string; transform: number[] };
      const str = i.str.trim();
      if (!str) continue;
      items.push({
        str,
        x: i.transform[4],
        y: height - i.transform[5], // flip y so top = 0
        page: p,
      });
    }
  }

  // Extract header info from flat text
  const flatLines = items.map((i) => i.str);

  for (let i = 0; i < flatLines.length; i++) {
    const line = flatLines[i];
    if (/período[:\s]/i.test(line)) {
      const next = flatLines[i + 1] ?? '';
      const dates = (line + ' ' + next).match(/(\d{2}\/\d{2}\/\d{4})/g);
      if (dates?.length === 2) {
        statement.periodStart = parseFullDate(dates[0]);
        statement.periodEnd = parseFullDate(dates[1]);
      }
    }
    if (/titular|correntista/i.test(line) && flatLines[i + 1]) {
      statement.accountHolder = flatLines[i + 1];
    }
  }

  // Itaú statement structure:
  // Each row: DATE | DESCRIPTION | VALUE (with C or D suffix or sign)
  // We detect rows by matching date pattern at start of a text item

  const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
  const datePatternShort = /^\d{2}\/\d{2}$/; // dd/mm without year (common in older formats)

  // Group items by approximate y position (rows within ±3pt are same line)
  const lineGroups: Map<number, TextItem[]> = new Map();
  for (const item of items) {
    const roundedY = Math.round(item.y / 3) * 3;
    if (!lineGroups.has(roundedY)) lineGroups.set(roundedY, []);
    lineGroups.get(roundedY)!.push(item);
  }

  // Sort groups by page then y
  const sortedGroups = Array.from(lineGroups.entries())
    .sort((a, b) => {
      const aPage = a[1][0].page;
      const bPage = b[1][0].page;
      if (aPage !== bPage) return aPage - bPage;
      return a[0] - b[0];
    })
    .map(([, group]) => group.sort((a, b) => a.x - b.x));

  // Detect column layout: find x positions of amount and balance columns
  // by looking for the first row that has a date and two BRL amounts
  let amountColX: number | null = null;
  let balanceColX: number | null = null;

  for (const group of sortedGroups) {
    const texts = group.map((g) => g.str);
    if (datePattern.test(texts[0]) || datePatternShort.test(texts[0])) {
      const amountItems = group.filter((g) => isBRLAmount(g.str));
      if (amountItems.length >= 2) {
        amountColX = amountItems[amountItems.length - 2].x;
        balanceColX = amountItems[amountItems.length - 1].x;
        break;
      }
    }
  }

  // Parse rows
  let currentYear = new Date().getFullYear();

  for (const group of sortedGroups) {
    const texts = group.map((g) => g.str);
    if (!texts.length) continue;

    const firstToken = texts[0];
    let date = '';

    if (datePattern.test(firstToken)) {
      date = parseFullDate(firstToken);
    } else if (datePatternShort.test(firstToken)) {
      // dd/mm format — infer year from period
      const [d, m] = firstToken.split('/');
      date = `${currentYear}-${m}-${d}`;
    } else {
      continue;
    }

    if (!date) continue;

    // Skip header rows
    if (/data|histórico|saldo|valor/i.test(texts[1] ?? '')) continue;

    const brlItems = group.filter((g) => isBRLAmount(g.str));
    if (brlItems.length === 0) continue;

    // The amount is the second-to-last BRL value; balance is the last
    // If only one BRL value exists, treat it as the amount
    const amountItem = brlItems.length >= 2 ? brlItems[brlItems.length - 2] : brlItems[0];
    const rawAmount = amountItem.str;
    const amount = parseBRL(rawAmount);
    if (amount === 0) continue;

    // Description: all text items between date and first BRL amount
    const amountIdx = group.indexOf(amountItem);
    const descTokens = group
      .slice(1, amountIdx)
      .map((g) => g.str)
      .filter((s) => !isBRLAmount(s));
    const description = descTokens.join(' ').trim() || (texts[1] ?? '');

    // Detect credit vs debit:
    // 1. Negative raw value → debit
    // 2. Trailing C/D suffix in adjacent tokens
    // 3. Common credit keywords
    let isCredit = false;

    const cdToken = texts.find((t) => /^[CD]$/.test(t));
    if (cdToken) {
      isCredit = cdToken === 'C';
    } else if (rawAmount.startsWith('-')) {
      isCredit = false;
    } else {
      // Heuristic: known credit keywords
      isCredit = /salário|pagamento recebido|pix recebido|ted recebida|doc recebido|crédito|reembolso|rendimento/i.test(description);
    }

    // Skip "Saldo" rows and opening balance
    if (/^saldo/i.test(description)) continue;

    statement.rows.push({ date, description, amount, isCredit });
  }

  return statement;
}
