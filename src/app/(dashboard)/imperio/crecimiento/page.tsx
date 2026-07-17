'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_JOURNAL_ENTRIES } from '@/lib/screenshot-data';
import { TrendingUp, Plus, BookOpen, Heart, Pencil, Trash2, BookOpenText, Calendar, Clock } from 'lucide-react';
import { getMadridDateKey, getTodayDateKey, daysBetweenDateKeys, safeFormatDate, safeFormatTime } from '@/lib/dates';
import EmpireTipsSection from '@/components/ui/EmpireTipsSection';
import ContextualHelp from '@/components/ui/ContextualHelp';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { EmpireSkeleton } from '@/components/ui/PremiumSkeleton';
import { MicroReward } from '@/components/ui/MicroReward';

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  mood: number | null;
  gratitude: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Date grouping ────────────────────────────────

function dateGroupLabel(dateStr: string): string {
  const entryKey = getMadridDateKey(new Date(dateStr));
  const todayKey = getTodayDateKey();

  if (entryKey === todayKey) return 'Hoy';

  const diffDay = daysBetweenDateKeys(entryKey, todayKey);

  if (diffDay === 1) return 'Ayer';
  if (diffDay < 7) return 'Esta semana';
  if (diffDay < 14) return 'Hace 2 semanas';

  const [eY, eM, eD] = entryKey.split('-').map(Number);
  const entryDate = new Date(eY, eM - 1, eD);
  return entryDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  return safeFormatDate(dateStr);
}

function formatTime(dateStr: string): string {
  return safeFormatTime(dateStr);
}

function groupEntriesByDate(entries: JournalEntry[]): { label: string; entries: JournalEntry[] }[] {
  const groups: { label: string; entries: JournalEntry[] }[] = [];
  let currentLabel = '';
  for (const entry of entries) {
    const label = dateGroupLabel(entry.createdAt);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, entries: [entry] });
    } else {
      groups[groups.length - 1].entries.push(entry);
    }
  }
  return groups;
}

// ─── Mood display ─────────────────────────────────

function MoodDisplay({ mood }: { mood: number | null }) {
  if (!mood) return null;
  const hearts = Array.from({ length: 5 }, (_, i) => (
    <Heart
      key={i}
      size={12}
      className={i < mood ? 'text-champagne fill-champagne' : 'text-[#333]'}
    />
  ));
  return <span className="flex items-center gap-0.5">{hearts}</span>;
}

// ─── Main Component ───────────────────────────────

export default function CrecimientoPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', mood: 3, gratitude: '' });
  const [saving, setSaving] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', mood: 3, gratitude: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [actionError, setActionError] = useState('');

  // Auto-dismiss action error toast
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(''), 4000);
    return () => clearTimeout(timer);
  }, [actionError]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (editingEntry || pendingDeleteId) {
      document.body.classList.add('scroll-locked');
      return () => {
        document.body.classList.remove('scroll-locked');
      };
    }
  }, [editingEntry, pendingDeleteId]);

  const fetchData = useCallback(async () => {
    // ── Screenshot mode: use frozen demo data, skip API calls ──
    if (screenshotMode) {
      setEntries(SCREENSHOT_JOURNAL_ENTRIES as JournalEntry[]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(false);

    try {
      const res = await apiFetch('/api/journal');
      if (res.ok) {
        const d = await res.json();
        setEntries(d.entries);
      } else {
        setFetchError(true);
      }
    } catch (e) {
      console.error(e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, screenshotMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Create ──────────────────────────────────

  const submitEntry = async () => {
    if (!form.title.trim() && !form.content.trim() && !form.gratitude.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/journal', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => [data.entry, ...prev]);
        setShowAdd(false);
        setForm({ title: '', content: '', mood: 3, gratitude: '' });
        setShowReward(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || errData.message;
        setActionError(msg === 'Rate limit exceeded' ? 'Has alcanzado el límite de 5 entradas por día' : msg || `Error al guardar (${res.status})`);
      }
    } catch (error) {
      console.error('Error submitting entry:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Edit ────────────────────────────────────

  const startEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEditForm({ title: entry.title, content: entry.content, mood: entry.mood || 3, gratitude: entry.gratitude || '' });
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    if (!editForm.title.trim() && !editForm.content.trim() && !editForm.gratitude.trim()) return;
    setEditSaving(true);
    try {
      const res = await apiFetch('/api/journal', {
        method: 'PUT',
        body: JSON.stringify({ entryId: editingEntry.id, ...editForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => prev.map(e => e.id === editingEntry.id ? data.entry : e));
        setEditingEntry(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Journal PUT failed:', res.status, errData);
        setActionError(errData.error || errData.message || `Error al guardar (${res.status})`);
      }
    } catch (error) {
      console.error('Error updating entry:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete ──────────────────────────────────

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const res = await apiFetch('/api/journal', {
        method: 'DELETE',
        body: JSON.stringify({ entryId: pendingDeleteId }),
      });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Journal DELETE failed:', res.status, errData);
        setActionError(errData.error || errData.message || `Error al eliminar (${res.status})`);
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setPendingDeleteId(null);
    }
  };

  // ─── Loading / Error states ──────────────────

  // useMemo MUST be called before any early returns.
  // React hooks must be called in the same order on every render.
  // Placing useMemo after early returns caused "Rendered fewer hooks
  // than expected" (React error #310) when the component returned
  // early during loading/error states.
  const grouped = useMemo(() => groupEntriesByDate(entries), [entries]);

  if (loading) {
    return <EmpireSkeleton message="Preparando tu diario..." />;
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">

      {/* ═══ Edit Journal Entry Overlay ═══ */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => setEditingEntry(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-champagne/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-champagne" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar entrada</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Título" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-champagne/50 transition-colors placeholder-[#666]" />
              <textarea placeholder="Contenido" value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-champagne/50 transition-colors placeholder-[#666] h-28 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#999] uppercase tracking-wider font-medium mb-2 block">Ánimo (1-5)</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setEditForm({ ...editForm, mood: n })}
                        className={`rating-btn w-8 h-8 rounded border text-xs ${n <= editForm.mood ? 'bg-champagne border-champagne text-black' : 'bg-[#000000] border-[#1a1a1a] text-[#666]'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#999] uppercase tracking-wider font-medium mb-2 block">Gratitud</label>
                  <input type="text" placeholder="Agradecido por..." value={editForm.gratitude} onChange={(e) => setEditForm({ ...editForm, gratitude: e.target.value })}
                    className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-3 py-2 text-white text-base sm:text-sm focus:outline-none focus:border-champagne/50 transition-colors placeholder-[#666]" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingEntry(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving || (!editForm.title.trim() && !editForm.content.trim() && !editForm.gratitude.trim())} className="bg-champagne text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-champagne-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirmation Overlay ═══ */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => setPendingDeleteId(null)}>
          <div className="modal-content-destructive p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar entrada</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Page Header ═══ */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-champagne/10 flex items-center justify-center">
          <TrendingUp size={28} className="text-champagne" />
        </div>
        <div>
          <h1 className="title-page">Crecimiento</h1>
          <p className="subtitle-silent mt-1">Reflexión y evolución</p>
        </div>
      </div>

      {/* Contextual Help — progressive disclosure */}
      <ContextualHelp
        storageKey="vitazen_help_crecimiento"
        title="Crecimiento"
        text="Escribe en tu diario personal, refleja tu estado de ánimo y agradece."
      />

      {/* ═══ Journal Section ═══ */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-1">
        {/* Header + New Entry Button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-champagne" /> Diario Personal
          </h2>
          {!screenshotMode && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1 text-sm text-champagne hover:text-champagne-hover touch-press"
            >
              <Plus size={18} /> Nueva entrada
            </button>
          )}
        </div>


        {/* ═══ New Entry Form ═══ */}
        {showAdd && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-6 space-y-3">
            <input type="text" placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666]" />
            <textarea placeholder="¿Qué hay en tu mente?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666] h-32 resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[#999] mb-1 block">Estado de ánimo (1-5)</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setForm({ ...form, mood: n })}
                      className={`rating-btn w-9 h-9 rounded border text-sm ${n <= form.mood ? 'bg-champagne border-champagne text-black' : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#666]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-[#999] mb-1 block">Gratitud</label>
                <input type="text" placeholder="Algo que agradecer..." value={form.gratitude} onChange={(e) => setForm({ ...form, gratitude: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={submitEntry} disabled={saving || (!form.title.trim() && !form.content.trim() && !form.gratitude.trim())} className="bg-champagne text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-champagne-hover touch-press disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setShowAdd(false)} className="text-[#999] px-4 py-2 text-sm touch-press">Cancelar</button>
            </div>
          </div>
        )}

        {/* ═══ Journal History ═══ */}
        {entries.length > 0 ? (
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.label}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-champagne/70 whitespace-nowrap">
                    {group.label}
                  </h3>
                  <div className="flex-1 h-px bg-[#1a1a1a]" />
                </div>

                {/* Entries in this group */}
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 group hover:border-[#222] transition-colors"
                    >
                      {/* Top row: title + actions */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className="text-champagne font-medium text-sm leading-snug flex-1">{entry.title || <span className="text-[#666] italic">Sin título</span>}</h4>
                        {!screenshotMode && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEdit(entry)}
                              className="p-2.5 rounded-lg hover:bg-champagne/10 text-[#666] hover:text-champagne transition-all touch-press"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setPendingDeleteId(entry.id)}
                              className="p-2.5 rounded-lg hover:bg-red-500/10 text-[#666] hover:text-red-400 transition-all touch-press"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Date + Time row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-[#999]">
                          <Calendar size={11} /> {formatDate(entry.createdAt)}
                        </span>
                        <span className="text-[#333] text-xs">·</span>
                        <span className="flex items-center gap-1 text-xs text-[#999]">
                          <Clock size={11} /> {formatTime(entry.createdAt)}
                        </span>
                        {entry.mood && (
                          <>
                            <span className="text-[#333] text-xs">·</span>
                            <MoodDisplay mood={entry.mood} />
                          </>
                        )}
                      </div>

                      {/* Content */}
                      {entry.content && (
                        <>
                          <p className="text-[#999] text-sm whitespace-pre-wrap leading-relaxed">
                            {expandedEntry === entry.id
                              ? entry.content
                              : entry.content.slice(0, 150) + (entry.content.length > 150 ? '...' : '')}
                          </p>
                          {entry.content.length > 150 && (
                            <button
                              onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                              className="text-champagne text-xs mt-1 hover:underline"
                            >
                              {expandedEntry === entry.id ? 'Ver menos' : 'Ver más'}
                            </button>
                          )}
                        </>
                      )}

                      {/* Gratitude */}
                      {entry.gratitude && (
                        <div className="mt-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded p-2">
                          <p className="text-xs text-champagne">Gratitud: <span className="text-[#999]">{entry.gratitude}</span></p>
                        </div>
                      )}

                      {/* Edited indicator */}
                      {entry.updatedAt && new Date(entry.updatedAt).getTime() - new Date(entry.createdAt).getTime() > 1000 && (
                        <p className="text-[10px] text-[#444] mt-2 italic">Editado</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <PremiumEmptyState
            icon={BookOpenText}
            title="Aún no has escrito en tu diario"
            subtitle="Escribe lo que sientes. No tiene que ser perfecto, solo tuyo."
            cta="Nueva entrada"
            onCta={() => setShowAdd(true)}
            size="sm"
            variant="gold"
          />
        )}
      </div>

      {/* Tips */}
      <EmpireTipsSection empire="crecimiento" subtitle="Apuntes para tu crecimiento" />
      {/* Micro-reward for journal entry */}
      <MicroReward trigger={showReward} message="Entrada guardada" onComplete={() => setShowReward(false)} />

      {/* Action error toast — auto-dismisses */}
      {actionError && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-champagne/20 text-champagne text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in"
          onClick={() => setActionError('')}
        >
          {actionError}
        </div>
      )}
    </div>
  );
}
