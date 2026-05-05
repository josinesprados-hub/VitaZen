'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Gem, Plus, TrendingDown, TrendingUp, Lightbulb } from 'lucide-react';
import PremiumBlur from '@/components/ui/PremiumBlur';

interface FinanceLog {
  id: string;
  date: string;
  type: string;
  category: string;
  amount: number;
  description: string | null;
}

interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

export default function RiquezaPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';
  const [logs, setLogs] = useState<FinanceLog[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: 'expense', category: '', amount: 0, description: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fRes, tRes] = await Promise.all([
          apiFetch('/api/finance'),
          apiFetch('/api/empire/tips?empire=riqueza'),
        ]);
        if (fRes.ok) { const d = await fRes.json(); setLogs(d.logs); }
        if (tRes.ok) { const d = await tRes.json(); setTips(d.tips); }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const submitFinance = async () => {
    const res = await apiFetch('/api/finance', {
      method: 'POST',
      body: JSON.stringify({ date: new Date().toISOString().split('T')[0], ...form }),
    });
    if (res.ok) {
      const data = await res.json();
      setLogs([data.log, ...logs]);
      setShowAdd(false);
      setForm({ type: 'expense', category: '', amount: 0, description: '' });
    }
  };

  const totalIncome = logs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const totalExpense = logs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Gem size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Gem size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Finanzas</h1>
          <p className="text-[#999] text-sm">Finanzas, mentalidad financiera y gestión del dinero</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
          <p className="text-xs text-[#999] mb-1">Ingresos</p>
          <p className="text-xl font-bold text-[#c8a55a]">+{totalIncome.toFixed(2)}€</p>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
          <p className="text-xs text-[#999] mb-1">Gastos</p>
          <p className="text-xl font-bold text-red-400">-{totalExpense.toFixed(2)}€</p>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
          <p className="text-xs text-[#999] mb-1">Balance</p>
          <p className={`text-xl font-bold ${(totalIncome - totalExpense) >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
            {(totalIncome - totalExpense).toFixed(2)}€
          </p>
        </div>
      </div>

      {/* Add Transaction */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Movimientos</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="text-sm text-[#c8a55a] hover:text-[#d4b468]">
            <Plus size={18} className="inline mr-1" /> Añadir
          </button>
        </div>
        {showAdd && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'income' })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                <TrendingUp size={14} className="inline mr-1" /> Ingreso
              </button>
              <button onClick={() => setForm({ ...form, type: 'expense' })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                <TrendingDown size={14} className="inline mr-1" /> Gasto
              </button>
            </div>
            <input type="text" placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]" />
            <input type="number" placeholder="Cantidad (€)" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]" />
            <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]" />
            <div className="flex gap-2">
              <button onClick={submitFinance} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d4b468]">Guardar</button>
              <button onClick={() => setShowAdd(false)} className="text-[#999] px-4 py-2 text-sm">Cancelar</button>
            </div>
          </div>
        )}
        {logs.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-3">
                <div className="flex items-center gap-3">
                  {log.type === 'income' ? <TrendingUp size={16} className="text-[#c8a55a]" /> : <TrendingDown size={16} className="text-red-400" />}
                  <div>
                    <p className="text-sm text-white">{log.category}</p>
                    {log.description && <p className="text-xs text-[#666]">{log.description}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${log.type === 'income' ? 'text-[#c8a55a]' : 'text-red-400'}`}>
                    {log.type === 'income' ? '+' : '-'}{log.amount.toFixed(2)}€
                  </p>
                  <p className="text-xs text-[#666]">{new Date(log.date).toLocaleDateString('es')}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#666] text-sm text-center py-4">Registra tu primer movimiento</p>
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos</h2>
          </div>
          <div className="space-y-3">
            {tips.map((tip) => {
              const isLocked = tip.plan === 'PREMIUM' && !isPremium;
              const tipCard = (
                <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4">
                  <h3 className="text-[#c8a55a] font-medium text-sm mb-1">{tip.title}</h3>
                  <p className="text-[#999] text-sm">{tip.content}</p>
                </div>
              );
              return (
                <div key={tip.id}>
                  {isLocked ? <PremiumBlur>{tipCard}</PremiumBlur> : tipCard}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
