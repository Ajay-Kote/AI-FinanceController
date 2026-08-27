import { useState } from 'react';
import { IndianRupee, Loader2 } from 'lucide-react';
import { CATEGORIES } from '@/lib/types';
import { createExpenseRequest } from '@/lib/transactions';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';

const initialForm = {
  amount: '',
  category: 'Other',
  vendor: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
};

export function ExpenseRequestModal({ open, onClose, onSubmitted }) {
  const { session } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0 || !form.vendor.trim() || !form.description.trim()) {
      showToast('error', 'Enter an amount, vendor, and description');
      return;
    }
    setSaving(true);
    try {
      await createExpenseRequest({ ...form, amount }, session.user);
      showToast('success', 'Expense request submitted for approval');
      setForm(initialForm);
      onClose();
      onSubmitted?.();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to submit expense request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request Expense" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="expense-amount">Amount (₹)</label>
          <div className="relative">
            <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="expense-amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => update('amount', e.target.value)} className="input pl-10" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="expense-category">Category</label>
          <select id="expense-category" value={form.category} onChange={(e) => update('category', e.target.value)} className="input">
            {CATEGORIES.filter((category) => category !== 'Revenue').map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="expense-vendor">Vendor / Payee</label>
          <input id="expense-vendor" type="text" required value={form.vendor} onChange={(e) => update('vendor', e.target.value)} className="input" placeholder="Vendor or payee name" />
        </div>
        <div>
          <label className="label" htmlFor="expense-description">Description</label>
          <textarea id="expense-description" required value={form.description} onChange={(e) => update('description', e.target.value)} className="input min-h-20" placeholder="Why is this expense needed?" />
        </div>
        <div>
          <label className="label" htmlFor="expense-date">Date</label>
          <input id="expense-date" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className="input" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Request
          </button>
        </div>
      </form>
    </Modal>
  );
}