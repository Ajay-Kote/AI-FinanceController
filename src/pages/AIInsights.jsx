import { useRef, useState, useEffect } from 'react';
import { Sparkles, Send, Loader2, User, Bot, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/Toast';

const SUGGESTIONS = [
  'Why did expenses spike in March?',
  "Summarize this month's spending",
  'What are my top spending categories?',
  'How does my net balance look?',
  'Are there any unusual transactions?',
  'What is my average monthly revenue?',
];

let msgId = 0;

export function AIInsights() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const ask = async (question) => {
    if (!question.trim() || loading) return;
    const userMsg = { id: ++msgId, role: 'user', text: question };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      if (!data.answer) throw new Error('Invalid response from insights service');

      const assistantMsg = {
        id: ++msgId,
        role: 'assistant',
        text: data.answer,
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to get insights');
      const errorMsg = {
        id: ++msgId,
        role: 'assistant',
        text: 'Sorry, I could not process your request. Please try again.',
      };
      setMessages((m) => [...m, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="card mb-4 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">AI Insights</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ask questions about your finances in plain language.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="btn-ghost p-2" title="Clear conversation">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="card flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/40 dark:to-brand-800/40">
              <Bot className="h-8 w-8 text-brand-600 dark:text-brand-400" />
            </div>
            <p className="mb-1 text-base font-medium text-slate-700 dark:text-slate-200">Ask me anything about your financial data</p>
            <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">I analyze your transactions, payments, and anomalies to give you insights.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:bg-brand-950/40 dark:hover:text-brand-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-tr-sm bg-brand-600 text-white'
                      : 'rounded-tl-sm bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
                {msg.role === 'user' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 dark:bg-slate-800">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                  <span className="text-sm text-slate-400">Analyzing your data...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your finances..."
          className="input flex-1"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
