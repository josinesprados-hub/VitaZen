'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import {
  Gem, Plus, TrendingDown, TrendingUp, Pencil, Trash2, Wallet,
  ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Minus,
  Activity, Target, Sparkles, CircleDot, CalendarDays, X, Check
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

type Period = 'week' | 'month' | 'prev' | 'all';

// "Este movimiento aporta" — premium consciousness labels
const INTENTIONS = [
  { value: 'tranquility', label: 'Tranquilidad' },
  { value: 'growth', label: 'Crecimiento' },
  { value: 'necessity', label: 'Necesidad' },
  { value: 'enjoyment', label: 'Disfrute' },
] as const;

// Legacy mood → new intention mapping
const LEGACY_MOOD_MAP: Record<string, string> = {
  calm: 'tranquility',
  conscious: 'growth',
  necessary: 'necessity',
  impulse: 'enjoyment',
};

// Default category suggestions (smart — adapts to user's history)
const DEFAULT_CATEGORIES = [
  'Comida', 'Transporte', 'Ocio', 'Salud', 'Compras',
  'Vivienda', 'Educación', 'Suscripción', 'Trabajo', 'Otros',
];

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
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
  return n.toFixed(2) + '\u00A0€';
}

function formatCurrencyShort(n: number) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k\u00A0€';
  return n.toFixed(0) + '\u00A0€';
}

function getIntentionLabel(mood: string | null) {
  if (!mood) return null;
  const resolved = LEGACY_MOOD_MAP[mood] || mood;
  return INTENTIONS.find(i => i.value === resolved) || null;
}

function getHealthStatus(savingsRate: number, balance: number) {
  if (balance < 0) return { label: 'Atento', color: 'text-amber-400', dot: 'bg-amber-400' };
  if (savingsRate >= 20) return { label: 'Estable', color: 'text-emerald-400', dot: 'bg-emerald-400' };
  if (savingsRate >= 5) return { label: 'Consciente', color: 'text-[#c8a55a]', dot: 'bg-[#c8a55a]' };
  return { label: 'Ajustando', color: 'text-orange-300', dot: 'bg-orange-300' };
}

function getDayOfWeekPattern(logs: FinanceLog[]) {
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);
  const expenses = logs.filter(l => l.type === 'expense');
  for (const l of expenses) {
    const d = new Date(l.date);
    let idx = d.getDay() - 1; // Mon=0
    if (idx < 0) idx = 6; // Sun=6
    totals[idx] += l.amount;
    counts[idx]++;
  }
  // Average per day-of-week (only count days with data)
  const avgs = totals.map((t, i) => counts[i] > 0 ? t / counts[i] : 0);
  const maxAvg = Math.max(...avgs, 1);
  const peakIdx = avgs.indexOf(Math.max(...avgs));

  return {
    days,
    avgs,
    maxAvg,
    peakDay: avgs[peakIdx] > 0 ? days[peakIdx] : null,
    hasPattern: expenses.length >= 7,
  };
}

function getInsight(
  balance: number,
  savingsRate: number,
  prevBalance: number,
  prevSavingsRate: number,
  hasPrevData: boolean,
  dayPattern: ReturnType<typeof getDayOfWeekPattern>,
  totalLogs: number
) {
  // First-time user insights
  if (totalLogs < 3) return 'Cada registro añade claridad. Empieza por lo sencillo.';

  // Day-of-week pattern insight
  if (dayPattern.hasPattern && dayPattern.peakDay) {
    return `Tus gastos más altos suelen ser los ${dayPattern.peakDay.toLowerCase()}.`;
  }

  if (!hasPrevData) {
    if (balance > 0) return 'Primer mes registrado. Los datos dan claridad.';
    if (balance < 0) return 'Primer mes registrado. Registrar ya es avanzar.';
    return 'Cada registro añade claridad a tus decisiones.';
  }
  if (balance > 0 && prevBalance <= 0) return 'Balance positivo este mes.';
  if (balance < 0 && prevBalance >= 0) return 'Gastos por encima de ingresos este mes.';
  if (savingsRate > prevSavingsRate + 5) return 'Tasa de ahorro en mejora clara.';
  if (savingsRate > prevSavingsRate) return 'Tasa de ahorro superior al mes anterior.';
  if (savingsRate < prevSavingsRate - 10) return 'Tasa de ahorro inferior al mes anterior.';
  if (savingsRate < prevSavingsRate) return 'Tasa de ahorro ligeramente inferior.';
  if (balance > 0) return 'Mes consistente en positivo.';
  return 'Los datos se construyen con cada registro.';
}

// ═══════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════

function IntentionSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-[#555] mb-1.5 block tracking-wide uppercase">Este movimiento aporta</label>
      <div className="flex gap-1.5 flex-wrap">
        {INTENTIONS.map(i => (
          <button
            key={i.value}
            type="button"
            onClick={() => onChange(value === i.value ? '' : i.value)}
            className={`px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-all border ${
              value === i.value
                ? 'bg-[#c8a55a]/10 border-[#c8a55a]/25 text-[#c8a55a]/90'
                : 'bg-transparent border-[#1a1a1a] text-[#444] hover:border-[#2a2a2a] hover:text-[#666]'
            }`}
          >
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryChips({ categories, value, onChange }: { categories: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {categories.map(cat => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(value === cat ? '' : cat)}
          className={`px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-all border ${
            value === cat
              ? 'bg-[#c8a55a]/10 border-[#c8a55a]/25 text-[#c8a55a]/90'
              : 'bg-transparent border-[#1a1a1a] text-[#444] hover:border-[#2a2a2a] hover:text-[#666]'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

function ChangeIndicator({ current, previous, label, invert = false }: { current: number; previous: number; label: string; invert?: boolean }) {
  if (previous === 0) return <span className="text-[#555] text-xs">Sin datos previos</span>;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const isPositive = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`flex items-center gap-1 text-xs ${isPositive ? 'text-emerald-400' : change === 0 ? 'text-[#666]' : 'text-amber-400'}`}>
      <Icon size={12} />
      {Math.abs(change).toFixed(0)}% {label}
    </span>
  );
}

// Weekly pulse — 7 mini bars showing daily net balance
function WeeklyPulse({ logs }: { logs: FinanceLog[] }) {
  const { start: weekStart } = getWeekRange(new Date());
  const dailyBalances = Array(7).fill(0);
  const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  for (const l of logs) {
    const d = new Date(l.date);
    if (d >= weekStart) {
      let idx = d.getDay() - 1;
      if (idx < 0) idx = 6;
      dailyBalances[idx] += l.type === 'income' ? l.amount : -l.amount;
    }
  }

  const maxAbs = Math.max(...dailyBalances.map(Math.abs), 1);
  const today = new Date();
  let todayIdx = today.getDay() - 1;
  if (todayIdx < 0) todayIdx = 6;

  return (
    <div className="flex items-end gap-1 h-10">
      {dailyBalances.map((bal, i) => {
        const h = maxAbs > 0 ? Math.max((Math.abs(bal) / maxAbs) * 100, 4) : 4;
        const isToday = i === todayIdx;
        const isPositive = bal >= 0;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
            <div
              className={`w-full rounded-sm transition-all duration-300 ${
                isToday
                  ? isPositive ? 'bg-[#c8a55a]' : 'bg-amber-400'
                  : isPositive ? 'bg-[#c8a55a]/30' : 'bg-amber-400/30'
              }`}
              style={{ height: `${h}%`, minHeight: '2px' }}
            />
            <span className={`text-[8px] ${isToday ? 'text-[#c8a55a]' : 'text-[#444]'}`}>
              {dayLabels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Day-of-week spending pattern — mini horizontal bars
function DayPattern({ pattern }: { pattern: ReturnType<typeof getDayOfWeekPattern> }) {
  if (!pattern.hasPattern) return null;

  return (
    <div className="space-y-1.5">
      {pattern.days.map((day, i) => {
        const pct = pattern.maxAvg > 0 ? (pattern.avgs[i] / pattern.maxAvg) * 100 : 0;
        const isPeak = pattern.avgs[i] === Math.max(...pattern.avgs) && pattern.avgs[i] > 0;
        return (
          <div key={day} className="flex items-center gap-2">
            <span className={`text-[10px] w-6 ${isPeak ? 'text-[#c8a55a]' : 'text-[#444]'}`}>{day}</span>
            <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isPeak ? 'bg-[#c8a55a]' : 'bg-[#c8a55a]/25'
                }`}
                style={{ width: `${Math.max(pct, 0)}%` }}
              />
            </div>
            {isPeak && <span className="text-[9px] text-[#c8a55a]/60">pico</span>}
          </div>
        );
      })}
    </div>
  );
}

// Save confirmation toast
function SaveToast({ show, message }: { show: boolean; message: string }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="bg-[#c8a55a] text-black px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg shadow-[#c8a55a]/20">
        <Check size={14} />
        {message}
      </div>
    </div>
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [viewingMonth, setViewingMonth] = useState(new Date());
  const [toast, setToast] = useState({ show: false, message: '' });
  const addFormRef = useRef<HTMLDivElement>(null);

  // Toast helper
  const showToast = useCallback((message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 2000);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (pendingDeleteId || editingLog) {
      document.body.classList.add('scroll-locked');
      return () => { document.body.classList.remove('scroll-locked'); };
    }
  }, [pendingDeleteId, editingLog]);

  // Scroll to add form when opened
  useEffect(() => {
    if (showAdd && addFormRef.current) {
      addFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showAdd]);

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
  // Smart category suggestions (from user's own history)
  // ═══════════════════════════════════════════

  const userCategories = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const l of logs) {
      freq[l.category] = (freq[l.category] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([cat]) => cat);
    // Merge with defaults, user's most-used first
    const merged = [...sorted];
    for (const dc of DEFAULT_CATEGORIES) {
      if (!merged.includes(dc)) merged.push(dc);
    }
    return merged.slice(0, 12);
  }, [logs]);

  // ═══════════════════════════════════════════
  // Computed Metrics
  // ═══════════════════════════════════════════

  const [currentMonthRange, prevMonthRange] = useMemo(() => {
    return [getMonthRange(viewingMonth), getMonthRange(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() - 1, 1))];
  }, [viewingMonth]);

  const currentWeekRange = useMemo(() => getWeekRange(new Date()), []);

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

  // Current week logs
  const weekLogs = useMemo(
    () => filterLogsByRange(logs, currentWeekRange.start, currentWeekRange.end),
    [logs, currentWeekRange]
  );

  // Period-filtered logs (for history display)
  const periodLogs = useMemo(() => {
    switch (period) {
      case 'week': return weekLogs;
      case 'month': return currentMonthLogs;
      case 'prev': return prevMonthLogs;
      case 'all': return logs;
    }
  }, [period, currentMonthLogs, prevMonthLogs, weekLogs, logs]);

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

  // Week metrics
  const weekIncome = weekLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const weekExpense = weekLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);

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

  // Day-of-week spending pattern
  const dayPattern = useMemo(() => getDayOfWeekPattern(logs), [logs]);

  // Insight
  const insight = getInsight(cmBalance, cmSavingsRate, pmBalance, pmSavingsRate, prevMonthLogs.length > 0, dayPattern, logs.length);

  // Grouped history
  const groupedHistory = useMemo(() => groupLogsByDate(periodLogs), [periodLogs]);

  // Month navigation
  const monthLabel = viewingMonth.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const isCurrentMonth = viewingMonth.getMonth() === new Date().getMonth() && viewingMonth.getFullYear() === new Date().getFullYear();

  // Balance bar visual (income vs expense proportion)
  const balanceBarWidth = cmIncome > 0 ? Math.min((cmExpense / cmIncome) * 100, 100) : 0;

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════

  const submitFinance = async () => {
    if (submitting) return;

    if (!form.category.trim()) {
      setSubmitError('La categoría es obligatoria');
      return;
    }
    if (!form.amount || form.amount <= 0) {
      setSubmitError('La cantidad debe ser mayor que 0');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          type: form.type,
          category: form.category.trim(),
          amount: form.amount,
          description: form.description.trim() || null,
          mood: form.mood || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => [data.log, ...prev]);
        setShowAdd(false);
        setForm({ type: 'expense', category: '', amount: 0, description: '', mood: '' });
        showToast(form.type === 'income' ? 'Ingreso registrado' : 'Gasto registrado');
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Finance POST failed:', res.status, errData);
        setSubmitError(errData?.error || 'No se pudo guardar el movimiento');
      }
    } catch (error) {
      console.error('Error submitting finance:', error);
      setSubmitError('Error de conexión. Inténtalo de nuevo.');
    } finally { setSubmitting(false); }
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

    if (!editForm.category.trim()) {
      setSubmitError('La categoría es obligatoria');
      return;
    }
    if (!editForm.amount || editForm.amount <= 0) {
      setSubmitError('La cantidad debe ser mayor que 0');
      return;
    }

    setSubmitError(null);
    setEditSaving(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'PUT',
        body: JSON.stringify({
          logId: editingLog.id,
          date: editForm.date,
          type: editForm.type,
          category: editForm.category.trim(),
          amount: editForm.amount,
          description: editForm.description.trim() || null,
          mood: editForm.mood || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => prev.map(l => l.id === editingLog.id ? data.log : l));
        setEditingLog(null);
        showToast('Movimiento actualizado');
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Finance PUT failed:', res.status, errData);
        setSubmitError(errData?.error || 'No se pudo actualizar el movimiento');
      }
    } catch (error) {
      console.error('Error updating finance log:', error);
      setSubmitError('Error de conexión. Inténtalo de nuevo.');
    }
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
        showToast('Movimiento eliminado');
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

  const isEmpty = logs.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-24">
      {/* ── Save Toast ── */}
      <SaveToast show={toast.show} message={toast.message} />

      {/* ── Edit Overlay ── */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => { setEditingLog(null); setSubmitError(null); }}>
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
              <div>
                <input type="text" placeholder="Categoría" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
                <CategoryChips categories={userCategories} value={editForm.category} onChange={(v) => setEditForm({ ...editForm, category: v })} />
              </div>
              <NumericInput value={editForm.amount} onChange={(v) => setEditForm({ ...editForm, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <input type="text" placeholder="Descripción (opcional)" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <IntentionSelector value={editForm.mood} onChange={(v) => setEditForm({ ...editForm, mood: v })} />
              {submitError && (
                <p className="text-red-400 text-xs py-1">{submitError}</p>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => { setEditingLog(null); setSubmitError(null); }} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
            <Gem size={28} className="text-[#c8a55a]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Imperio Finanzas</h1>
            <p className="text-[#999] text-sm">Consciencia, disciplina y libertad</p>
          </div>
        </div>
      </div>

      {/* ── Empty State (full page, premium) ── */}
      {isEmpty ? (
        <div className="space-y-8">
          <PremiumEmptyState
            icon={Wallet}
            title="Tu vida financiera, con claridad"
            subtitle="Registra ingresos y gastos para entender tus patrones. Sin juicios, sin complejidad."
            cta="Registrar primer movimiento"
            onCta={() => setShowAdd(true)}
            size="lg"
            variant="gold"
          />

          {/* Add Form (inline, for empty state) */}
          {showAdd && (
            <div ref={addFormRef} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 space-y-4 section-enter-1">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Nuevo movimiento</h3>
                <button onClick={() => { setShowAdd(false); setSubmitError(null); }} className="text-[#555] hover:text-[#999] transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setForm({ ...form, type: 'income' })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                  Ingreso
                </button>
                <button onClick={() => setForm({ ...form, type: 'expense' })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                  Gasto
                </button>
              </div>
              <div>
                <input type="text" placeholder="Categoría (ej: Ocio, Transporte...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                <div className="mt-2">
                  <CategoryChips categories={userCategories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
                </div>
              </div>
              <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
              <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
              <IntentionSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
              {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
              <button onClick={submitFinance} disabled={submitting} className="w-full bg-[#c8a55a] text-black font-semibold py-3 rounded-xl text-sm hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Guardando...' : 'Guardar movimiento'}
              </button>
            </div>
          )}

          <EmpireTipsSection empire="riqueza" subtitle="Estrategias financieras para una base sólida" />
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════
              NON-EMPTY STATE
              ══════════════════════════════════ */}

          {/* ── Financial Insight ── */}
          <div className="bg-[#c8a55a]/5 border border-[#c8a55a]/15 rounded-xl p-4 sm:p-5 section-enter-1">
            <div className="flex items-start gap-3">
              <Sparkles size={16} className="text-[#c8a55a] mt-0.5 flex-shrink-0" />
              <p className="text-[#c8a55a]/90 text-sm italic leading-relaxed">{insight}</p>
            </div>
          </div>

          {/* ── Monthly Summary ── */}
          <div className="space-y-3 sm:space-y-4 section-enter-1">
            {/* Month Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setViewingMonth(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() - 1, 1))}
                className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors text-[#666] hover:text-[#c8a55a]"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-[#c8a55a]/60" />
                <h2 className="text-sm font-medium text-white capitalize">{monthLabel}</h2>
                {!isCurrentMonth && (
                  <button
                    onClick={() => setViewingMonth(new Date())}
                    className="text-[10px] text-[#c8a55a]/60 hover:text-[#c8a55a] ml-1 underline underline-offset-2"
                  >
                    Hoy
                  </button>
                )}
              </div>
              <button
                onClick={() => setViewingMonth(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() + 1, 1))}
                className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors text-[#666] hover:text-[#c8a55a]"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Balance Flow Visual */}
            {cmIncome > 0 && (
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[#666]">Flujo del mes</span>
                  <span className={`text-xs font-medium ${cmBalance >= 0 ? 'text-[#c8a55a]' : 'text-amber-400'}`}>
                    {cmBalance >= 0 ? '+' : ''}{formatCurrency(cmBalance)}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#c8a55a]/60 w-14">Ingresos</span>
                    <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#c8a55a]/60 transition-all duration-500" style={{ width: '100%' }} />
                    </div>
                    <span className="text-xs text-[#c8a55a] w-20 text-right">{formatCurrency(cmIncome)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-red-400/60 w-14">Gastos</span>
                    <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-400/40 transition-all duration-500" style={{ width: `${balanceBarWidth}%` }} />
                    </div>
                    <span className="text-xs text-red-400/80 w-20 text-right">{formatCurrency(cmExpense)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Health + Savings Rate Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} className="text-[#666]" />
                  <p className="text-xs text-[#666]">Estado</p>
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
                <p className={`text-base sm:text-lg font-bold ${cmSavingsRate >= 20 ? 'text-emerald-400' : cmSavingsRate >= 5 ? 'text-[#c8a55a]' : cmSavingsRate >= 0 ? 'text-orange-300' : 'text-amber-400'}`}>
                  {cmIncome > 0 ? `${cmSavingsRate.toFixed(0)}%` : '--'}
                </p>
                <p className="text-xs text-[#555] mt-1 capitalize">{monthLabel}</p>
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
                <p className={`text-sm sm:text-lg font-bold ${cmBalance >= 0 ? 'text-[#c8a55a]' : 'text-amber-400'}`}>
                  {formatCurrency(cmBalance)}
                </p>
                {prevMonthLogs.length > 0 && (
                  <div className="mt-1.5"><ChangeIndicator current={cmBalance} previous={pmBalance} label="vs anterior" /></div>
                )}
              </div>
            </div>
          </div>

          {/* ── Weekly Pulse ── */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 sm:p-5 section-enter-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-[#c8a55a]/60" />
                <span className="text-xs text-[#666]">Pulso semanal</span>
              </div>
              <span className="text-xs text-[#555]">
                {weekIncome > 0 && <span className="text-[#c8a55a]/60">+{formatCurrencyShort(weekIncome)}</span>}
                {weekIncome > 0 && weekExpense > 0 && <span className="text-[#333] mx-1">/</span>}
                {weekExpense > 0 && <span className="text-red-400/60">-{formatCurrencyShort(weekExpense)}</span>}
              </span>
            </div>
            <WeeklyPulse logs={weekLogs} />
          </div>

          {/* ── Category Breakdown + Day Pattern ── */}
          {categoryBreakdown.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 section-enter-2">
              {/* Category Breakdown */}
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CircleDot size={14} className="text-[#c8a55a]/60" />
                  <h2 className="text-sm font-semibold text-white">Gastos por categoría</h2>
                </div>
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
                            className="h-full rounded-full bg-gradient-to-r from-[#c8a55a]/40 to-[#c8a55a] transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day-of-Week Pattern */}
              {dayPattern.hasPattern && (
                <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarDays size={14} className="text-[#c8a55a]/60" />
                    <h2 className="text-sm font-semibold text-white">Patrón semanal</h2>
                  </div>
                  <p className="text-[#555] text-xs mb-3">Gasto promedio por día de la semana</p>
                  <DayPattern pattern={dayPattern} />
                </div>
              )}
            </div>
          )}

          {/* ── Movements ── */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Movimientos</h2>
              <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 text-sm text-[#c8a55a] hover:text-[#d4b468] touch-press transition-colors">
                <Plus size={16} /> <span className="hidden sm:inline">Añadir</span>
              </button>
            </div>

            {/* Add Form */}
            {showAdd && (
              <div ref={addFormRef} className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-5 space-y-3 section-enter-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#555] uppercase tracking-wider">Nuevo movimiento</span>
                  <button onClick={() => { setShowAdd(false); setSubmitError(null); }} className="text-[#555] hover:text-[#999] transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setForm({ ...form, type: 'income' })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                    Ingreso
                  </button>
                  <button onClick={() => setForm({ ...form, type: 'expense' })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>
                    Gasto
                  </button>
                </div>
                <div>
                  <input type="text" placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                  <div className="mt-2">
                    <CategoryChips categories={userCategories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
                  </div>
                </div>
                <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                <IntentionSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
                {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={submitFinance} disabled={submitting} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-[#d4b468] touch-press disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? 'Guardando...' : 'Guardar'}</button>
                  <button onClick={() => { setShowAdd(false); setSubmitError(null); }} className="text-[#999] px-4 py-2 text-sm touch-press">Cancelar</button>
                </div>
              </div>
            )}

            {/* Period Filter */}
            {logs.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {([
                  { key: 'week' as Period, label: 'Semana' },
                  { key: 'month' as Period, label: 'Este mes' },
                  { key: 'prev' as Period, label: 'Mes anterior' },
                  { key: 'all' as Period, label: 'Todo' },
                ]).map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
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
              <div className="space-y-5 max-h-[600px] overflow-y-auto">
                {Object.entries(groupedHistory).map(([dateLabel, dateLogs]) => {
                  const dayIncome = dateLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
                  const dayExpense = dateLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
                  return (
                    <div key={dateLabel}>
                      {/* Date header */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] font-medium text-[#666] uppercase tracking-wider">{dateLabel}</span>
                        <span className="text-[11px] text-[#444]">
                          {dayIncome > 0 && <span className="text-[#c8a55a]/50">+{formatCurrencyShort(dayIncome)}</span>}
                          {dayIncome > 0 && dayExpense > 0 && <span className="text-[#222] mx-1.5">·</span>}
                          {dayExpense > 0 && <span className="text-red-400/50">-{formatCurrencyShort(dayExpense)}</span>}
                        </span>
                      </div>
                      {/* Day logs */}
                      <div className="space-y-2">
                        {dateLogs.map((log) => {
                          const moodInfo = getIntentionLabel(log.mood);
                          return (
                            <div key={log.id} className="flex items-center gap-3 bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 sm:p-4 group hover:border-[#222] transition-colors">
                              {/* Type indicator */}
                              <div className={`w-1 h-8 rounded-full flex-shrink-0 ${log.type === 'income' ? 'bg-[#c8a55a]/40' : 'bg-red-400/30'}`} />

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-white font-medium">{log.category}</span>
                                  {moodInfo && (
                                    <span className="text-[10px] text-[#555] tracking-wide bg-[#1a1a1a] px-1.5 py-0.5 rounded">
                                      {moodInfo.label}
                                    </span>
                                  )}
                                </div>
                                {log.description && (
                                  <p className="text-xs text-[#555] truncate mt-0.5">{log.description}</p>
                                )}
                              </div>

                              {/* Amount + Actions */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <p className={`text-sm font-semibold tabular-nums ${log.type === 'income' ? 'text-[#c8a55a]' : 'text-red-400'}`}>
                                  {log.type === 'income' ? '+' : '-'}{formatCurrency(log.amount)}
                                </p>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                title="Sin movimientos en este período"
                subtitle="Cambia el filtro o añade un nuevo registro."
                cta="Añadir movimiento"
                onCta={() => setShowAdd(true)}
                size="sm"
                variant="gold"
              />
            )}
          </div>

          {/* ── Tips ── */}
          <EmpireTipsSection empire="riqueza" subtitle="Estrategias financieras para una base sólida" />
        </>
      )}

      {/* ── Floating Action Button ── */}
      {!isEmpty && !editingLog && !pendingDeleteId && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#c8a55a] text-black rounded-2xl shadow-lg shadow-[#c8a55a]/25 flex items-center justify-center hover:bg-[#d4b468] active:scale-95 transition-all touch-press"
          title="Añadir movimiento"
        >
          <Plus size={24} />
        </button>
      )}

      {/* ── FAB Add Form Overlay ── */}
      {!isEmpty && showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop" onClick={() => { setShowAdd(false); setSubmitError(null); }}>
          <div
            className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full max-w-md space-y-3 section-enter-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Nuevo movimiento</span>
              <button onClick={() => { setShowAdd(false); setSubmitError(null); }} className="text-[#555] hover:text-[#999] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'income' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#000000] border border-[#1a1a1a] text-[#999]'}`}>
                Ingreso
              </button>
              <button onClick={() => setForm({ ...form, type: 'expense' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#000000] border border-[#1a1a1a] text-[#999]'}`}>
                Gasto
              </button>
            </div>
            <div>
              <input type="text" placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
              <div className="mt-2">
                <CategoryChips categories={userCategories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
              </div>
            </div>
            <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true}
              className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
            <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
            <IntentionSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
            {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
            <button onClick={submitFinance} disabled={submitting} className="w-full bg-[#c8a55a] text-black font-semibold py-3 rounded-xl text-sm hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Guardando...' : 'Guardar movimiento'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
