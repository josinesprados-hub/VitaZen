'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { getMadridDateKey, daysBetweenDateKeys, safeFormatDate, safeFormatTime } from '@/lib/dates';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_HABITS, SCREENSHOT_CHALLENGE as SCREENSHOT_HABIT_CHALLENGE } from '@/lib/screenshot-data';
import { Shield, Plus, Check, Trash2, Flame, Trophy, Lightbulb, Pencil, Calendar, Clock, Undo2 } from 'lucide-react';
import ContextualHelp from '@/components/ui/ContextualHelp';
import EmpireTipsSection from '@/components/ui/EmpireTipsSection';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { EmpireSkeleton } from '@/components/ui/PremiumSkeleton';
import { MicroReward } from '@/components/ui/MicroReward';
import PrivacyMask from '@/components/ui/PrivacyMask';

interface Habit {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  streak: number;
  lastCompletedAt: string | null;
  createdAt: string;
}

interface Challenge {
  id: string;
  completed: boolean;
  challenge: { id: string; title: string; description: string; category: string; difficulty: string; };
}


export default function DisciplinaPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();

  // Check if a habit was completed within its current frequency period,
  // matching the server-side criterion in PATCH /api/habits (H-7 fix).
  // daily: completed today; weekly: completed within last 7 days; monthly: within last 30 days.
  const isCompletedInPeriod = (habit: Habit) => {
    if (!habit.lastCompletedAt) return false;
    const lastDate = getMadridDateKey(new Date(habit.lastCompletedAt));
    const today = getMadridDateKey(new Date());
    if (habit.frequency === 'daily') return lastDate === today;
    const diffDays = daysBetweenDateKeys(lastDate, today);
    if (habit.frequency === 'weekly') return diffDays < 7;
    if (habit.frequency === 'monthly') return diffDays < 30;
    return lastDate === today;
  };

  const [habits, setHabits] = useState<Habit[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', description: '', frequency: 'daily' });
  const [loading, setLoading] = useState(true);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', frequency: 'daily' });
  const [editSaving, setEditSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [actionError, setActionError] = useState('');
  const [undoState, setUndoState] = useState<{ habitId: string; previousLastCompletedAt: string | null } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCompletedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss action error toast
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(''), 4000);
    return () => clearTimeout(timer);
  }, [actionError]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (justCompletedTimerRef.current) clearTimeout(justCompletedTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Auto-dismiss undo option after 5 seconds
  useEffect(() => {
    if (!undoState) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoState(null), 5000);
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, [undoState]);

  // Lock body scroll when any modal is open — save/restore scroll position
  useEffect(() => {
    if (editingHabit || pendingDeleteId) {
      document.body.classList.add('scroll-locked');
      return () => {
        document.body.classList.remove('scroll-locked');
      };
    }
  }, [editingHabit, pendingDeleteId]);

  const fetchData = useCallback(async () => {
    // ── Screenshot mode: use mock data, skip API calls ──
    if (screenshotMode) {
      setHabits(SCREENSHOT_HABITS);
      setChallenge(SCREENSHOT_HABIT_CHALLENGE);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(false);
    try {
      const [habRes, chRes] = await Promise.all([
        apiFetch('/api/habits'),
        apiFetch('/api/challenges'),
      ]);
      if (habRes.ok) { const d = await habRes.json(); setHabits(d.habits); }
      if (chRes.ok) { const d = await chRes.json(); setChallenge(d.challenge); }
    } catch (error) {
      console.error('Error:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, screenshotMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh only the challenge state from the server.
  // Used after actions that may auto-complete the challenge (habit create/complete)
  // so the UI reflects the new state without a full page reload.
  const refreshChallenge = useCallback(async () => {
    try {
      const chRes = await apiFetch('/api/challenges');
      if (chRes.ok) { const d = await chRes.json(); setChallenge(d.challenge); }
    } catch {
      // Silent — never disrupt the parent action
    }
  }, [apiFetch]);

  const addHabit = async () => {
    if (!newHabit.name.trim()) return;
    try {
      const res = await apiFetch('/api/habits', {
        method: 'POST',
        body: JSON.stringify(newHabit),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits(prev => [data.habit, ...prev]);
        setNewHabit({ name: '', description: '', frequency: 'daily' });
        setShowAddHabit(false);
        refreshChallenge(); // Creating a habit may auto-complete today's challenge
      } else {
        const errData = await res.json().catch(() => ({}));
        setActionError(errData.error || errData.message || `Error al crear (${res.status})`);
      }
    } catch (error) {
      console.error('Error adding habit:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    }
  };

  const completeHabit = async (habitId: string) => {
    try {
      // Capturar estado previo antes de la llamada (H-9 undo base)
      const currentHabit = habits.find(h => h.id === habitId);
      const previousLastCompletedAt = currentHabit?.lastCompletedAt ?? null;

      const res = await apiFetch('/api/habits', {
        method: 'PATCH',
        body: JSON.stringify({ habitId }),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits(prev => prev.map(h => h.id === habitId ? data.habit : h));
        setJustCompletedId(habitId);
        setShowReward(true);
        if (justCompletedTimerRef.current) clearTimeout(justCompletedTimerRef.current);
        justCompletedTimerRef.current = setTimeout(() => setJustCompletedId(null), 600);
        // Activar opción de deshacer (H-9)
        setUndoState({ habitId, previousLastCompletedAt });
        refreshChallenge(); // Completing a habit may auto-complete today's challenge
      } else {
        const errData = await res.json().catch(() => ({}));
        setActionError(errData.error || errData.message || `Error al completar (${res.status})`);
      }
    } catch (error) {
      console.error('Error completing habit:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    }
  };

  // H-9: Deshacer la última completación
  const undoComplete = async () => {
    if (!undoState) return;
    const { habitId, previousLastCompletedAt } = undoState;
    setUndoState(null); // Ocultar inmediatamente
    try {
      const res = await apiFetch('/api/habits/undo', {
        method: 'POST',
        body: JSON.stringify({ habitId, previousLastCompletedAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits(prev => prev.map(h => h.id === habitId ? data.habit : h));
      } else {
        const errData = await res.json().catch(() => ({}));
        setActionError(errData.error || errData.message || 'Error al deshacer');
      }
    } catch (error) {
      console.error('Error undoing habit:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    }
  };

  const startEdit = (habit: Habit) => {
    setEditingHabit(habit);
    setEditForm({ name: habit.name, description: habit.description || '', frequency: habit.frequency });
  };

  const saveEdit = async () => {
    if (!editingHabit) return;
    setEditSaving(true);
    try {

      const res = await apiFetch('/api/habits', {
        method: 'PUT',
        body: JSON.stringify({ habitId: editingHabit.id, ...editForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits(prev => prev.map(h => h.id === editingHabit.id ? data.habit : h));
        setEditingHabit(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Habits PUT failed:', res.status, errData);
        setActionError(errData.error || errData.message || `Error al guardar (${res.status})`);
      }
    } catch (error) {
      console.error('Error updating habit:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    }
    finally { setEditSaving(false); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {

      const res = await apiFetch('/api/habits', {
        method: 'DELETE',
        body: JSON.stringify({ habitId: pendingDeleteId }),
      });
      if (res.ok) {
        setHabits(prev => prev.filter(h => h.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Habits DELETE failed:', res.status, errData);
        setActionError(errData.error || errData.message || `Error al eliminar (${res.status})`);
      }
    } catch (error) {
      console.error('Error deleting habit:', error);
      setActionError('Sin conexión. Inténtalo de nuevo.');
    }
    finally { setPendingDeleteId(null); }
  };

  const deleteHabit = async (habitId: string) => {
    setPendingDeleteId(habitId);
  };

  if (loading) {
    return <EmpireSkeleton message="Preparando tus hábitos..." />;
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
      {/* Edit Habit Overlay */}
      {editingHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={() => setEditingHabit(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-champagne/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-champagne" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar hábito</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Nombre del hábito" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-champagne/50 transition-colors placeholder-[#666]" />
              <input type="text" placeholder="Descripción (opcional)" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-champagne/50 transition-colors placeholder-[#666]" />
              <select value={editForm.frequency} onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-champagne/50 transition-colors appearance-none">
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingHabit(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} className="bg-champagne text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-champagne-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={() => setPendingDeleteId(null)}>
          <div className="modal-content-destructive p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar hábito</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Help — hidden in screenshot mode */}
      {!screenshotMode && (
        <ContextualHelp
          storageKey="vitazen_help_habits"
          title="Mis Hábitos"
          text="Crea hábitos y márcalos cada día. Tu racha crece con la consistencia. Puedes editar o eliminar cualquier hábito cuando quieras."
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-champagne/10 flex items-center justify-center">
          <Shield size={28} className="text-champagne" />
        </div>
        <div>
          <h1 className="title-page">Disciplina</h1>
          <p className="subtitle-silent mt-1">Hábitos y consistencia</p>
        </div>
      </div>

      {/* Daily Challenge — auto-completes when action is performed */}
      {challenge && (
        <div className={`bg-[#0a0a0a] border rounded-xl p-5 sm:p-6 section-enter-1 transition-all duration-300 ${challenge.completed ? 'border-champagne/30' : 'border-champagne/20'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={20} className="text-champagne" />
            <h2 className="text-lg font-semibold text-white">Desafío Diario</h2>
            {challenge.completed && <span className="text-xs px-2.5 py-1 rounded-full bg-champagne/15 text-champagne font-medium check-pop">Completado</span>}
          </div>
          <h3 className="text-champagne font-medium mb-1">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-sm mb-4 line-clamp-3">{challenge.challenge.description}</p>
          {!challenge.completed ? (
            <p className="text-[11px] text-[#888] flex items-center gap-1.5">
              <Lightbulb size={12} className="text-champagne/60" />
              Completa la acción correspondiente para completar este desafío automáticamente
            </p>
          ) : (
            <p className="text-[11px] text-champagne/80 flex items-center gap-1.5">
              <Check size={12} /> Desafío completado automáticamente al realizar la acción
            </p>
          )}
        </div>
      )}

      {/* Habits */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Mis Hábitos</h2>
          <button
            onClick={() => setShowAddHabit(!showAddHabit)}
            className="flex items-center gap-2 text-sm text-champagne hover:text-champagne-hover touch-press"
          >
            <Plus size={18} /> Añadir hábito
          </button>
        </div>

        {showAddHabit && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 space-y-3">
            <input
              type="text"
              placeholder="Nombre del hábito"
              value={newHabit.name}
              onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base placeholder-[#666]"
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={newHabit.description}
              onChange={(e) => setNewHabit({ ...newHabit, description: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base placeholder-[#666]"
            />
            <select
              value={newHabit.frequency}
              onChange={(e) => setNewHabit({ ...newHabit, frequency: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base focus:outline-none focus:border-champagne/50 transition-colors appearance-none"
            >
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </select>
            <div className="flex gap-2">
              <button onClick={addHabit} className="bg-champagne text-black font-semibold px-5 py-2 rounded-xl text-sm hover:bg-champagne-hover transition-colors touch-press">Guardar</button>
              <button onClick={() => setShowAddHabit(false)} className="text-[#999] px-4 py-2 text-sm hover:text-white touch-press">Cancelar</button>
            </div>
          </div>
        )}

        {habits.length === 0 ? (
          <PremiumEmptyState
            icon={Check}
            title="Aún sin hábitos"
            subtitle="Empieza cuando quieras."
            cta="Crear hábito"
            onCta={() => setShowAddHabit(true)}
            size="sm"
            variant="gold"
          />
        ) : (
          <div className="space-y-2.5">
            {habits.map((habit) => (
              <div key={habit.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 group hover:border-[#222] transition-colors">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => completeHabit(habit.id)}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all touch-press ${
                      justCompletedId === habit.id ? 'check-pop' : ''
                    } ${
                      isCompletedInPeriod(habit)
                        ? 'bg-champagne border-champagne scale-100'
                        : 'border-[#333] hover:border-champagne hover:bg-champagne/10'
                    }`}
                  >
                    <Check size={16} className={isCompletedInPeriod(habit) ? 'text-black' : 'text-champagne'} />
                  </button>
                  <div>
                    <p className="text-white text-sm font-medium">{habit.name}</p>
                    {habit.description && <p className="text-[#888] text-xs">{habit.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-[#999]"><Calendar size={11} />{safeFormatDate(habit.createdAt)}</span>
                      <span className="text-[#999] text-xs">·</span>
                      <span className="flex items-center gap-1 text-xs text-[#999]"><Clock size={11} />{safeFormatTime(habit.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {habit.streak > 0 && (
                    <span className="flex items-center gap-1 text-champagne text-xs mr-1">
                      <Flame size={14} /> <PrivacyMask compact>{habit.streak}</PrivacyMask>
                    </span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(habit)} className="p-2.5 rounded-lg hover:bg-champagne/10 text-[#888] hover:text-champagne transition-all touch-press" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteHabit(habit.id)} className="p-2.5 rounded-lg hover:bg-red-500/10 text-[#888] hover:text-red-400 transition-all touch-press" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips — frozen in screenshot mode, normal rotation otherwise */}
      <EmpireTipsSection empire="disciplina" subtitle="Ideas para tu disciplina" />
      {/* Micro-reward for habit completion */}
      <MicroReward trigger={showReward} message="Hábito completado" onComplete={() => setShowReward(false)} />

      {/* H-9: Undo toast — aparece tras completar, se auto-oculta a los 5s */}
      {undoState && !actionError && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-champagne/20 text-champagne text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in flex items-center gap-3"
        >
          <span>Completado</span>
          <button
            onClick={undoComplete}
            className="flex items-center gap-1.5 bg-champagne/10 hover:bg-champagne/20 text-champagne px-3 py-1 rounded-lg transition-colors touch-press"
          >
            <Undo2 size={12} /> Deshacer
          </button>
        </div>
      )}

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
