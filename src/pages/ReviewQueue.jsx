import { useMemo, useState } from 'react';
import { Check, X, AlertTriangle, Flag, Loader2, ShieldAlert } from 'lucide-react';
import { recomputeAnomalies, reviewTransaction } from '@/lib/transactions';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';
import { showToast } from '@/components/ui/Toast';

export function ReviewQueue({ transactions, onChange }) {
  const { session } = useAuth();
  const [acting, setActing] = useState(null);

  const flagged = useMemo(
    () => transactions.filter((t) =>
      (t.is_anomaly && (t.status === 'flagged' || t.status === 'pending'))
      || (t.requested_by_employee && t.status === 'pending')
    ),
    [transactions]
  );

  const reviewed = useMemo(
    () => transactions.filter((t) => t.status === 'approved' || t.status === 'rejected' || t.status === 'escalated').slice(0, 20),
    [transactions]
  );

  const handleAction = async (id, action) => {
    setActing(id);
    try {
      await reviewTransaction(id, action, session.user.id);
      await recomputeAnomalies();
      onChange();
      showToast('success', `Transaction ${action}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Review Queue</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {flagged.length} item{flagged.length !== 1 ? 's' : ''} awaiting review. Approve, reject, or escalate each item.
          </p>
        </div>
      </div>

      {flagged.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <Check className="mb-3 h-10 w-10 text-emerald-400" />
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">All clear</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No anomalies or employee expense requests pending review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flagged.map((tx) => (
            <div key={tx.id} className="card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                    <Flag className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{tx.vendor ?? 'Unknown vendor'}</p>
                      {tx.requested_by_employee && (
                        <span className="badge bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Employee Request</span>
                      )}
                      <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {tx.anomaly_confidence ?? 0}% confidence
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(tx.date)} · {tx.category ?? 'Uncategorized'} · {formatCurrency(tx.amount, { signed: true })}
                    </p>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      {tx.requested_by_employee ? `Requested by ${tx.requested_by_email ?? 'employee'}${tx.anomaly_reason ? ` · ${tx.anomaly_reason}` : ''}` : (tx.anomaly_reason ?? 'Flagged as anomalous')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAction(tx.id, 'approved')} disabled={acting === tx.id} className="btn-secondary text-emerald-700 dark:text-emerald-400">
                    {acting === tx.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve
                  </button>
                  <button onClick={() => handleAction(tx.id, 'rejected')} disabled={acting === tx.id} className="btn-secondary text-rose-700 dark:text-rose-400">
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                  <button onClick={() => handleAction(tx.id, 'escalated')} disabled={acting === tx.id} className="btn-secondary text-purple-700 dark:text-purple-400">
                    <AlertTriangle className="h-4 w-4" />
                    Escalate
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Recently Reviewed</h3>
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {reviewed.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{tx.vendor ?? 'Unknown'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(tx.date)} · {formatCurrency(tx.amount, { signed: true })}</p>
                </div>
                <span className={`badge ${
                  tx.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : tx.status === 'rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                }`}>
                  {tx.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
