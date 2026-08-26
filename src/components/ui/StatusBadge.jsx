import { STATUS_LABELS } from '@/lib/types';
import { classNames } from '@/lib/format';

const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  cleared: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  flagged: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  escalated: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

export function StatusBadge({ status }) {
  return <span className={classNames('badge', STATUS_STYLES[status])}>{STATUS_LABELS[status]}</span>;
}
