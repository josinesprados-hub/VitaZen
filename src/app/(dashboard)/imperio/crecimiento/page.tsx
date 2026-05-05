'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp, Plus, BookOpen, Heart, Lightbulb, Pencil, Trash2 } from 'lucide-react';
import PremiumBlur from '@/components/ui/PremiumBlur';

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  mood: number | null;
  gratitude: string | null;
  createdAt: string;
}

interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

export default function CrecimientoPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', mood: 3, gratitude: '' });
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [jRes, tRes] = await Promise.all([
          apiFetch('/api/journal'),
          apiFetch('/api/empire/tips?empire=crecimiento'),
        ]);
        if (jRes.ok) { const d = await jRes.json(); setEntries(d.entries); }
        if (tRes.ok) { const d = await tRes.json(); setTips(d.tips); }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const submitEntry = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    const res = await apiFetch('/api/journal', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json();
      setEntries([data.entry, ...entries]);
      setShowAdd(false);
      setForm({ title: '', content: '', mood: 3, gratitude: '' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <TrendingUp size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <TrendingUp size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Crecimiento</h1>
          <p className="text-[#999] text-sm">Reflexión, evolución y crecimiento personal</p>
        </div>
      </div>

      {/* Journal */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-[#c8a55a]" /> Diario Personal
          </h2>
          <button onClick={() => setShowAdd(!showAdd)} className="text-sm text-[#c8a55a] hover:text-[#d4b468]">
            <Plus size={18} className="inline mr-1" /> Nueva entrada
          </button>
        </div>
        <p className="text-[#666] text-xs mb-5">Escribe, reflexiona y transforma</p>

        {showAdd && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 space-y-3">
            <input type="text" placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]" />
            <textarea placeholder="¿Qué hay en tu mente?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666] h-32 resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[#999] mb-1 block">Estado de ánimo (1-5)</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setForm({ ...form, mood: n })}
                      className={`w-9 h-9 rounded border text-sm ${n <= form.mood ? 'bg-[#c8a55a] border-[#c8a55a] text-black' : 'bg-[#0a0a0a] border-[#1a1a1a] text-[#666]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-[#999] mb-1 block">Gratitud</label>
                <input type="text" placeholder="¿Por qué estás agradecido hoy?" value={form.gratitude} onChange={(e) => setForm({ ...form, gratitude: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={submitEntry} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d4b468]">Guardar</button>
              <button onClick={() => setShowAdd(false)} className="text-[#999] px-4 py-2 text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {entries.length > 0 ? (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[#c8a55a] font-medium">{entry.title}</h3>
                  <div className="flex items-center gap-2">
                    {entry.mood && (
                      <span className="flex items-center gap-1 text-xs text-[#c8a55a]">
                        <Heart size={12} /> {entry.mood}/5
                      </span>
                    )}
                    <span className="text-xs text-[#666]">{new Date(entry.createdAt).toLocaleDateString('es')}</span>
                  </div>
                </div>
                <p className="text-[#999] text-sm whitespace-pre-wrap">
                  {expandedEntry === entry.id ? entry.content : entry.content.slice(0, 150) + (entry.content.length > 150 ? '...' : '')}
                </p>
                {entry.content.length > 150 && (
                  <button onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                    className="text-[#c8a55a] text-xs mt-1 hover:underline">
                    {expandedEntry === entry.id ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
                {entry.gratitude && (
                  <div className="mt-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded p-2">
                    <p className="text-xs text-[#c8a55a]">Gratitud: <span className="text-[#999]">{entry.gratitude}</span></p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#666] text-sm text-center py-8">Escribe tu primera entrada y comienza a documentar tu evolución</p>
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos de Expertos</h2>
          </div>
          <p className="text-[#666] text-xs mb-5">Herramientas para acelerar tu evolución</p>
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
