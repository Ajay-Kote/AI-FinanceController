import { useEffect, useState } from 'react';
import { Loader2, CreditCard, AlertCircle, RotateCcw } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { fetchTransactions, recomputeAnomalies } from '@/lib/transactions';
import { seedSampleData } from '@/lib/seed';
import { startRazorpayPayment } from '@/lib/razorpay';
import { Login } from '@/pages/Login';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Dashboard } from '@/pages/Dashboard';
import { Transactions } from '@/pages/Transactions';
import { Payments } from '@/pages/Payments';
import { ReviewQueue } from '@/pages/ReviewQueue';
import { Reconciliation } from '@/pages/Reconciliation';
import { AIInsights } from '@/pages/AIInsights';
import { ToastContainer } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  payments: 'Payments',
  review: 'Review Queue',
  reconciliation: 'Reconciliation',
  insights: 'AI Insights',
};

function PaymentModal({ open, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Enter a valid amount greater than 0');
      return;
    }
    setPaying(true);
    setError(null);
    await startRazorpayPayment({
      amount: amt,
      description: description || 'Payment via FinControl AI',
      onSuccess: (tx) => {
        setPaying(false);
        setAmount('');
        setDescription('');
        onClose();
        if (onSuccess) onSuccess(tx);
      },
      onError: (err) => {
        setPaying(false);
        const msg = err instanceof Error ? err.message : 'Payment failed';
        if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('closed')) {
          setError(null);
        } else {
          setError(msg);
        }
      },
    });
  };

  const handleTryAgain = () => {
    setError(null);
    handlePay();
  };

  return (
    <Modal open={open} onClose={onClose} title="Make Payment" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">
            T
          </span>
          Test Mode — no real money will be charged. Use test card numbers from Razorpay docs.
        </div>

        <div className="rounded-lg bg-brand-50 p-3 text-xs text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          <p className="flex items-center gap-1.5 font-medium">
            <CreditCard className="h-3.5 w-3.5" />
            Razorpay Checkout (Test Mode)
          </p>
          <p className="mt-1">Payments are processed in INR. After successful payment, a transaction is automatically created in your dashboard.</p>
        </div>

        <div>
          <label className="label">Amount (INR)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input pl-7"
              placeholder="1,000.00"
              disabled={paying}
            />
          </div>
          {amount && parseFloat(amount) > 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        <div>
          <label className="label">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="Invoice payment, client deposit, etc."
            disabled={paying}
          />
        </div>

        {error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={handleTryAgain} disabled={paying} className="btn-secondary w-full justify-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary" disabled={paying}>Cancel</button>
          <button onClick={handlePay} disabled={paying || !amount} className="btn-primary">
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pay Now
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AppContent() {
  const { session, profile, loading, role } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const loadTransactions = async () => {
    setDataLoading(true);
    try {
      let data = await fetchTransactions();
      if (data.length === 0 && role === 'admin' && session) {
        await seedSampleData(session.user.id);
        await recomputeAnomalies();
        data = await fetchTransactions();
      }
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      void loadTransactions();
    } else {
      setTransactions([]);
    }
  }, [session]);

  useEffect(() => {
    if (role === 'viewer' && page === 'review') {
      setPage('dashboard');
    }
  }, [role, page]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!session || !profile) {
    return <Login />;
  }

  const isAdmin = role === 'admin';

  const handleRefresh = async () => {
    await recomputeAnomalies();
    await loadTransactions();
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar current={page} onNavigate={setPage} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={PAGE_TITLES[page]}
          onMenuClick={() => setSidebarOpen(true)}
          onMakePayment={isAdmin ? () => setPaymentOpen(true) : undefined}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {dataLoading && transactions.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : (
            <>
              {page === 'dashboard' && <Dashboard transactions={transactions} />}
              {page === 'transactions' && (
                <Transactions transactions={transactions} onChange={handleRefresh} readOnly={!isAdmin} />
              )}
              {page === 'payments' && <Payments transactions={transactions} onChange={handleRefresh} readOnly={!isAdmin} />}
              {page === 'review' && isAdmin && <ReviewQueue transactions={transactions} onChange={handleRefresh} />}
              {page === 'reconciliation' && <Reconciliation />}
              {page === 'insights' && <AIInsights />}
            </>
          )}
        </main>
      </div>
      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => {
          handleRefresh();
        }}
      />
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
