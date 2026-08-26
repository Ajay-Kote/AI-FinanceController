export function formatCurrency(value, opts) {
  const signed = opts?.signed ?? false;
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (value < 0) return `-${formatted}`;
  return signed ? `+${formatted}` : formatted;
}

export function formatDate(value) {
  const d = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatPercent(value) {
  return `${Math.round(value)}%`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}
