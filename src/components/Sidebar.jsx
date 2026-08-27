import { LayoutDashboard, ArrowLeftRight, Flag, Scale, Sparkles, CreditCard, LogOut, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { classNames } from '@/lib/format';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'review', label: 'Review Queue', icon: Flag, adminOnly: true },
  { id: 'reconciliation', label: 'Reconciliation', icon: Scale },
  { id: 'insights', label: 'AI Insights', icon: Sparkles },
];

export function Sidebar({ current, onNavigate, open, onClose }) {
  const { role, signOut, profile } = useAuth();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin');

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">FinControl AI</h1>
              <p className="max-w-[155px] truncate text-xs text-slate-500 dark:text-slate-400">{profile?.organizations?.name ?? 'Finance Controller'}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 lg:hidden" aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                className={classNames(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {(profile?.email ?? '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{profile?.email}</p>
              <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{role}</p>
            </div>
          </div>
          <button onClick={signOut} className="btn-ghost w-full justify-start gap-3">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
