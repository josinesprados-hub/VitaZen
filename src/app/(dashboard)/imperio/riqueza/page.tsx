'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import {
  Gem, Plus, Pencil, Trash2, Wallet,
  ChevronLeft, ChevronRight, CalendarDays, X, Check
} from 'lucide-react';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { EmpireSkeleton } from '@/components/ui/PremiumSkeleton';
import { NumericInput } from '@/components/ui/NumericInput';
import { formatCurrency } from '@/lib/utils';

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
  contexto: string | null;
  createdAt: string;
}

type Period = 'month' | 'prev' | 'all';

// ═══════════════════════════════════════════
// Context tags — for future emotional pattern detection
// ═══════════════════════════════════════════

const CONTEXT_EMOTION_MAP: [RegExp, string][] = [
  [/\b(amigos|amiga|amigo|social|cumple|fiesta|cena con|quedada|bar|copa|grupo|compañero|pareja|familia|mamá|papa|regalo)\b/i, 'social'],
  [/\b(complicado|difícil|estrés|mal|tough|agotado|ansiedad|malo|duro|crisis|problema)\b/i, 'difficult'],
  [/\b(tranquil|calma|relaj|paz|sereno|silencio|descanso|vacaciones|horas libres)\b/i, 'calm'],
  [/\b(impulsiv|antojo|capricho|me apetecía|sin pensar|lo quería|tentación|lo vi)\b/i, 'impulsive'],
  [/\b(celebr|logro|meta|conseguido|por fin|especial|único|merecido)\b/i, 'celebration'],
  [/\b(necesario|básico|imprescindible|no podía evitar|obligado|fijo|receta|médico|urgente)\b/i, 'necessity'],
  [/\b(rutina|siempre|habitual|mensual|semanal|otra vez|igual|lo de siempre)\b/i, 'routine'],
  [/\b(curso|aprend|libro|formación|crecimiento|inversión|futuro|mejora|desarrollo)\b/i, 'growth'],
];

function detectContextTags(contexto: string): string[] {
  if (!contexto?.trim()) return [];
  const tags: string[] = [];
  for (const [regex, tag] of CONTEXT_EMOTION_MAP) {
    if (regex.test(contexto)) {
      tags.push(tag);
    }
  }
  return tags;
}

// ═══════════════════════════════════════════
// Intenciones — the soul of Finanzas
// ═══════════════════════════════════════════

const INTENTIONS = [
  { value: 'tranquility', label: 'Tranquilidad' },
  { value: 'growth', label: 'Crecimiento' },
  { value: 'necessity', label: 'Necesidad' },
  { value: 'enjoyment', label: 'Disfrute' },
] as const;

const LEGACY_MOOD_MAP: Record<string, string> = {
  calm: 'tranquility',
  conscious: 'growth',
  necessary: 'necessity',
  impulse: 'enjoyment',
};

const DEFAULT_CATEGORIES = [
  'Comida', 'Transporte', 'Ocio', 'Salud', 'Compras',
  'Vivienda', 'Educación', 'Suscripción', 'Trabajo', 'Otros',
];

// ═══════════════════════════════════════════
// Quick Capture — Smart keyword → category mapping
// ═══════════════════════════════════════════

const KEYWORD_CATEGORIES: [RegExp, string][] = [
  [/\b(café|cafe|desayuno|almuerzo|cena|restaurante|pizza|sushi|hamburguesa|tapas|bar|comida|merienda|croissant|sandwich|bocadillo|postre|helado|cerveza|vino|copa|brunch|snack|supermercado|mercadona|carrefour|dia|consum|lidl|aldi|panaderia|pasteleria)\b/i, 'Comida'],
  [/\b(taxi|uber|cabify|metro|bus|autobus|gasolina|gas|parking|tren|ave|avion|vuelo|renfe|blablacar|scooter|moto|bici|peaje|estacionamiento|carburante|dgt|movilidad)\b/i, 'Transporte'],
  [/\b(cine|pelicula|concierto|fiesta|juego|viaje|hotel|hostal|airbnb|excursion|museo|teatro|partido|entradas|ocio|libro|revista|hobby|deporte|karaoke|bowling|festival)\b/i, 'Ocio'],
  [/\b(farmacia|medico|dentista|terapia|gimnasio|gym|optica|fisioterapeuta|psicologo|hospital|clinica|vacuna|seguro medico|sanitario|analisis|urgencia)\b/i, 'Salud'],
  [/\b(amazon|zara|ropa|zapatos|tienda|ikea|regalo|moda|accesorio|electronico|movil|ordenador|laptop|pc component|media markt|electrodomestico)\b/i, 'Compras'],
  [/\b(alquiler|hipoteca|luz|agua|internet|telefono|comunidad|ibi|basura|mantenimiento|reparacion|reform|pintura|fontanero|electricista|seguro hogar)\b/i, 'Vivienda'],
  [/\b(curso|master|universidad|academia|formacion|seminario|taller|certificacion|udemy|coursera|domestika|estudio|clase|tutoria)\b/i, 'Educación'],
  [/\b(spotify|netflix|hbo|disney|prime|youtube|icloud|dropbox|suscripcion|premium|membresia|abono)\b/i, 'Suscripción'],
  [/\b(nomina|salario|sueldo|pago|freelance|bonus|comision|dividendo|renta|ingreso|transferencia|reembolso|devolucion)\b/i, 'Trabajo'],
];

const INCOME_KEYWORDS = /\b(nomina|salario|sueldo|pago|freelance|bonus|comision|dividendo|renta|ingreso|transferencia|reembolso|devolucion)\b/i;

interface ParsedCapture {
  description: string;
  amount: number;
  category: string;
  type: 'expense' | 'income';
}

function parseQuickCapture(input: string, historyMap: Record<string, string>): ParsedCapture | null {
  if (!input.trim()) return null;

  const tokens = input.trim().split(/\s+/);
  let amount = 0;
  let descriptionTokens: string[] = [];
  let amountFound = false;

  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^[\d.,]+$/.test(tokens[i])) {
      const parsed = parseEuropeanQuick(tokens[i]);
      if (parsed > 0) {
        amount = parsed;
        descriptionTokens = tokens.slice(0, i);
        amountFound = true;
        break;
      }
    }
  }

  if (!amountFound && /^[\d.,]+$/.test(tokens[0])) {
    const parsed = parseEuropeanQuick(tokens[0]);
    if (parsed > 0) {
      amount = parsed;
      descriptionTokens = tokens.slice(1);
      amountFound = true;
    }
  }

  if (!amountFound) {
    const match = input.match(/([\d.,]+)\s*€?\s*$/);
    if (match) {
      const parsed = parseEuropeanQuick(match[1]);
      if (parsed > 0) {
        amount = parsed;
        descriptionTokens = [input.replace(match[0], '').trim()];
        amountFound = true;
      }
    }
  }

  if (!amountFound || amount <= 0) return null;

  const description = descriptionTokens.join(' ').trim();
  const textToMatch = description || input;

  let category = '';
  const descLower = textToMatch.toLowerCase();
  if (historyMap[descLower]) {
    category = historyMap[descLower];
  }

  if (!category) {
    for (const [regex, cat] of KEYWORD_CATEGORIES) {
      if (regex.test(textToMatch)) {
        category = cat;
        break;
      }
    }
  }

  if (!category) category = 'Otros';

  const type: 'expense' | 'income' = INCOME_KEYWORDS.test(textToMatch) ? 'income' : 'expense';

  return {
    description: description || category,
    amount,
    category,
    type,
  };
}

function parseEuropeanQuick(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = trimmed.replace(',', '.');
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, '')
      : trimmed;
  } else {
    normalized = trimmed;
  }

  normalized = normalized.replace(/\.$/, '');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

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

function getIntentionLabel(mood: string | null) {
  if (!mood) return null;
  const resolved = LEGACY_MOOD_MAP[mood] || mood;
  return INTENTIONS.find(i => i.value === resolved) || null;
}

function resolveIntention(mood: string | null): string | null {
  if (!mood) return null;
  return LEGACY_MOOD_MAP[mood] || mood;
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

// ═══════════════════════════════════════════
// Balance de Intenciones — the home of Finanzas
// ═══════════════════════════════════════════

interface IntentionFlow {
  intention: string;
  label: string;
  amount: number;
  count: number;
}

function IntentionBalance({ flows, totalExpense }: { flows: IntentionFlow[]; totalExpense: number }) {
  const maxAmount = Math.max(...flows.map(f => f.amount), 1);
  const hasData = flows.some(f => f.amount > 0);

  if (!hasData) return null;

  return (
    <div className="space-y-4">
      {flows.map((flow) => {
        if (flow.amount <= 0) return null;
        const barWidth = maxAmount > 0 ? (flow.amount / maxAmount) * 100 : 0;
        return (
          <div key={flow.intention} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-[#999] tracking-wide">{flow.label}</span>
              <span className="text-[12px] text-[#555] tabular-nums">{formatCurrency(flow.amount)}</span>
            </div>
            <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#c8a55a]/30 transition-all duration-700"
                style={{ width: `${Math.max(barWidth, 0)}%` }}
              />
            </div>
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
// Quick Capture Component
// ═══════════════════════════════════════════

function QuickCapture({
  onCapture,
  onFullForm,
  submitting,
  historyMap,
}: {
  onCapture: (data: { type: string; category: string; amount: number; description: string; contexto: string }) => void;
  onFullForm: () => void;
  submitting: boolean;
  historyMap: Record<string, string>;
}) {
  const [input, setInput] = useState('');
  const [contexto, setContexto] = useState('');
  const parsed = useMemo(() => parseQuickCapture(input, historyMap), [input, historyMap]);

  const handleSubmit = () => {
    if (!parsed || parsed.amount <= 0 || submitting) return;
    onCapture({
      type: parsed.type,
      category: parsed.category,
      amount: parsed.amount,
      description: parsed.description,
      contexto: contexto.trim(),
    });
    setInput('');
    setContexto('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && parsed && parsed.amount > 0) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Café 3,50 · Taxi 14 · Nómina 1250"
          className="w-full bg-[#000000] border border-[#1a1a1a] rounded-xl px-4 py-3.5 text-white text-base placeholder-[#444] focus:outline-none focus:border-[#c8a55a]/40 transition-colors"
          autoFocus
          inputMode="text"
          autoComplete="off"
        />
      </div>

      {parsed && parsed.amount > 0 ? (
        <div className="mt-2 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-medium ${parsed.type === 'income' ? 'text-[#c8a55a]' : 'text-red-400/70'}`}>
              {parsed.type === 'income' ? 'Ingreso' : 'Gasto'}
            </span>
            <span className="text-[#222] text-[11px]">·</span>
            <span className="text-[11px] text-[#666]">{parsed.category}</span>
            <span className="text-[#222] text-[11px]">·</span>
            <span className={`text-[11px] font-medium tabular-nums ${parsed.type === 'income' ? 'text-[#c8a55a]' : 'text-red-400/70'}`}>
              {parsed.type === 'income' ? '+' : '-'}{formatCurrency(parsed.amount)}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#c8a55a] text-black px-3 py-1 rounded-lg text-xs font-semibold hover:bg-[#d4b468] active:scale-95 transition-all disabled:opacity-50"
          >
            {submitting ? '...' : 'OK'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-[#333] px-0.5">Escribe concepto y cantidad</p>
      )}

      <div className="mt-3">
        <input
          type="text"
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          placeholder="¿Qué pasó? (opcional)"
          className="w-full bg-transparent border-b border-[#1a1a1a] px-0 py-1.5 text-[12px] text-[#888] placeholder-[#333] focus:outline-none focus:border-[#c8a55a]/25 transition-colors italic"
          autoComplete="off"
        />
      </div>

      <button
        onClick={onFullForm}
        className="mt-2 text-[10px] text-[#444] hover:text-[#666] transition-colors tracking-wide"
      >
        Formulario completo
      </button>
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
  const [form, setForm] = useState({ type: 'expense', category: '', amount: 0, description: '', mood: '', contexto: '' });
  const [loading, setLoading] = useState(true);
  const [editingLog, setEditingLog] = useState<FinanceLog | null>(null);
  const [editForm, setEditForm] = useState({ type: 'expense', category: '', amount: 0, description: '', date: '', mood: '', contexto: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [viewingMonth, setViewingMonth] = useState(new Date());
  const [toast, setToast] = useState({ show: false, message: '' });
  const [quickMode, setQuickMode] = useState(true);
  const addFormRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 2000);
  }, []);

  useEffect(() => {
    if (pendingDeleteId || editingLog) {
      document.body.classList.add('scroll-locked');
      return () => { document.body.classList.remove('scroll-locked'); };
    }
  }, [pendingDeleteId, editingLog]);

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
  // Smart category suggestions
  // ═══════════════════════════════════════════

  const userCategories = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const l of logs) {
      freq[l.category] = (freq[l.category] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([cat]) => cat);
    const merged = [...sorted];
    for (const dc of DEFAULT_CATEGORIES) {
      if (!merged.includes(dc)) merged.push(dc);
    }
    return merged.slice(0, 12);
  }, [logs]);

  const descriptionCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of logs) {
      const desc = (l.description || '').toLowerCase().trim();
      if (desc) map[desc] = l.category;
      map[l.category.toLowerCase()] = l.category;
    }
    return map;
  }, [logs]);

  // ═══════════════════════════════════════════
  // Computed — month ranges
  // ═══════════════════════════════════════════

  const [currentMonthRange, prevMonthRange] = useMemo(() => {
    return [getMonthRange(viewingMonth), getMonthRange(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() - 1, 1))];
  }, [viewingMonth]);

  const currentMonthLogs = useMemo(
    () => filterLogsByRange(logs, currentMonthRange.start, currentMonthRange.end),
    [logs, currentMonthRange]
  );

  const prevMonthLogs = useMemo(
    () => filterLogsByRange(logs, prevMonthRange.start, prevMonthRange.end),
    [logs, prevMonthRange]
  );

  const periodLogs = useMemo(() => {
    switch (period) {
      case 'month': return currentMonthLogs;
      case 'prev': return prevMonthLogs;
      case 'all': return logs;
    }
  }, [period, currentMonthLogs, prevMonthLogs, logs]);

  // ═══════════════════════════════════════════
  // Computed — financial overview
  // ═══════════════════════════════════════════

  const cmIncome = currentMonthLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const cmExpense = currentMonthLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
  const cmBalance = cmIncome - cmExpense;

  // ═══════════════════════════════════════════
  // Computed — Intention Balance (the home)
  // ═══════════════════════════════════════════

  const intentionFlows = useMemo(() => {
    const totals: Record<string, number> = {};
    const counts: Record<string, number> = {};
    let unassigned = 0;

    for (const l of currentMonthLogs) {
      const resolved = resolveIntention(l.mood);
      if (resolved && totals[resolved] !== undefined) {
        totals[resolved] += l.amount;
        counts[resolved] = (counts[resolved] || 0) + 1;
      } else if (resolved) {
        totals[resolved] = l.amount;
        counts[resolved] = 1;
      } else {
        unassigned += l.amount;
      }
    }

    const flows: IntentionFlow[] = INTENTIONS.map(i => ({
      intention: i.value,
      label: i.label,
      amount: totals[i.value] || 0,
      count: counts[i.value] || 0,
    }));

    if (unassigned > 0) {
      flows.push({ intention: 'unassigned', label: 'Sin intención', amount: unassigned, count: 0 });
    }

    return flows;
  }, [currentMonthLogs]);

  const hasIntentions = intentionFlows.some(f => f.amount > 0 && f.intention !== 'unassigned');

  // Dominant intention — for observational insight
  const dominantIntention = useMemo(() => {
    if (!hasIntentions) return null;
    const withIntention = intentionFlows.filter(f => f.intention !== 'unassigned' && f.amount > 0);
    if (withIntention.length === 0) return null;
    withIntention.sort((a, b) => b.amount - a.amount);
    return withIntention[0];
  }, [intentionFlows, hasIntentions]);

  // ═══════════════════════════════════════════
  // Computed — grouped history
  // ═══════════════════════════════════════════

  const groupedHistory = useMemo(() => groupLogsByDate(periodLogs), [periodLogs]);

  const monthLabel = viewingMonth.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const isCurrentMonth = viewingMonth.getMonth() === new Date().getMonth() && viewingMonth.getFullYear() === new Date().getFullYear();

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════

  const submitFinance = async () => {
    if (submitting) return;
    if (!form.category.trim()) { setSubmitError('La categoría es obligatoria'); return; }
    if (!form.amount || form.amount <= 0) { setSubmitError('La cantidad debe ser mayor que 0'); return; }

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
          contexto: form.contexto.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => [data.log, ...prev]);
        setShowAdd(false);
        setForm({ type: 'expense', category: '', amount: 0, description: '', mood: '', contexto: '' });
        showToast('Registrado');
      } else {
        const errData = await res.json().catch(() => ({}));
        setSubmitError(errData?.error || 'No se pudo guardar');
      }
    } catch (error) {
      setSubmitError('Error de conexión. Inténtalo de nuevo.');
    } finally { setSubmitting(false); }
  };

  const submitQuickCapture = async (data: { type: string; category: string; amount: number; description: string; contexto: string }) => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          type: data.type,
          category: data.category,
          amount: data.amount,
          description: data.description || null,
          mood: null,
          contexto: data.contexto || null,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setLogs(prev => [result.log, ...prev]);
        setShowAdd(false);
        setQuickMode(true);
        showToast('Registrado');
      } else {
        const errData = await res.json().catch(() => ({}));
        setSubmitError(errData?.error || 'No se pudo guardar');
      }
    } catch (error) {
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
      contexto: log.contexto || '',
    });
  };

  const saveEdit = async () => {
    if (!editingLog) return;
    if (!editForm.category.trim()) { setSubmitError('La categoría es obligatoria'); return; }
    if (!editForm.amount || editForm.amount <= 0) { setSubmitError('La cantidad debe ser mayor que 0'); return; }

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
          contexto: editForm.contexto.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => prev.map(l => l.id === editingLog.id ? data.log : l));
        setEditingLog(null);
        showToast('Actualizado');
      } else {
        const errData = await res.json().catch(() => ({}));
        setSubmitError(errData?.error || 'No se pudo actualizar');
      }
    } catch (error) {
      setSubmitError('Error de conexión. Inténtalo de nuevo.');
    } finally { setEditSaving(false); }
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
        showToast('Eliminado');
      }
    } catch (error) { console.error('Error deleting finance log:', error); }
    finally { setPendingDeleteId(null); }
  };

  // ═══════════════════════════════════════════
  // Loading / Error
  // ═══════════════════════════════════════════

  if (loading) {
    return <EmpireSkeleton message="Cargando..." />;
  }

  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto min-h-[50vh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar"
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
    <div className="max-w-4xl mx-auto space-y-8 sm:space-y-10 pb-24">
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
              <input type="text" placeholder="¿Qué pasó? (opcional)" value={editForm.contexto} onChange={(e) => setEditForm({ ...editForm, contexto: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#444] italic" />
              <IntentionSelector value={editForm.mood} onChange={(v) => setEditForm({ ...editForm, mood: v })} />
              {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
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
            <h1 className="text-xl sm:text-2xl font-bold text-white">Finanzas</h1>
            <p className="text-[#666] text-sm">Cómo fluye tu dinero</p>
          </div>
        </div>
      </div>

      {/* ── Empty State ── */}
      {isEmpty ? (
        <div className="space-y-8">
          <PremiumEmptyState
            icon={Wallet}
            title="Tu dinero refleja quien eres"
            subtitle="Registra ingresos y gastos para ver hacia donde fluye tu energía financiera."
            cta="Registrar primer movimiento"
            onCta={() => { setQuickMode(true); setShowAdd(true); }}
            size="lg"
            variant="gold"
          />

          {showAdd && (
            <div ref={addFormRef} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">Nuevo movimiento</h3>
                <button onClick={() => { setShowAdd(false); setSubmitError(null); setQuickMode(true); }} className="text-[#555] hover:text-[#999] transition-colors">
                  <X size={18} />
                </button>
              </div>
              {quickMode ? (
                <QuickCapture onCapture={submitQuickCapture} onFullForm={() => setQuickMode(false)} submitting={submitting} historyMap={descriptionCategoryMap} />
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button onClick={() => setForm({ ...form, type: 'income' })} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>Ingreso</button>
                    <button onClick={() => setForm({ ...form, type: 'expense' })} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>Gasto</button>
                  </div>
                  <div>
                    <input type="text" placeholder="Categoría (ej: Ocio, Transporte...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                    <div className="mt-2"><CategoryChips categories={userCategories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} /></div>
                  </div>
                  <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                  <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                  <input type="text" placeholder="¿Qué pasó? (opcional)" value={form.contexto} onChange={(e) => setForm({ ...form, contexto: e.target.value })} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm placeholder-[#444] focus:outline-none focus:border-[#c8a55a]/50 transition-colors italic" />
                  <IntentionSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
                  {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button onClick={submitFinance} disabled={submitting} className="bg-[#c8a55a] text-black font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? 'Guardando...' : 'Guardar'}</button>
                    <button onClick={() => setQuickMode(true)} className="text-[#999] px-4 py-2.5 text-sm hover:text-[#c8a55a] transition-colors">Captura rápida</button>
                  </div>
                </div>
              )}
              {submitError && quickMode && <p className="text-red-400 text-xs py-1 mt-2">{submitError}</p>}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════
              NON-EMPTY STATE
              New hierarchy:
              1. Balance de Intenciones
              2. Saldo neto
              3. Insight (only if real)
              4. Historial
              ══════════════════════════════════ */}

          {/* ── Month Navigation ── */}
          <div className="flex items-center justify-between">
            <button onClick={() => setViewingMonth(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() - 1, 1))} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors text-[#666] hover:text-[#c8a55a]">
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className="text-[#c8a55a]/60" />
              <h2 className="text-sm font-medium text-white capitalize">{monthLabel}</h2>
              {!isCurrentMonth && (
                <button onClick={() => setViewingMonth(new Date())} className="text-[10px] text-[#c8a55a]/60 hover:text-[#c8a55a] ml-1 underline underline-offset-2">Hoy</button>
              )}
            </div>
            <button onClick={() => setViewingMonth(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() + 1, 1))} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors text-[#666] hover:text-[#c8a55a]">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* ── 1. Balance de Intenciones ── */}
          {hasIntentions ? (
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-7 section-enter-1">
              <p className="text-[13px] text-[#555] mb-5">Este mes tu dinero ha fluido así</p>
              <IntentionBalance flows={intentionFlows} totalExpense={cmExpense} />
            </div>
          ) : currentMonthLogs.length > 0 ? (
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-7 section-enter-1">
              <p className="text-[13px] text-[#555] mb-2">Este mes tu dinero ha fluido así</p>
              <p className="text-[11px] text-[#333]">Asigna intenciones a tus movimientos para ver hacia dónde fluye tu energía.</p>
            </div>
          ) : null}

          {/* ── 2. Saldo neto ── */}
          {currentMonthLogs.length > 0 && (
            <div className="section-enter-1">
              <div className="flex items-baseline gap-3">
                <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${cmBalance >= 0 ? 'text-white' : 'text-amber-400'}`}>
                  {cmBalance >= 0 ? '+' : ''}{formatCurrency(cmBalance)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                {cmIncome > 0 && <span className="text-xs text-[#666]">+{formatCurrency(cmIncome)} ingresos</span>}
                {cmIncome > 0 && cmExpense > 0 && <span className="text-[#222] text-xs">·</span>}
                {cmExpense > 0 && <span className="text-xs text-[#666]">{formatCurrency(cmExpense)} gastos</span>}
              </div>
            </div>
          )}

          {/* ── 3. Insight (only if truly meaningful) ── */}
          {dominantIntention && currentMonthLogs.length >= 5 && (
            <div className="bg-[#c8a55a]/5 border border-[#c8a55a]/15 rounded-xl p-4 sm:p-5 section-enter-2">
              <p className="text-[#c8a55a]/80 text-sm italic leading-relaxed">
                La mayor parte de tu energía fue hacia {dominantIntention.label.toLowerCase()}.
              </p>
            </div>
          )}

          {/* ── 4. Historial ── */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Movimientos</h2>
              <button onClick={() => { setQuickMode(true); setShowAdd(!showAdd); }} className="flex items-center gap-1 text-sm text-[#c8a55a] hover:text-[#d4b468] touch-press transition-colors">
                <Plus size={16} /> <span className="hidden sm:inline">Añadir</span>
              </button>
            </div>

            {/* Quick Capture / Full Form */}
            {showAdd && (
              <div ref={addFormRef} className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-5 section-enter-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[#555] uppercase tracking-wider">Nuevo movimiento</span>
                  <button onClick={() => { setShowAdd(false); setSubmitError(null); setQuickMode(true); }} className="text-[#555] hover:text-[#999] transition-colors">
                    <X size={16} />
                  </button>
                </div>
                {quickMode ? (
                  <QuickCapture onCapture={submitQuickCapture} onFullForm={() => setQuickMode(false)} submitting={submitting} historyMap={descriptionCategoryMap} />
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button onClick={() => setForm({ ...form, type: 'income' })} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>Ingreso</button>
                      <button onClick={() => setForm({ ...form, type: 'expense' })} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999]'}`}>Gasto</button>
                    </div>
                    <div>
                      <input type="text" placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                      <div className="mt-2"><CategoryChips categories={userCategories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} /></div>
                    </div>
                    <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true} className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                    <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                    <input type="text" placeholder="¿Qué pasó? (opcional)" value={form.contexto} onChange={(e) => setForm({ ...form, contexto: e.target.value })} className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2.5 text-white text-base sm:text-sm placeholder-[#444] focus:outline-none focus:border-[#c8a55a]/50 transition-colors italic" />
                    <IntentionSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
                    {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button onClick={submitFinance} disabled={submitting} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-[#d4b468] touch-press disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? 'Guardando...' : 'Guardar'}</button>
                      <button onClick={() => setQuickMode(true)} className="text-[#999] px-4 py-2 text-sm hover:text-[#c8a55a] transition-colors">Captura rápida</button>
                    </div>
                  </div>
                )}
                {submitError && quickMode && <p className="text-red-400 text-xs py-1 mt-2">{submitError}</p>}
              </div>
            )}

            {/* Period Filter */}
            {logs.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {([
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
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] font-medium text-[#555] uppercase tracking-wider">{dateLabel}</span>
                        <span className="text-[11px] text-[#333]">
                          {dayIncome > 0 && <span className="text-[#c8a55a]/40">+{formatCurrency(dayIncome)}</span>}
                          {dayIncome > 0 && dayExpense > 0 && <span className="text-[#1a1a1a] mx-1.5">·</span>}
                          {dayExpense > 0 && <span className="text-red-400/40">{formatCurrency(dayExpense)}</span>}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {dateLogs.map((log) => {
                          const moodInfo = getIntentionLabel(log.mood);
                          return (
                            <div key={log.id} className="flex items-center gap-3 bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 sm:p-4 group hover:border-[#222] transition-colors">
                              <div className={`w-1 h-8 rounded-full flex-shrink-0 ${log.type === 'income' ? 'bg-[#c8a55a]/40' : 'bg-red-400/30'}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-white font-medium">{log.category}</span>
                                  {moodInfo && (
                                    <span className="text-[10px] text-[#444] tracking-wide">{moodInfo.label.toLowerCase()}</span>
                                  )}
                                </div>
                                {log.description && (
                                  <p className="text-xs text-[#555] truncate mt-0.5">{log.description}</p>
                                )}
                                {log.contexto && (
                                  <p className="text-[11px] text-[#3a3a3a] truncate mt-0.5 italic font-light">{log.contexto}</p>
                                )}
                              </div>
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
                subtitle="Cambia el filtro o registra algo nuevo."
                cta="Añadir movimiento"
                onCta={() => { setQuickMode(true); setShowAdd(true); }}
                size="sm"
                variant="gold"
              />
            )}
          </div>
        </>
      )}

      {/* ── FAB ── */}
      {!isEmpty && !editingLog && !pendingDeleteId && (
        <button
          onClick={() => { setQuickMode(true); setShowAdd(true); }}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#c8a55a] text-black rounded-2xl shadow-lg shadow-[#c8a55a]/25 flex items-center justify-center hover:bg-[#d4b468] active:scale-95 transition-all touch-press"
          title="Añadir movimiento"
        >
          <Plus size={24} />
        </button>
      )}

      {/* ── FAB Overlay ── */}
      {!isEmpty && showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop" onClick={() => { setShowAdd(false); setSubmitError(null); setQuickMode(true); }}>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full max-w-md section-enter-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">Nuevo movimiento</span>
              <button onClick={() => { setShowAdd(false); setSubmitError(null); setQuickMode(true); }} className="text-[#555] hover:text-[#999] transition-colors">
                <X size={18} />
              </button>
            </div>
            {quickMode ? (
              <QuickCapture onCapture={submitQuickCapture} onFullForm={() => setQuickMode(false)} submitting={submitting} historyMap={descriptionCategoryMap} />
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={() => setForm({ ...form, type: 'income' })} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-[#c8a55a] text-black' : 'bg-[#000000] border border-[#1a1a1a] text-[#999]'}`}>Ingreso</button>
                  <button onClick={() => setForm({ ...form, type: 'expense' })} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#000000] border border-[#1a1a1a] text-[#999]'}`}>Gasto</button>
                </div>
                <div>
                  <input type="text" placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                  <div className="mt-2"><CategoryChips categories={userCategories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} /></div>
                </div>
                <NumericInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="Cantidad (€)" inputMode="decimal" allowDecimal={true} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                <input type="text" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#666] focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                <input type="text" placeholder="¿Qué pasó? (opcional)" value={form.contexto} onChange={(e) => setForm({ ...form, contexto: e.target.value })} className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base placeholder-[#444] focus:outline-none focus:border-[#c8a55a]/50 transition-colors italic" />
                <IntentionSelector value={form.mood} onChange={(v) => setForm({ ...form, mood: v })} />
                {submitError && <p className="text-red-400 text-xs py-1">{submitError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={submitFinance} disabled={submitting} className="bg-[#c8a55a] text-black font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{submitting ? 'Guardando...' : 'Guardar'}</button>
                  <button onClick={() => setQuickMode(true)} className="text-[#999] px-4 py-2.5 text-sm hover:text-[#c8a55a] transition-colors">Captura rápida</button>
                </div>
              </div>
            )}
            {submitError && quickMode && <p className="text-red-400 text-xs py-1 mt-2">{submitError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
