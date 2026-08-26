import { useMemo, useState } from 'react';
import { CreditCard, RotateCcw, Loader2, CheckCircle2, XCircle, Clock, IndianRupee } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { processRazorpayRefund } from '@/lib/razorpay';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';

const STATUS_CONFIG = {
  captured: { label: 'Captured', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  refunded: { label: 'Refunded', icon: RotateCcw, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  pending: { label: 'Pending', icon: Clock, className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

export function Payments({ transactions, onChange, readOnly }) {
  const [refundTarget, setRefundTarget] = useState(null);
  const [refunding, setRefunding] = useState(false);

  const razorpayTx = useMemo(
    () => transactions.filter((t) => t.razorpay_order_id || t.razorpay_payment_id || t.vendor === 'Razorpay'),
    [transactions]
  );

  const stats = useMemo(() => {
    const captured = razorpayTx.filter((t) => t.razorpay_status === 'captured');
    const failed = razorpayTx.filter((t) => t.razorpay_status === 'failed');
    const refunded = razorpayTx.filter((t) => t.razorpay_status === 'refunded');
    const totalCaptured = captured.reduce((s, t) => s + t.amount, 0);
    const totalRefunded = refunded.reduce((s, t) => s + Math.abs(t.amount), 0);
    const successRate = razorpayTx.length > 0
      ? Math.round((captured.length / (captured.length + failed.length || 1)) * 100)
      : 0;
    return { captured, failed, refunded, totalCaptured, totalRefunded, successRate };
  }, [razorpayTx]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    await processRazorpayRefund({
      transactionId: refundTarget.id,
      paymentId: refundTarget.razorpay_payment_id,
      onSuccess: () => {
        showToast('success', 'Refund processed successfully');
        setRefundTarget(null);
        onChange();
      },
      onError: (err) => {
        showToast('error', err instanceof Error ? err.message : 'Refund failed');
      },
    });
    setRefunding(false);
  };

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
          <CreditCard className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Payments</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">All Razorpay payments with status and refund management.</p>
        </div>
        <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Test Mode
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Collected</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(stats.totalCaptured)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Successful</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.captured.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Failed</p>
          <p className="mt-1 text-xl font-bold text-rose-600 dark:text-rose-400">{stats.failed.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Success Rate</p>
          <p className="mt-1 text-xl font-bold text-brand-600 dark:text-brand-400">{stats.successRate}%</p>
        </div>
      </div>

      {razorpayTx.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <CreditCard className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No payments yet</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use the "Make Payment" button to accept a payment via Razorpay.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Payment ID</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300 lg:table-cell">Order ID</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300 sm:table-cell">Method</th>
                  {!readOnly && <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {razorpayTx.map((tx) => {
                  const sc = STATUS_CONFIG[tx.razorpay_status] || STATUS_CONFIG.pending;
                  const StatusIcon = sc.icon;
                  const canRefund = tx.razorpay_status === 'captured' && tx.razorpay_payment_id && !readOnly;
                  return (
                    <tr key={tx.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(tx.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {tx.razorpay_payment_id ?? '—'}
                      </td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 lg:table-cell">
                        {tx.razorpay_order_id ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100">
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${sc.className}`}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 dark:text-slate-300 sm:table-cell">
                        {tx.payment_method === 'credit_card' ? 'Card' : tx.payment_method}
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-right">
                          {canRefund ? (
                            <button
                              onClick={() => setRefundTarget(tx)}
                              className="btn-ghost p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400"
                              title="Refund payment"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!refundTarget} onClose={() => setRefundTarget(null)} title="Refund Payment" size="sm">
        {refundTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <p className="flex items-center gap-2 font-medium">
                <RotateCcw className="h-4 w-4" />
                Confirm Refund
              </p>
              <p className="mt-1 text-xs">
                You are about to refund <strong>{formatCurrency(refundTarget.amount)}</strong> for payment{' '}
                <span className="font-mono">{refundTarget.razorpay_payment_id}</span>.
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setRefundTarget(null)} className="btn-secondary" disabled={refunding}>Cancel</button>
              <button onClick={handleRefund} disabled={refunding} className="btn-primary bg-amber-600 hover:bg-amber-700">
                {refunding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Process Refund
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
