'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Shield, Plus, Check, Trash2, Flame, Trophy, Lightbulb, Pencil, Calendar, Clock } from 'lucide-react';
import PremiumBlur from '@/components/ui/PremiumBlur';
import ContextualHelp from '@/components/ui/ContextualHelp';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { EmpireSkeleton } from '@/components/ui/PremiumSkeleton';

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

interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

export default function DisciplinaPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';
  const [habits, setHabits] = useState<Habit[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', description: '', frequency: 'daily' });
  const [loading, setLoading] = useState(true);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', frequency: 'daily' });
  const [editSaving, setEditSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // Lock body scroll when any modal is open
  useEffect(() => {
    if (editingHabit || pendingDeleteId) {
      document.body.classList.add('scroll-locked');
      return () => document.body.classList.remove('scroll-locked');
    }
  }, [editingHabit, pendingDeleteId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [habRes, chRes, tipsRes] = await Promise.all([
        apiFetch('/api/habits'),
        apiFetch('/api/challenges'),
        apiFetch('/api/empire/tips?empire=disciplina'),
      ]);
      if (habRes.ok) { const d = await habRes.json(); setHabits(d.habits); }
      if (chRes.ok) { const d = await chRes.json(); setChallenge(d.challenge); }
      if (tipsRes.ok) { const d = await tipsRes.json(); setTips(d.tips); }
    } catch (error) {
      console.error('Error:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addHabit = async () => {
    if (!newHabit.name.trim()) return;
    try {
      const res = await apiFetch('/api/habits', {
        method: 'POST',
        body: JSON.stringify(newHabit),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits([data.habit, ...habits]);
        setNewHabit({ name: '', description: '', frequency: 'daily' });
        setShowAddHabit(false);
      }
    } catch (error) {
      console.error('Error adding habit:', error);
    }
  };

  const completeHabit = async (habitId: string) => {
    try {
      const res = await apiFetch('/api/habits', {
        method: 'PATCH',
        body: JSON.stringify({ habitId }),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits(habits.map(h => h.id === habitId ? data.habit : h));
        setJustCompletedId(habitId);
        setTimeout(() => setJustCompletedId(null), 600);
      }
    } catch (error) {
      console.error('Error completing habit:', error);
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
      console.log('[CRUD DEBUG] Habits PUT - habitId:', editingHabit.id);
      const res = await apiFetch('/api/habits', {
        method: 'PUT',
        body: JSON.stringify({ habitId: editingHabit.id, ...editForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setHabits(habits.map(h => h.id === editingHabit.id ? data.habit : h));
        setEditingHabit(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Habits PUT failed:', res.status, errData);
      }
    } catch (error) { console.error('Error updating habit:', error); }
    finally { setEditSaving(false); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      console.log('[CRUD DEBUG] Habits DELETE - habitId:', pendingDeleteId);
      const res = await apiFetch('/api/habits', {
        method: 'DELETE',
        body: JSON.stringify({ habitId: pendingDeleteId }),
      });
      if (res.ok) {
        setHabits(habits.filter(h => h.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Habits DELETE failed:', res.status, errData);
      }
    } catch (error) { console.error('Error deleting habit:', error); }
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Edit Habit Overlay */}
      {editingHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setEditingHabit(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar hábito</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Nombre del hábito" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <input type="text" placeholder="Descripción (opcional)" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <select value={editForm.frequency} onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors appearance-none">
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingHabit(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} className="bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editSaving ? 'Guardando...' : 'Guardar'}</button>
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
            <h3 className="text-lg font-bold text-white mb-2">Eliminar hábito</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Help */}
      <ContextualHelp
        storageKey="vitazen_help_habits"
        title="Mis Hábitos"
        text="Crea hábitos y márcalos como completados cada día. Tu racha crece con la consistencia. Puedes editar o eliminar cualquier hábito."
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Shield size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Disciplina</h1>
          <p className="text-[#999] text-sm">Hábitos, desafíos y consistencia diaria</p>
        </div>
      </div>

      {/* Daily Challenge */}
      {challenge && (
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl p-5 sm:p-6 section-enter-1">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Desafío Diario</h2>
            {challenge.completed && <span className="text-xs px-2.5 py-1 rounded-full bg-[#c8a55a]/15 text-[#c8a55a] font-medium">Completado</span>}
          </div>
          <h3 className="text-[#c8a55a] font-medium mb-1">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-sm mb-4">{challenge.challenge.description}</p>
          {!challenge.completed && (
            <button
              onClick={async () => {
                try {
                  const res = await apiFetch('/api/challenges/complete', { method: 'POST', body: JSON.stringify({ challengeId: challenge.challenge.id }) });
                  if (res.ok) setChallenge({ ...challenge, completed: true });
                } catch (error) { console.error('Error completing challenge:', error); }
              }}
              className="bg-[#c8a55a] text-black font-semibold px-6 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm touch-press"
            >
              Completar desafío
            </button>
          )}
        </div>
      )}

      {/* Habits */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Mis Hábitos</h2>
          <button
            onClick={() => setShowAddHabit(!showAddHabit)}
            className="flex items-center gap-2 text-sm text-[#c8a55a] hover:text-[#d4b468] touch-press"
          >
            <Plus size={18} /> Añadir hábito
          </button>
        </div>
        <p className="text-[#666] text-xs mb-5">La consistencia transforma acciones en resultados</p>

        {showAddHabit && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 space-y-3">
            <input
              type="text"
              placeholder="Nombre del hábito"
              value={newHabit.name}
              onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666]"
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={newHabit.description}
              onChange={(e) => setNewHabit({ ...newHabit, description: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666]"
            />
            <div className="flex gap-2">
              <button onClick={addHabit} className="bg-[#c8a55a] text-black font-semibold px-5 py-2 rounded-xl text-sm hover:bg-[#d4b468] transition-colors touch-press">Guardar</button>
              <button onClick={() => setShowAddHabit(false)} className="text-[#999] px-4 py-2 text-sm hover:text-white touch-press">Cancelar</button>
            </div>
          </div>
        )}

        {habits.length === 0 ? (
          <PremiumEmptyState
            icon={Check}
            title="Aún no tienes hábitos"
            subtitle="Crea el primero y comienza tu transformación"
            cta="Añadir hábito"
            onCta={() => setShowAddHabit(true)}
            size="sm"
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
                      habit.lastCompletedAt && new Date(habit.lastCompletedAt).toDateString() === new Date().toDateString()
                        ? 'bg-[#c8a55a] border-[#c8a55a] scale-100'
                        : 'border-[#333] hover:border-[#c8a55a] hover:bg-[#c8a55a]/10'
                    }`}
                  >
                    <Check size={16} className={habit.lastCompletedAt && new Date(habit.lastCompletedAt).toDateString() === new Date().toDateString() ? 'text-black' : 'text-[#c8a55a]'} />
                  </button>
                  <div>
                    <p className="text-white text-sm font-medium">{habit.name}</p>
                    {habit.description && <p className="text-[#666] text-xs">{habit.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-[#999]"><Calendar size={11} />{new Date(habit.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span className="text-[#333] text-xs">·</span>
                      <span className="flex items-center gap-1 text-xs text-[#999]"><Clock size={11} />{new Date(habit.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {habit.streak > 0 && (
                    <span className="flex items-center gap-1 text-[#c8a55a] text-xs mr-1">
                      <Flame size={14} /> {habit.streak}
                    </span>
                  )}
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(habit)} className="p-2.5 rounded-lg hover:bg-[#c8a55a]/10 text-[#888] hover:text-[#c8a55a] transition-all touch-press" title="Editar">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deleteHabit(habit.id)} className="p-2.5 rounded-lg hover:bg-red-500/10 text-[#888] hover:text-red-400 transition-all touch-press" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos de Expertos</h2>
          </div>
          <p className="text-[#666] text-xs mb-5">Estrategias para fortalecer tu disciplina</p>
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
