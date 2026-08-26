import { supabase } from './supabase';
import { detectAnomaly } from './anomaly';
import { suggestCategory } from './categorize';

export async function fetchTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTransaction(input) {
  // Auto-categorize when no category provided.
  let category = input.category;
  if (!category) {
    category = suggestCategory(input.description, input.vendor);
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      date: input.date,
      amount: input.amount,
      category,
      description: input.description,
      vendor: input.vendor,
      payment_method: input.payment_method,
      status: input.status ?? 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// After creating/updating, re-run anomaly detection across the user's full set
// and persist flags. Returns the updated transactions.
export async function recomputeAnomalies() {
  const all = await fetchTransactions();
  const updates = [];
  for (const tx of all) {
    const result = detectAnomaly(tx, all);
    const shouldFlag = result.isAnomaly;
    if (tx.is_anomaly !== shouldFlag || tx.anomaly_reason !== result.reason || tx.anomaly_confidence !== result.confidence) {
      updates.push(
        (async () => {
          const { error } = await supabase
            .from('transactions')
            .update({
              is_anomaly: shouldFlag,
              anomaly_reason: shouldFlag ? result.reason : null,
              anomaly_confidence: shouldFlag ? result.confidence : null,
              status: shouldFlag && tx.status === 'pending' ? 'flagged' : tx.status,
            })
            .eq('id', tx.id);
          if (error) throw error;
        })()
      );
    }
  }
  await Promise.all(updates);
  return fetchTransactions();
}

export async function updateTransaction(id, patch) {
  const { error } = await supabase.from('transactions').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkInsertTransactions(inputs) {
  const rows = inputs.map((input) => ({
    date: input.date,
    amount: input.amount,
    category: input.category || suggestCategory(input.description, input.vendor),
    description: input.description,
    vendor: input.vendor,
    payment_method: input.payment_method,
    status: 'pending',
  }));
  const { error } = await supabase.from('transactions').insert(rows);
  if (error) throw error;
}

export async function reviewTransaction(id, action, reviewerId) {
  const { error } = await supabase
    .from('transactions')
    .update({
      status: action,
      is_anomaly: false,
      anomaly_reason: null,
      anomaly_confidence: null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}
