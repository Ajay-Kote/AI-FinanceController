import { Menu, ShieldCheck, Eye, CreditCard } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle.jsx';
import { useAuth } from '@/lib/auth';

export function Topbar({ title, onMenuClick, onMakePayment }) {
  const { role } = useAuth();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 lg:px-6">
      <button onClick={onMenuClick} className="btn-ghost p-2 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <h2 className="flex-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="flex items-center gap-2">
        {onMakePayment && (
          <button onClick={onMakePayment} className="btn-primary text-sm">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Make Payment</span>
          </button>
        )}
        <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:flex">
          {role === 'admin' ? <ShieldCheck className="h-3.5 w-3.5 text-brand-600" /> : <Eye className="h-3.5 w-3.5 text-slate-500" />}
          <span className="capitalize">{role}</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
