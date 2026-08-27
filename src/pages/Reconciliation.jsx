import { useRef, useState } from 'react';
import { Upload, Scale, Check, X, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { parseTransactionsCsv } from '@/lib/csv';
import { formatCurrency, formatDate } from '@/lib/format';
import { showToast } from '@/components/ui/Toast';

export function Reconciliation({ readOnly = false }) {
  const [invoiceSet, setInvoiceSet] = useState(null);
  const [bankSet, setBankSet] = useState(null);
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [bankRows, setBankRows] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const invoiceFileRef = useRef(null);
  const bankFileRef = useRef(null);

  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = reject;
      reader.readAsText(file);
    });

  const uploadSet = async (file, kind) => {
    setLoading(true);
    try {
      const text = await readFile(file);
      const { rows, errors } = parseTransactionsCsv(text);
      if (rows.length === 0) {
        showToast('error', 'No valid rows in file');
        return;
      }

      const { data: setData, error: setError } = await supabase
        .from('reconciliation_sets')
        .insert({ name: file.name, kind })
        .select()
        .single();
      if (setError) throw setError;

      const entries = rows.map((r) => ({
        set_id: setData.id,
        date: r.date,
        amount: r.amount,
        vendor: r.vendor,
        description: r.description,
        match_status: 'unmatched',
      }));
      const { error: entryError } = await supabase.from('reconciliation_entries').insert(entries);
      if (entryError) throw entryError;

      const { data: savedEntries } = await supabase
        .from('reconciliation_entries')
        .select('*')
        .eq('set_id', setData.id)
        .order('date', { ascending: true });

      if (kind === 'invoices') {
        setInvoiceSet(setData);
        setInvoiceRows(savedEntries ?? []);
      } else {
        setBankSet(setData);
        setBankRows(savedEntries ?? []);
      }
      setResults(null);
      showToast('success', `Loaded ${rows.length} ${kind} entries${errors.length ? ` (${errors.length} skipped)` : ''}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const runMatch = () => {
    if (!invoiceRows.length || !bankRows.length) return;
    const matched = [];
    const usedBank = new Set();

    for (const inv of invoiceRows) {
      let bestBank = null;
      let bestScore = -1;
      for (const bank of bankRows) {
        if (usedBank.has(bank.id)) continue;
        const amountDiff = Math.abs(Math.abs(inv.amount) - Math.abs(bank.amount));
        const dateDiff = Math.abs(new Date(inv.date).getTime() - new Date(bank.date).getTime()) / (24 * 60 * 60 * 1000);
        if (amountDiff <= 1 && dateDiff <= 3) {
          const score = 100 - amountDiff * 20 - dateDiff * 10;
          if (score > bestScore) {
            bestScore = score;
            bestBank = bank;
          }
        }
      }

      if (bestBank) {
        usedBank.add(bestBank.id);
        const amountDiff = Math.abs(inv.amount) - Math.abs(bestBank.amount);
        const dateDiff = Math.round(
          Math.abs(new Date(inv.date).getTime() - new Date(bestBank.date).getTime()) / (24 * 60 * 60 * 1000)
        );
        matched.push({
          invoice: inv,
          bank: bestBank,
          status: Math.abs(amountDiff) < 0.01 && dateDiff === 0 ? 'matched' : 'partial',
          amountDiff: Math.abs(amountDiff) > 0.01 ? amountDiff : null,
          dateDiff: dateDiff > 0 ? dateDiff : null,
        });
      } else {
        matched.push({ invoice: inv, status: 'unmatched', amountDiff: null, dateDiff: null });
      }
    }

    for (const bank of bankRows) {
      if (!usedBank.has(bank.id)) {
        matched.push({ bank, status: 'unmatched', amountDiff: null, dateDiff: null });
      }
    }

    setResults(matched);
  };

  const reset = () => {
    setInvoiceSet(null);
    setBankSet(null);
    setInvoiceRows([]);
    setBankRows([]);
    setResults(null);
  };

  const matchedCount = results?.filter((r) => r.status === 'matched').length ?? 0;
  const partialCount = results?.filter((r) => r.status === 'partial').length ?? 0;
  const unmatchedCount = results?.filter((r) => r.status === 'unmatched').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
          <Scale className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Reconciliation</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Upload invoices and bank statements to match them by amount and date.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Invoices</h4>
          {invoiceSet ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{invoiceSet.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{invoiceRows.length} entries</p>
              </div>
              <Check className="h-5 w-5 text-emerald-500" />
            </div>
          ) : (
            <button onClick={() => invoiceFileRef.current?.click()} disabled={loading || readOnly} className="btn-secondary w-full justify-center border-dashed py-6">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload invoice CSV
            </button>
          )}
          <input ref={invoiceFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && uploadSet(e.target.files[0], 'invoices')} />
        </div>

        <div className="card p-5">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Bank Statements</h4>
          {bankSet ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{bankSet.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{bankRows.length} entries</p>
              </div>
              <Check className="h-5 w-5 text-emerald-500" />
            </div>
          ) : (
            <button onClick={() => bankFileRef.current?.click()} disabled={loading || readOnly} className="btn-secondary w-full justify-center border-dashed py-6">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload bank CSV
            </button>
          )}
          <input ref={bankFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && uploadSet(e.target.files[0], 'bank')} />
        </div>
      </div>

      {invoiceSet && bankSet && !results && (
        <div className="flex justify-center gap-3">
          <button onClick={runMatch} className="btn-primary">
            <Scale className="h-4 w-4" />
            Run Reconciliation
          </button>
          <button onClick={reset} className="btn-secondary">Reset</button>
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{matchedCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Matched</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{partialCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Partial</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{unmatchedCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Unmatched</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={reset} className="btn-secondary">Start Over</button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Invoice</th>
                  <th className="px-2 py-3"></th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Bank</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Differences</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50">
                    <td className="px-4 py-3">
                      {row.invoice ? (
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{row.invoice.vendor ?? '—'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(row.invoice.date)} · {formatCurrency(row.invoice.amount)}</p>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {row.invoice && row.bank ? <ArrowRight className="mx-auto h-4 w-4 text-slate-400" /> : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.bank ? (
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{row.bank.vendor ?? '—'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(row.bank.date)} · {formatCurrency(row.bank.amount)}</p>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'matched' && <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Check className="mr-1 h-3 w-3" />Matched</span>}
                      {row.status === 'partial' && <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><AlertCircle className="mr-1 h-3 w-3" />Partial</span>}
                      {row.status === 'unmatched' && <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"><X className="mr-1 h-3 w-3" />Unmatched</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {row.amountDiff != null && <p>Amount diff: {formatCurrency(row.amountDiff, { signed: true })}</p>}
                      {row.dateDiff != null && <p>Date diff: {row.dateDiff} day{row.dateDiff !== 1 ? 's' : ''}</p>}
                      {row.amountDiff == null && row.dateDiff == null && row.status === 'matched' && <p className="text-emerald-600">Exact match</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
