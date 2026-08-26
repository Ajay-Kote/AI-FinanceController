import { useMemo } from 'react';
import {
  TrendingUp,
  Wallet,
  Flag,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/format';

const PIE_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7'];

function StatCard({ label, value, icon: Icon, accent, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function Dashboard({ transactions }) {
  const stats = useMemo(() => {
    const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const net = income - expenses;
    const pendingAnomalies = transactions.filter((t) => t.is_anomaly && (t.status === 'flagged' || t.status === 'pending')).length;
    return { income, expenses, net, pendingAnomalies };
  }, [transactions]);

  const monthlyData = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      const m = t.date.slice(0, 7);
      if (!map.has(m)) map.set(m, { month: m, income: 0, expenses: 0 });
      const entry = map.get(m);
      if (t.amount > 0) entry.income += t.amount;
      else entry.expenses += Math.abs(t.amount);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [transactions]);

  const categoryData = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      if (t.amount < 0) {
        const cat = t.category ?? 'Uncategorized';
        map.set(cat, (map.get(cat) ?? 0) + Math.abs(t.amount));
      }
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [transactions]);

  const incomeVsExpense = useMemo(
    () => [
      { name: 'Income', value: stats.income },
      { name: 'Expenses', value: stats.expenses },
    ],
    [stats]
  );

  // Payments analytics: Razorpay-originated transactions
  const paymentStats = useMemo(() => {
    const rpTx = transactions.filter((t) => t.razorpay_order_id || t.razorpay_payment_id || t.vendor === 'Razorpay');
    const captured = rpTx.filter((t) => t.razorpay_status === 'captured');
    const failed = rpTx.filter((t) => t.razorpay_status === 'failed');
    const totalCollected = captured.reduce((s, t) => s + t.amount, 0);
    const successRate = rpTx.length > 0
      ? Math.round((captured.length / (captured.length + failed.length || 1)) * 100)
      : 0;

    // Daily collection data for chart
    const byDay = new Map();
    for (const t of captured) {
      if (!byDay.has(t.date)) byDay.set(t.date, { date: t.date, amount: 0 });
      byDay.get(t.date).amount += t.amount;
    }
    const dailyData = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

    return { rpTx, captured, failed, totalCollected, successRate, dailyData };
  }, [transactions]);

  const hasData = transactions.length > 0;
  const hasPayments = paymentStats.rpTx.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Income"
          value={formatCurrency(stats.income)}
          icon={ArrowUpRight}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
        />
        <StatCard
          label="Total Expenses"
          value={formatCurrency(stats.expenses)}
          icon={ArrowDownRight}
          accent="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400"
        />
        <StatCard
          label="Net Balance"
          value={formatCurrency(stats.net)}
          icon={Wallet}
          accent="bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400"
          sub={stats.net >= 0 ? 'Surplus' : 'Deficit'}
        />
        <StatCard
          label="Pending Anomalies"
          value={String(stats.pendingAnomalies)}
          icon={Flag}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
          sub={stats.pendingAnomalies > 0 ? 'Needs review' : 'All clear'}
        />
      </div>

      {/* Payments Analytics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brand-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Razorpay Collected</p>
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(paymentStats.totalCollected)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Successful</p>
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400">{paymentStats.captured.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Failed</p>
          </div>
          <p className="mt-2 text-xl font-bold text-rose-600 dark:text-rose-400">{paymentStats.failed.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-500" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Success Rate</p>
          </div>
          <p className="mt-2 text-xl font-bold text-brand-600 dark:text-brand-400">{formatPercent(paymentStats.successRate)}</p>
        </div>
      </div>

      {hasData ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Expense by Category</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5 lg:col-span-3">
            <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Income vs Expenses</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={incomeVsExpense}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {hasPayments && (
            <div className="card p-5 lg:col-span-3">
              <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Razorpay Collections (Daily)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentStats.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <TrendingUp className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No transactions yet</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add transactions from the Transactions page to see your financial dashboard populate.
          </p>
        </div>
      )}
    </div>
  );
}
