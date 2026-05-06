'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Gem, Plus, TrendingDown, TrendingUp, Lightbulb, Pencil, Trash2, Wallet } from 'lucide-react';
import PremiumBlur from '@/components/ui/PremiumBlur';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';

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
  const [editingLog, setEditingLog] = useState<FinanceLog | null>(null);
  const [editForm, setEditForm] = useState({ type: 'expense', category: '', amount: 0, description: '', date: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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

  const startEdit = (log: FinanceLog) => {
    setEditingLog(log);
    setEditForm({ type: log.type, category: log.category, amount: log.amount, description: log.description || '', date: log.date.split('T')[0] });
  };

  const saveEdit = async () => {
    if (!editingLog) return;
    setEditSaving(true);
    try {
      console.log('[CRUD DEBUG] Finance PUT - logId:', editingLog.id);
      const res = await apiFetch('/api/finance', {
        method: 'PUT',
        body: JSON.stringify({ logId: editingLog.id, date: editForm.date, type: editForm.type, category: editForm.category, amount: editForm.amount, description: editForm.description }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => prev.map(l => l.id === editingLog.id ? data.log : l));
        setEditingLog(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Finance PUT failed:', res.status, errData);
      }
    } catch (error) { console.error('Error updating finance log:', error); }
    finally { setEditSaving(false); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      console.log('[CRUD DEBUG] Finance DELETE - logId:', pendingDeleteId);
      const res = await apiFetch('/api/finance', {
        method: 'DELETE',
        body: JSON.stringify({ logId: pendingDeleteId }),
      });
      if (res.ok) {
        setLogs(prev => prev.filter(l => l.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Finance DELETE failed:', res.status, errData);
      }
    } catch (error) { console.error('Error deleting finance log:', error); }
    finally { setPendingDeleteId(null); }
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
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Edit Finance Log Overlay */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setEditingLog(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar registro</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setEditForm({ ...editForm, type: 'income' })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${editForm.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                  Ingreso
                </button>
                <button onClick={() => setEditForm({ ...editForm, type: 'expense' })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${editForm.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                  Gasto
                </button>
              </div>
              <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
              <input type="text" placeholder="Categoría" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <input type="number" placeholder="Cantidad (€)" value={editForm.amount || ''} onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <input type="text" placeholder="Descripción (opcional)" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingLog(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-lg hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} className="bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-lg hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setPendingDeleteId(null)}>
          <div className="modal-content-destructive p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar registro</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-lg hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Gem size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Finanzas</h1>
          <p className="text-[#999] text-sm">Control financiero, ahorro y libertad económica</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-5">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <p className="text-xs text-[#666] mb-1">Ingresos</p>
          <p className="text-xl font-bold text-[#c8a55a]">+{totalIncome.toFixed(2)}€</p>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <p className="text-xs text-[#666] mb-1">Gastos</p>
          <p className="text-xl font-bold text-red-400">-{totalExpense.toFixed(2)}€</p>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <p className="text-xs text-[#666] mb-1">Balance</p>
          <p className={`text-xl font-bold ${(totalIncome - totalExpense) >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
            {(totalIncome - totalExpense).toFixed(2)}€
          </p>
        </div>
      </div>

      {/* Add Transaction */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Registro Financiero</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="text-sm text-[#c8a55a] hover:text-[#d4b468]">
            <Plus size={18} className="inline mr-1" /> Añadir
          </button>
        </div>
        <p className="text-[#666] text-xs mb-5">Cada movimiento registrado es un paso hacia el control</p>
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
              <div key={log.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 group hover:border-[#222] transition-colors">
                <div className="flex items-center gap-3">
                  {log.type === 'income' ? <TrendingUp size={16} className="text-[#c8a55a]" /> : <TrendingDown size={16} className="text-red-400" />}
                  <div>
                    <p className="text-sm text-white">{log.category}</p>
                    {log.description && <p className="text-xs text-[#666]">{log.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={`text-sm font-medium ${log.type === 'income' ? 'text-[#c8a55a]' : 'text-red-400'}`}>
                      {log.type === 'income' ? '+' : '-'}{log.amount.toFixed(2)}€
                    </p>
                    <p className="text-xs text-[#666]">{new Date(log.date).toLocaleDateString('es')}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(log)} className="p-1.5 rounded-lg hover:bg-[#c8a55a]/10 text-[#555] hover:text-[#c8a55a] transition-all" title="Editar"><Pencil size={13} /></button>
                    <button onClick={() => setPendingDeleteId(log.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-all" title="Eliminar"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <PremiumEmptyState
            icon={Wallet}
            title="Sin movimientos registrados"
            subtitle="Registra tu primer movimiento y toma control de tus finanzas"
            cta="Añadir movimiento"
            onCta={() => setShowAdd(true)}
            size="sm"
          />
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos de Expertos</h2>
          </div>
          <p className="text-[#666] text-xs mb-5">Estrategias financieras para una base sólida</p>
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
