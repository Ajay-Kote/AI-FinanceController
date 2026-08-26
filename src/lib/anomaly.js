// Flag if amount is significantly higher than the category average.
// Threshold: |amount| > 3x the mean absolute amount for that category.
function detectAmountOutlier(tx, all) {
  if (!tx.category) return null;
  const sameCat = all.filter((t) => t.category === tx.category && t.id !== tx.id && !t.is_anomaly);
  if (sameCat.length < 3) return null; // need a baseline
  const avg = sameCat.reduce((s, t) => s + Math.abs(t.amount), 0) / sameCat.length;
  const amt = Math.abs(tx.amount);
  if (amt > avg * 3 && amt > avg + 500) {
    const ratio = avg > 0 ? amt / avg : 0;
    const confidence = Math.min(95, Math.round(60 + (ratio - 3) * 10));
    return {
      isAnomaly: true,
      reason: `Amount ${ratio.toFixed(1)}x the category average for ${tx.category}`,
      confidence,
    };
  }
  return null;
}

// Flag duplicates: same amount + vendor within 2 days.
function detectDuplicate(tx, all) {
  const txDate = new Date(tx.date).getTime();
  const dup = all.find((t) => {
    if (t.id === tx.id) return false;
    if (t.amount !== tx.amount) return false;
    if ((t.vendor ?? '') !== (tx.vendor ?? '')) return false;
    const diff = Math.abs(new Date(t.date).getTime() - txDate);
    return diff <= 2 * 24 * 60 * 60 * 1000;
  });
  if (dup) {
    return {
      isAnomaly: true,
      reason: `Possible duplicate: same amount and vendor as ${dup.date}`,
      confidence: 85,
    };
  }
  return null;
}

// Flag transactions outside normal business hours (before 6am or after 10pm UTC).
function detectOffHours(tx) {
  const d = new Date(tx.date + 'T00:00:00Z');
  const hour = d.getUTCHours();
  if (hour < 6 || hour >= 22) {
    return {
      isAnomaly: true,
      reason: 'Transaction recorded outside normal business hours',
      confidence: 55,
    };
  }
  return null;
}

// Run all detectors and return the first hit (priority: duplicate > outlier > off-hours).
export function detectAnomaly(tx, all) {
  const dup = detectDuplicate(tx, all);
  if (dup) return dup;
  const outlier = detectAmountOutlier(tx, all);
  if (outlier) return outlier;
  const off = detectOffHours(tx);
  if (off) return off;
  return { isAnomaly: false, reason: null, confidence: null };
}
