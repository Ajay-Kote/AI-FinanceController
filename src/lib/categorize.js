// Rule-based keyword classifier. Replace with a trained ML model later.
// Each rule: category + list of keywords matched against description/vendor (case-insensitive).
const RULES = [
  { category: 'Payroll', keywords: ['payroll', 'salary', 'wages', 'gusto', 'adp', 'deputy'] },
  { category: 'Software', keywords: ['aws', 'github', 'vercel', 'sentry', 'datadog', 'figma', 'notion', 'slack', 'google workspace', 'adobe', 'openai', 'claude', 'subscription'] },
  { category: 'Office Supplies', keywords: ['staples', 'office depot', 'amazon office', 'paper', 'stationery', 'ink'] },
  { category: 'Marketing', keywords: ['facebook', 'google ads', 'advertising', 'mailchimp', 'hubspot', 'adobe marketing', 'linkedin ads', 'tiktok ads'] },
  { category: 'Travel', keywords: ['uber', 'lyft', 'airline', 'hotel', 'flight', 'delta', 'marriott', 'airbnb', 'hertz', 'enterprise'] },
  { category: 'Meals', keywords: ['restaurant', 'doordash', 'grubhub', 'starbucks', 'catering', 'lunch', 'dinner'] },
  { category: 'Utilities', keywords: ['electric', 'water', 'gas company', 'comcast', 'verizon', 'att ', 'internet', 'utility'] },
  { category: 'Rent', keywords: ['rent', 'lease', 'landlord', 'property management'] },
  { category: 'Consulting', keywords: ['consulting', 'contractor', 'freelance', 'agency', 'legal', 'law firm', 'counsel'] },
  { category: 'Hardware', keywords: ['apple', 'dell', 'best buy', 'newegg', 'laptop', 'monitor', 'server', 'hardware'] },
  { category: 'Taxes', keywords: ['irs', 'tax', 'sales tax', 'payroll tax'] },
  { category: 'Insurance', keywords: ['insurance', 'allstate', 'geico', 'aetna', 'broker'] },
  { category: 'Refund', keywords: ['refund', 'reversal', 'chargeback', 'return'] },
  { category: 'Revenue', keywords: ['stripe', 'paypal', 'invoice paid', 'payment received', 'client payment', 'deposit', 'razorpay'] },
];

export function suggestCategory(description, vendor) {
  const text = `${description ?? ''} ${vendor ?? ''}`.toLowerCase();
  if (!text.trim()) return null;
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.category;
    }
  }
  return 'Other';
}
