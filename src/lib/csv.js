import { PAYMENT_METHODS } from './types';

// Minimal CSV parser that handles quoted fields and commas inside quotes.
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function normalizePaymentMethod(value) {
  const v = value.toLowerCase().trim();
  const found = PAYMENT_METHODS.find((m) => m === v || m.replace('_', '') === v.replace('_', ''));
  return found ?? 'other';
}

// Expected columns: date,amount,category,description,vendor,payment_method
// category may be empty (auto-categorize later). Header row required.
export function parseTransactionsCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors = [];
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must have a header row and at least one data row.'] };
  }
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    date: header.indexOf('date'),
    amount: header.indexOf('amount'),
    category: header.indexOf('category'),
    description: header.indexOf('description'),
    vendor: header.indexOf('vendor'),
    payment: header.indexOf('payment_method'),
  };
  if (idx.date === -1 || idx.amount === -1) {
    return { rows: [], errors: ['CSV must include at least "date" and "amount" columns.'] };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const dateStr = cells[idx.date];
    const amountStr = cells[idx.amount];
    if (!dateStr || !amountStr) {
      errors.push(`Row ${i + 1}: missing date or amount.`);
      continue;
    }
    const date = dateStr;
    const amount = parseFloat(amountStr.replace(/[$,]/g, ''));
    if (isNaN(amount)) {
      errors.push(`Row ${i + 1}: invalid amount "${amountStr}".`);
      continue;
    }
    rows.push({
      date,
      amount,
      category: idx.category >= 0 ? cells[idx.category] || null : null,
      description: idx.description >= 0 ? cells[idx.description] || null : null,
      vendor: idx.vendor >= 0 ? cells[idx.vendor] || null : null,
      payment_method: idx.payment >= 0 ? normalizePaymentMethod(cells[idx.payment]) : 'other',
    });
  }
  return { rows, errors };
}
