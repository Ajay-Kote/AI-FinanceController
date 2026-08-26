import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

let toastId = 0;
const listeners = new Set();
let currentToasts = [];

export function showToast(kind, text) {
  const id = ++toastId;
  currentToasts = [...currentToasts, { id, kind, text }];
  listeners.forEach((l) => l(currentToasts));
  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    listeners.forEach((l) => l(currentToasts));
  }, 4000);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  const dismiss = (id) => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    setToasts(currentToasts);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`card flex items-center gap-3 px-4 py-3 shadow-lg animate-slide-in ${
            t.kind === 'success' ? 'border-emerald-300 dark:border-emerald-700' : 'border-rose-300 dark:border-rose-700'
          }`}
        >
          {t.kind === 'success' ? (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-500" />
          )}
          <span className="text-sm text-slate-700 dark:text-slate-200">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
