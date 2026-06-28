export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  installmentNumber: number | null;
  totalInstallments: number | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  exchangeRate: number | null;
  isPayment: boolean;
  isFuture: boolean;
}

export interface ParsedBill {
  cardLastFour: string | null;
  dueDate: string | null;
  closingDate: string | null;
  totalAmount: number | null;
  transactions: ParsedTransaction[];
}

const MONTHS_PT: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

function parseDate(raw: string, refYear: number): string {
  const m = raw.match(/(\d{2})\s+(\w{3})/);
  if (!m) return '';
  const month = MONTHS_PT[m[2].toUpperCase()] ?? '01';
  return `${refYear}-${month}-${m[1].padStart(2, '0')}`;
}

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')) || 0;
}

export async function parseItauPDF(file: File): Promise<ParsedBill> {
  const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const s = (item as { str: string }).str.trim();
      if (s) lines.push(s);
    }
  }

  const bill: ParsedBill = {
    cardLastFour: null,
    dueDate: null,
    closingDate: null,
    totalAmount: null,
    transactions: [],
  };

  const refYear = new Date().getFullYear();

  // Extract card last four digits
  for (const line of lines) {
    const cardMatch = line.match(/cart[aã]o.*?(\d{4})/i);
    if (cardMatch && !bill.cardLastFour) {
      bill.cardLastFour = cardMatch[1];
    }
    const dueMatch = line.match(/vencimento[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) {
      const [d, m, y] = dueMatch[1].split('/');
      bill.dueDate = `${y}-${m}-${d}`;
    }
    const closingMatch = line.match(/fechamento[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    if (closingMatch) {
      const [d, m, y] = closingMatch[1].split('/');
      bill.closingDate = `${y}-${m}-${d}`;
    }
    const totalMatch = line.match(/total.*?R\$\s*([\d.,]+)/i);
    if (totalMatch && !bill.totalAmount) {
      bill.totalAmount = parseBRL(totalMatch[1]);
    }
  }

  type Section = 'none' | 'payments' | 'purchases' | 'international' | 'services' | 'future';
  let section: Section = 'none';

  const datePattern = /^\d{2}\s+\w{3}$/;
  const amountPattern = /^-?[\d.]+,\d{2}$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/pagamentos efetuados/i.test(line)) { section = 'payments'; i++; continue; }
    if (/lançamentos compras e saques/i.test(line)) { section = 'purchases'; i++; continue; }
    if (/lançamentos internacionais/i.test(line)) { section = 'international'; i++; continue; }
    if (/lançamentos produtos e serviços/i.test(line)) { section = 'services'; i++; continue; }
    if (/compras parceladas próximas faturas/i.test(line)) { section = 'future'; i++; continue; }
    if (/^total/i.test(line) && section !== 'none') { i++; continue; }

    if (section === 'payments' || section === 'purchases' || section === 'services') {
      if (datePattern.test(line) && i + 2 < lines.length) {
        const date = parseDate(line, refYear);
        const description = lines[i + 1];
        const amountLine = lines[i + 2];
        if (amountPattern.test(amountLine)) {
          const amount = Math.abs(parseBRL(amountLine));
          if (amount > 0) {
            const installMatch = description.match(/(\d{2})\/(\d{2})\s*$/);
            bill.transactions.push({
              date,
              description: description.replace(/\s+\d{2}\/\d{2}\s*$/, '').trim(),
              amount,
              installmentNumber: installMatch ? parseInt(installMatch[1]) : null,
              totalInstallments: installMatch ? parseInt(installMatch[2]) : null,
              originalCurrency: null,
              originalAmount: null,
              exchangeRate: null,
              isPayment: section === 'payments',
              isFuture: false,
            });
          }
          i += 3;
          continue;
        }
      }
    }

    if (section === 'international') {
      // Pattern: DATE | DESCRIPTION | USD_AMOUNT | BRL_AMOUNT (+ exchange rate line)
      if (datePattern.test(line) && i + 3 < lines.length) {
        const date = parseDate(line, refYear);
        const description = lines[i + 1];
        const usdLine = lines[i + 2];
        const brlLine = lines[i + 3];
        const usdMatch = usdLine.match(/([\d.,]+)\s*USD/i);
        if (usdMatch && amountPattern.test(brlLine)) {
          const brlAmount = Math.abs(parseBRL(brlLine));
          const usdAmount = parseBRL(usdMatch[1]);
          const rate = usdAmount > 0 ? brlAmount / usdAmount : null;
          bill.transactions.push({
            date,
            description: description.trim(),
            amount: brlAmount,
            installmentNumber: null,
            totalInstallments: null,
            originalCurrency: 'USD',
            originalAmount: usdAmount,
            exchangeRate: rate,
            isPayment: false,
            isFuture: false,
          });
          i += 4;
          continue;
        }
      }
    }

    if (section === 'future') {
      if (datePattern.test(line) && i + 2 < lines.length) {
        const date = parseDate(line, refYear + (new Date().getMonth() >= 10 ? 1 : 0));
        const description = lines[i + 1];
        const amountLine = lines[i + 2];
        if (amountPattern.test(amountLine)) {
          const amount = Math.abs(parseBRL(amountLine));
          if (amount > 0) {
            const installMatch = description.match(/(\d{2})\/(\d{2})\s*$/);
            bill.transactions.push({
              date,
              description: description.replace(/\s+\d{2}\/\d{2}\s*$/, '').trim(),
              amount,
              installmentNumber: installMatch ? parseInt(installMatch[1]) : null,
              totalInstallments: installMatch ? parseInt(installMatch[2]) : null,
              originalCurrency: null,
              originalAmount: null,
              exchangeRate: null,
              isPayment: false,
              isFuture: true,
            });
          }
          i += 3;
          continue;
        }
      }
    }

    i++;
  }

  return bill;
}
