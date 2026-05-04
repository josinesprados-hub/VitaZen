'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Shield, Plus, Check, Trash2, Flame, Trophy, Lightbulb } from 'lucide-react';

interface Habit {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  streak: number;
  lastCompletedAt: string | null;
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
  const [habits, setHabits] = useState<Habit[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', description: '', frequency: 'daily' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
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
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const addHabit = async () => {
    if (!newHabit.name.trim()) return;
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
  };

  const completeHabit = async (habitId: string) => {
    const res = await apiFetch('/api/habits', {
      method: 'PATCH',
      body: JSON.stringify({ habitId }),
    });
    if (res.ok) {
      const data = await res.json();
      setHabits(habits.map(h => h.id === habitId ? data.habit : h));
    }
  };

  const deleteHabit = async (habitId: string) => {
    const res = await apiFetch('/api/habits', {
      method: 'DELETE',
      body: JSON.stringify({ habitId }),
    });
    if (res.ok) {
      setHabits(habits.filter(h => h.id !== habitId));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Shield size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
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
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Trophy size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Desafío del día</h2>
            {challenge.completed && <span className="text-xs px-2 py-1 rounded-full bg-[#c8a55a]/20 text-[#c8a55a]">Completado</span>}
          </div>
          <h3 className="text-[#c8a55a] font-medium mb-1">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-sm mb-3">{challenge.challenge.description}</p>
          {!challenge.completed && (
            <button
              onClick={async () => {
                const res = await apiFetch('/api/challenges/complete', { method: 'POST', body: JSON.stringify({ challengeId: challenge.challenge.id }) });
                if (res.ok) setChallenge({ ...challenge, completed: true });
              }}
              className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
            >
              Completar desafío
            </button>
          )}
        </div>
      )}

      {/* Habits */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Mis Hábitos</h2>
          <button
            onClick={() => setShowAddHabit(!showAddHabit)}
            className="flex items-center gap-2 text-sm text-[#c8a55a] hover:text-[#d4b468]"
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
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]"
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={newHabit.description}
              onChange={(e) => setNewHabit({ ...newHabit, description: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]"
            />
            <div className="flex gap-2">
              <button onClick={addHabit} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d4b468] transition-colors">Guardar</button>
              <button onClick={() => setShowAddHabit(false)} className="text-[#999] px-4 py-2 text-sm hover:text-white">Cancelar</button>
            </div>
          </div>
        )}

        {habits.length === 0 ? (
          <p className="text-[#666] text-sm text-center py-8">No tienes hábitos aún. Crea el primero.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {habits.map((habit) => (
              <div key={habit.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => completeHabit(habit.id)}
                    className="w-8 h-8 rounded-full border border-[#1a1a1a] flex items-center justify-center hover:border-[#c8a55a] transition-colors"
                  >
                    <Check size={14} className="text-[#c8a55a]" />
                  </button>
                  <div>
                    <p className="text-white text-sm font-medium">{habit.name}</p>
                    {habit.description && <p className="text-[#666] text-xs">{habit.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {habit.streak > 0 && (
                    <span className="flex items-center gap-1 text-[#c8a55a] text-xs">
                      <Flame size={14} /> {habit.streak}
                    </span>
                  )}
                  <button onClick={() => deleteHabit(habit.id)} className="text-[#666] hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
            {tips.map((tip) => (
              <div key={tip.id} className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4">
                <h3 className="text-[#c8a55a] font-medium text-sm mb-1">{tip.title}</h3>
                <p className="text-[#999] text-sm">{tip.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
