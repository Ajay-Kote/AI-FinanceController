import { useMemo, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Upload,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Flag,
  Loader2,
  Download,
} from 'lucide-react';
import { CATEGORIES, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/lib/types';
import { bulkInsertTransactions, createTransaction, deleteTransaction, recomputeAnomalies, updateTransaction } from '@/lib/transactions';
import { parseTransactionsCsv } from '@/lib/csv';
import { suggestCategory } from '@/lib/categorize';
import { classNames, formatCurrency, formatDate } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { showToast } from '@/components/ui/Toast';

const PAGE_SIZE = 10;

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  category: null,
  description: '',
  vendor: '',
  payment_method: 'credit_card',
};

export function Transactions({ transactions, onChange, readOnly }) {
  const { session } = useAuth();
  const isAdmin = !readOnly;
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const fileInputRef = useRef(null);

  const filtered = useMemo(() => {
    let result = [...transactions];
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (t) =>
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.vendor ?? '').toLowerCase().includes(q) ||
          (t.category ?? '').toLowerCase().includes(q)
      );
    }
    if (filterCategory !== 'all') {
      result = result.filter((t) => (t.category ?? 'Uncategorized') === filterCategory);
    }
    if (filterStatus !== 'all') {
      result = result.filter((t) => t.status === filterStatus);
    }
    if (dateFrom) result = result.filter((t) => t.date >= dateFrom);
    if (dateTo) result = result.filter((t) => t.date <= dateTo);
    const min = parseFloat(minAmount);
    const max = parseFloat(maxAmount);
    if (!isNaN(min)) result = result.filter((t) => Math.abs(t.amount) >= min);
    if (!isNaN(max)) result = result.filter((t) => Math.abs(t.amount) <= max);

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'amount') cmp = a.amount - b.amount;
      else if (sortKey === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '');
      else if (sortKey === 'vendor') cmp = (a.vendor ?? '').localeCompare(b.vendor ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [transactions, search, filterCategory, filterStatus, dateFrom, dateTo, minAmount, maxAmount, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (tx) => {
    setEditing(tx);
    setForm({
      date: tx.date,
      amount: tx.amount,
      category: tx.category,
      description: tx.description,
      vendor: tx.vendor,
      payment_method: tx.payment_method,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, {
          date: form.date,
          amount: form.amount,
          category: form.category,
          description: form.description,
          vendor: form.vendor,
          payment_method: form.payment_method,
        });
        showToast('success', 'Transaction updated');
      } else {
        await createTransaction(form);
        showToast('success', 'Transaction added');
      }
      await recomputeAnomalies();
      onChange();
      setModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await deleteTransaction(id);
      await recomputeAnomalies();
      onChange();
      showToast('success', 'Transaction deleted');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ''));
      setCsvOpen(true);
    };
    reader.readAsText(file);
  };

  const handleCsvUpload = async () => {
    setCsvUploading(true);
    try {
      const { rows, errors } = parseTransactionsCsv(csvText);
      if (rows.length === 0) {
        showToast('error', 'No valid rows found in CSV');
        return;
      }
      await bulkInsertTransactions(rows);
      await recomputeAnomalies();
      onChange();
      setCsvOpen(false);
      setCsvText('');
      showToast('success', `Uploaded ${rows.length} transactions${errors.length ? ` (${errors.length} rows skipped)` : ''}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'CSV upload failed');
    } finally {
      setCsvUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'date,amount,category,description,vendor,payment_method\n2025-01-15,-120.00,Software,GitHub subscription,GitHub,credit_card\n2025-01-16,5000.00,Revenue,Invoice #1001,Acme Corp,bank_transfer\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const suggestedCat = !form.category ? suggestCategory(form.description, form.vendor) : null;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search description, vendor, category..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="input pl-10"
            />
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">CSV Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <button onClick={openCreate} className="btn-primary">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }} className="input">
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="Uncategorized">Uncategorized</option>
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }} className="input">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="cleared">Cleared</option>
            <option value="flagged">Flagged</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="escalated">Escalated</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="input" title="From date" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="input" title="To date" />
          <input type="number" placeholder="Min $" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(0); }} className="input" />
          <input type="number" placeholder="Max $" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setPage(0); }} className="input" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort('date')} className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                    Date <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort('vendor')} className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                    Vendor <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-left md:table-cell">
                  <button onClick={() => toggleSort('category')} className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                    Category <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-left lg:table-cell">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Description</span>
                </th>
                <th className="px-4 py-3 text-right">
                  <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                    Amount <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-left sm:table-cell">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Method</span>
                </th>
                <th className="px-4 py-3 text-left">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Status</span>
                </th>
                {isAdmin && <th className="px-4 py-3 text-right">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Actions</span>
                </th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    No transactions found. {isAdmin && 'Click "Add" or upload a CSV to get started.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{tx.vendor ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 dark:text-slate-300 md:table-cell">
                      {tx.category ?? <span className="text-slate-400">Uncategorized</span>}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-4 py-3 text-slate-600 dark:text-slate-300 lg:table-cell" title={tx.description ?? ''}>
                      {tx.description ?? '—'}
                    </td>
                    <td className={classNames('px-4 py-3 text-right font-semibold', tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100')}>
                      {formatCurrency(tx.amount, { signed: true })}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 dark:text-slate-300 sm:table-cell">{PAYMENT_METHOD_LABELS[tx.payment_method]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={tx.status} />
                        {tx.is_anomaly && <span title={tx.anomaly_reason ?? 'Anomaly'}><Flag className="h-3.5 w-3.5 text-amber-500" /></span>}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(tx)} className="btn-ghost p-1.5" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(tx.id)} className="btn-ghost p-1.5 text-rose-500 hover:text-rose-600" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} · Page {currentPage + 1} of {totalPages}
          </p>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="btn-ghost p-1.5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="btn-ghost p-1.5">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Transaction' : 'Add Transaction'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vendor</label>
              <input type="text" value={form.vendor ?? ''} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                value={form.category ?? ''}
                onChange={(e) => setForm({ ...form, category: e.target.value || null })}
                className="input"
              >
                <option value="">Auto-categorize</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {suggestedCat && !form.category && (
                <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Suggested: {suggestedCat}</p>
              )}
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input type="text" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Payment Method</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              className="input"
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="Upload CSV Transactions" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            <p className="mb-1 font-medium">Expected columns: date, amount, category, description, vendor, payment_method</p>
            <p>Category is optional (leave empty for auto-categorization). Amount: positive = income, negative = expense.</p>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            placeholder="date,amount,category,description,vendor,payment_method&#10;2025-01-15,-120.00,Software,GitHub subscription,GitHub,credit_card"
            className="input font-mono text-xs"
          />
          <div className="flex justify-between">
            <button onClick={downloadTemplate} className="btn-ghost text-xs">
              <Download className="h-3.5 w-3.5" />
              Download template
            </button>
            <div className="flex gap-2">
              <button onClick={() => setCsvOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCsvUpload} disabled={csvUploading || !csvText.trim()} className="btn-primary">
                {csvUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
