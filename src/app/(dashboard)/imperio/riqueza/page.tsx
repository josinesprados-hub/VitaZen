'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import {
  Gem, Plus, TrendingDown, TrendingUp, Pencil, Trash2, Wallet,
  Calendar, Clock, ArrowUpRight, ArrowDownRight, Minus,
  Activity, Target, Sparkles, CircleDot
} from 'lucide-react';
import EmpireTipsSection from '@/components/ui/EmpireTipsSection';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { EmpireSkeleton } from '@/components/ui/PremiumSkeleton';
import { NumericInput } from '@/components/ui/NumericInput';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

interface FinanceLog {
  id: string;
  date: string;
  type: string;
  category: string;
  amount: number;
  description: string | null;
  mood: string | null;
  createdAt: string;
}

type Period = 'month' | 'prev' | 'all';

const MOODS = [
  { value: 'calm', label: 'Tranquilo', color: 'text-emerald-400' },
  { value: 'conscious', label: 'Consciente', color: 'text-[#c8a55a]' },
  { value: 'impulse', label: 'Impulso', color: 'text-orange-400' },
  { value: 'necessary', label: 'Necesario', color: 'text-blue-400' },
] as const;

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function filterLogsByRange(logs: FinanceLog[], start: Date, end: Date) {
  return logs.filter(l => {
    const d = new Date(l.date);
    return d >= start && d <= end;
  });
}

function groupLogsByDate(logs: FinanceLog[]) {
  const groups: Record<string, FinanceLog[]> = {};
  for (const log of logs) {
    const key = new Date(log.date).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  }
  return groups;
}

function formatCurrency(n: number) {
  return n.toFixed(2) + '€';
}

function getMoodLabel(mood: string | null) {
  return MOODS.find(m => m.value === mood) || null;
}

function getHealthStatus(savingsRate: number, balance: number) {
  if (balance < 0) return { label: 'Atento', color: 'text-red-400', dot: 'bg-red-400' };
  if (savingsRate >= 20) return { label: 'Estable', color: 'text-emerald-400', dot: 'bg-emerald-400' };
  if (savingsRate >= 5) return { label: 'Consciente', color: 'text-[#c8a55a]', dot: 'bg-[#c8a55a]' };
  return { label: 'Ajustando', color: 'text-orange-400', dot: 'bg-orange-400' };
}

function getInsight(
  balance: number,
  savingsRate: number,
  prevBalance: number,
  prevSavingsRate: number,
  hasPrevData: boolean
) {
  if (!hasPrevData) {
    if (balance > 0) return 'Buen comienzo. Registrar es el primer paso hacia la libertad financiera.';
    if (balance < 0) return 'Lo importante es ser consciente. Registrar es ya una victoria.';
    return 'Cada registro te acerca a tomar mejores decisiones.';
  }
  if (balance > 0 && prevBalance <= 0) return 'Pasaste a positivo este mes. La disciplina se nota.';
  if (balance < 0 && prevBalance >= 0) return 'Mes complicado. Lo importante es ser consciente y ajustar.';
  if (savingsRate > prevSavingsRate + 5) return 'Tu ahorro mejora notablemente. Sigue así.';
  if (savingsRate > prevSavingsRate) return 'Tu tasa de ahorro subió. Cada decisión cuenta.';
  if (savingsRate < prevSavingsRate - 10) return 'Tus gastos subieron. Un buen momento para reflexionar.';
  if (savingsRate < prevSavingsRate) return 'Pequeño retroceso. La consciencia es tu mayor activo.';
  if (balance > 0) return 'Consistencia positiva. La estabilidad financiera se construye así.';
  return 'Registrar es ya un acto de disciplina. Sigue adelante.';
}

// ═══════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════

function MoodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-[#999] mb-2 block">Estado emocional</label>
      <div className="flex gap-2 flex-wrap">
        {MOODS.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              value === m.value
                ? 'bg-[#c8a55a]/15 border-[#c8a55a]/40 text-[#c8a55a]'
                : 'bg-[#000000] border-[#1a1a1a] text-[#666] hover:border-[#333] hover:text-[#999]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChangeIndicator({ current, previous, label, invert = false }: { current: number; previous: number; label: string; invert?: boolean }) {
  if (previous === 0) return <span className="text-[#555] text-xs">Sin datos previos</span>;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const isPositive = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`flex items-center gap-1 text-xs ${isPositive ? 'text-emerald-400' : change === 0 ? 'text-[#666]' : 'text-red-400'}`}>
      <Icon size={12} />
      {Math.abs(change).toFixed(0)}% {label}
    </span>
  );
}

// ═══════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════

export default function RiquezaPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [logs, setLogs] = useState<FinanceLog[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: 'expense', category: '', amount: 0, description: '', mood: '' });
  const [loading, setLoading] = useState(true);
  const [editingLog, setEditingLog] = useState<FinanceLog | null>(null);
  const [editForm, setEditForm] = useState({ type: 'expense', category: '', amount: 0, description: '', date: '', mood: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [period, setPeriod] = useState<Period>('month');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (pendingDeleteId || editingLog) {
      document.body.classList.add('scroll-locked');
      return () => { document.body.classList.remove('scroll-locked'); };
    }
  }, [pendingDeleteId, editingLog]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await apiFetch('/api/finance?days=3650');
      if (res.ok) { const d = await res.json(); setLogs(d.logs); }
    } catch (e) {
      console.error(e);
      setFetchError(true);
    } finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ═══════════════════════════════════════════
  // Computed Metrics
  // ═══════════════════════════════════════════

  const [currentMonthRange, prevMonthRange] = useMemo(() => {
    const now = new Date();
    return [getMonthRange(now), getMonthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
  }, []);

  // Current month logs
  const currentMonthLogs = useMemo(
    () => filterLogsByRange(logs, currentMonthRange.start, currentMonthRange.end),
    [logs, currentMonthRange]
  );

  // Previous month logs
  const prevMonthLogs = useMemo(
    () => filterLogsByRange(logs, prevMonthRange.start, prevMonthRange.end),
    [logs, prevMonthRange]
  );

  // Period-filtered logs (for history display)
  const periodLogs = useMemo(() => {
    switch (period) {
      case 'month': return currentMonthLogs;
      case 'prev': return prevMonthLogs;
      case 'all': return logs;
    }
  }, [period, currentMonthLogs, prevMonthLogs, logs]);

  // Current month metrics
  const cmIncome = currentMonthLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const cmExpense = currentMonthLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
  const cmBalance = cmIncome - cmExpense;
  const cmSavingsRate = cmIncome > 0 ? (cmBalance / cmIncome) * 100 : 0;

  // Previous month metrics
  const pmIncome = prevMonthLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const pmExpense = prevMonthLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
  const pmBalance = pmIncome - pmExpense;
  const pmSavingsRate = pmIncome > 0 ? (pmBalance / pmIncome) * 100 : 0;

  // Health status
  const health = getHealthStatus(cmSavingsRate, cmBalance);

  // Category breakdown (current month, expenses only)
  const categoryBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const l of currentMonthLogs.filter(l => l.type === 'expense')) {
      totals[l.category] = (totals[l.category] || 0) + l.amount;
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [currentMonthLogs]);

  const maxCategoryAmount = categoryBreakdown.length > 0 ? categoryBreakdown[0][1] : 0;

  // Insight
  const insight = getInsight(cmBalance, cmSavingsRate, pmBalance, pmSavingsRate, prevMonthLogs.length > 0);

  // Grouped history
  const groupedHistory = useMemo(() => groupLogsByDate(periodLogs), [periodLogs]);

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════

  const submitFinance = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          type: form.type,
          category: form.category,
          amount: form.amount,
          description: form.description || null,
          mood: form.mood || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => [data.log, ...prev]);
        setShowAdd(false);
        setForm({ type: 'expense', category: '', amount: 0, description: '', mood: '' });
      }
    } catch (error) { console.error('Error submitting finance:', error); }
    finally { setSubmitting(false); }
  };

  const startEdit = (log: FinanceLog) => {
    setEditingLog(log);
    setEditForm({
      type: log.type,
      category: log.category,
      amount: log.amount,
      description: log.description || '',
      date: log.date.split('T')[0],
      mood: log.mood || '',
    });
  };

  const saveEdit = async () => {
    if (!editingLog) return;
    setEditSaving(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'PUT',
        body: JSON.stringify({
          logId: editingLog.id,
          date: editForm.date,
          type: editForm.type,
          category: editForm.category,
          amount: editForm.amount,
          description: editForm.description || null,
          mood: editForm.mood || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => prev.map(l => l.id === editingLog.id ? data.log : l));
        setEditingLog(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Finance PUT failed:', res.status, errData);
      }
    } catch (error) { console.error('Error updating finance log:', error); }
    finally { setEditSaving(false); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const res = await apiFetch('/api/finance', {
        method: 'DELETE',
        body: JSON.stringify({ logId: pendingDeleteId }),
      });
      if (res.ok) {
        setLogs(prev => prev.filter(l => l.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Finance DELETE failed:', res.status, errData);
      }
    } catch (error) { console.error('Error deleting finance log:', error); }
    finally { setPendingDeleteId(null); }
  };

  // ═══════════════════════════════════════════
  // Loading / Error
  // ═══════════════════════════════════════════

  if (loading) {
    return <EmpireSkeleton message="Cargando tus finanzas..." />;
  }

  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto min-h-[50vh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar el imperio"
          onRetry={fetchData}
          size="md"
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* ── Edit Overlay ── */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => setEditingLog(null)}>
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
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
              <input type="text" placeholder="Categoría" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <NumericInput value={editForm.amount} onChange={(v) => setEditForm({ ...editForm, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <input type="text" placeholder="Descripción (opcional)" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <MoodSelector value={editForm.mood} onChange={(v) => setEditForm({ ...editForm, mood: v })} />
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingLog(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} className="bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => setPendingDeleteId(null)}>
          <div className="modal-content-destructive p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar registro</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Gem size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Imperio Finanzas</h1>
          <p className="text-[#999] text-sm">Consciencia, disciplina y libertad financiera</p>
        </div>
      </div>

      {/* ── Financial Insight ── */}
      {currentMonthLogs.length > 0 && (
        <div className="bg-[#c8a55a]/5 border border-[#c8a55a]/15 rounded-xl p-4 sm:p-5 section-enter-1">
          <div className="flex items-start gap-3">
            <Sparkles size={16} className="text-[#c8a55a] mt-0.5 flex-shrink-0" />
            <p className="text-[#c8a55a]/90 text-sm italic leading-relaxed">{insight}</p>
          </div>
        </div>
      )}

      {/* ── Monthly Summary ── */}
      <div className="space-y-3 sm:space-y-4 section-enter-1">
        {/* Health + Savings Rate Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={14} className="text-[#666]" />
              <p className="text-xs text-[#666]">Estado financiero</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${health.dot}`} />
              <span className={`text-base sm:text-lg font-bold ${health.color}`}>{health.label}</span>
            </div>
            {prevMonthLogs.length > 0 && (
              <div className="mt-2">
                <ChangeIndicator current={cmSavingsRate} previous={pmSavingsRate} label="ahorro" />
              </div>
            )}
          </div>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={14} className="text-[#666]" />
              <p className="text-xs text-[#666]">Tasa de ahorro</p>
            </div>
            <p className={`text-base sm:text-lg font-bold ${cmSavingsRate >= 20 ? 'text-emerald-400' : cmSavingsRate >= 5 ? 'text-[#c8a55a]' : cmSavingsRate >= 0 ? 'text-orange-400' : 'text-red-400'}`}>
              {cmIncome > 0 ? `${cmSavingsRate.toFixed(0)}%` : '--'}
            </p>
            <p className="text-xs text-[#555] mt-1">
              {currentMonthRange.start.toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Income / Expense / Balance Row */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
            <p className="text-xs text-[#666] mb-1">Ingresos</p>
            <p className="text-sm sm:text-lg font-bold text-[#c8a55a]">+{formatCurrency(cmIncome)}</p>
            {prevMonthLogs.length > 0 && (
              <div className="mt-1.5"><ChangeIndicator current={cmIncome} previous={pmIncome} label="vs anterior" /></div>
            )}
          </div>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
            <p className="text-xs text-[#666] mb-1">Gastos</p>
            <p className="text-sm sm:text-lg font-bold text-red-400">-{formatCurrency(cmExpense)}</p>
            {prevMonthLogs.length > 0 && (
              <div className="mt-1.5"><ChangeIndicator current={cmExpense} previous={pmExpense} label="vs anterior" invert /></div>
            )}
          </div>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
            <p className="text-xs text-[#666] mb-1">Balance</p>
            <p className={`text-sm sm:text-lg font-bold ${cmBalance >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
              {formatCurrency(cmBalance)}
            </p>
            {prevMonthLogs.length > 0 && (
              <div className="mt-1.5"><ChangeIndicator current={cmBalance} previous={pmBalance} label="vs anterior" /></div>
            )}
          </div>
        </div>
      </div>

      {/* ── Category Breakdown ── */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-2">
          <div className="flex items-center gap-2 mb-4">
            <CircleDot size={16} className="text-[#c8a55a]" />
            <h2 className="text-base font-semibold text-white">Distribucion de Gastos</h2>
          </div>
          <p className="text-[#666] text-xs mb-4">Tus categorias principales este mes</p>
          <div className="space-y-3">
            {categoryBreakdown.map(([cat, amount]) => {
              const pct = cmExpense > 0 ? (amount / cmExpense) * 100 : 0;
              const barWidth = maxCategoryAmount > 0 ? (amount / maxCategoryAmount) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white">{cat}</span>
                    <span className="text-xs text-[#999]">{formatCurrency(amount)} <span className="text-[#555]">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#c8a55a]/60 to-[#c8a55a] transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add Transaction + History ── */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Movimientos</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="text-sm text-[#c8a55a] hover:text-[#d4b468] touch-press">
            <Plus size={18} className="inline mr-1" /> Añadir
          </button>
        </div>

        {/* Add Form */}
        {showAdd && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-5 space-y-3">
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
            <input type="text" placeholder="Categoría (ej: Ocio, Transporte...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
            <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
            <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
            <MoodSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
            <div className="flex gap-2 pt-1">
              <button onClick={submitFinance} disabled={submitting} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-[#d4b468] touch-press disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? 'Guardando...' : 'Guardar'}</button>
              <button onClick={() => setShowAdd(false)} className="text-[#999] px-4 py-2 text-sm touch-press">Cancelar</button>
            </div>
          </div>
        )}

        {/* Period Filter */}
        {logs.length > 0 && (
          <div className="flex gap-2 mb-4">
            {([
              { key: 'month' as Period, label: 'Este mes' },
              { key: 'prev' as Period, label: 'Mes anterior' },
              { key: 'all' as Period, label: 'Todo' },
            ]).map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  period === p.key
                    ? 'bg-[#c8a55a]/15 border-[#c8a55a]/30 text-[#c8a55a]'
                    : 'bg-[#000000] border-[#1a1a1a] text-[#666] hover:text-[#999] hover:border-[#333]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Grouped History */}
        {Object.keys(groupedHistory).length > 0 ? (
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {Object.entries(groupedHistory).map(([dateLabel, dateLogs]) => {
              const dayIncome = dateLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
              const dayExpense = dateLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
              return (
                <div key={dateLabel}>
                  {/* Date header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[#999] uppercase tracking-wider">{dateLabel}</span>
                    <span className="text-xs text-[#555]">
                      {dayIncome > 0 && <span className="text-[#c8a55a]/60">+{formatCurrency(dayIncome)}</span>}
                      {dayIncome > 0 && dayExpense > 0 && <span className="text-[#333] mx-1">/</span>}
                      {dayExpense > 0 && <span className="text-red-400/60">-{formatCurrency(dayExpense)}</span>}
                    </span>
                  </div>
                  {/* Day logs */}
                  <div className="space-y-1.5">
                    {dateLogs.map((log) => {
                      const moodInfo = getMoodLabel(log.mood);
                      return (
                        <div key={log.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 sm:p-4 group hover:border-[#222] transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            {log.type === 'income' ? (
                              <TrendingUp size={14} className="text-[#c8a55a] flex-shrink-0" />
                            ) : (
                              <TrendingDown size={14} className="text-red-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-white">{log.category}</span>
                                {moodInfo && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a1a] ${moodInfo.color}`}>
                                    {moodInfo.label}
                                  </span>
                                )}
                              </div>
                              {log.description && (
                                <p className="text-xs text-[#666] truncate">{log.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <p className={`text-sm font-medium ${log.type === 'income' ? 'text-[#c8a55a]' : 'text-red-400'}`}>
                              {log.type === 'income' ? '+' : '-'}{formatCurrency(log.amount)}
                            </p>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => startEdit(log)} className="p-1.5 rounded-lg hover:bg-[#c8a55a]/10 text-[#555] hover:text-[#c8a55a] transition-all touch-press" title="Editar"><Pencil size={12} /></button>
                              <button onClick={() => setPendingDeleteId(log.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-all touch-press" title="Eliminar"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <PremiumEmptyState
            icon={Wallet}
            title="Tu historial financiero está listo"
            subtitle="Registra tu primer movimiento y toma control de tus finanzas."
            cta="Añadir movimiento"
            onCta={() => setShowAdd(true)}
            size="sm"
            variant="gold"
          />
        )}
      </div>

      {/* ── Tips ── */}
      <EmpireTipsSection empire="riqueza" subtitle="Estrategias financieras para una base sólida" />
    </div>
  );
}
