'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp, Plus, BookOpen, Heart, Lightbulb, Pencil, Trash2, BookOpenText } from 'lucide-react';
import PremiumBlur from '@/components/ui/PremiumBlur';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';

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
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', mood: 3, gratitude: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [jRes, tRes] = await Promise.all([
        apiFetch('/api/journal'),
        apiFetch('/api/empire/tips?empire=crecimiento'),
      ]);
      if (jRes.ok) { const d = await jRes.json(); setEntries(d.entries); }
      if (tRes.ok) { const d = await tRes.json(); setTips(d.tips); }
    } catch (e) {
      console.error(e);
      setFetchError(true);
    } finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const submitEntry = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
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
    } catch (error) { console.error('Error submitting entry:', error); }
  };

  const startEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEditForm({ title: entry.title, content: entry.content, mood: entry.mood || 3, gratitude: entry.gratitude || '' });
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    setEditSaving(true);
    try {
      console.log('[CRUD DEBUG] Journal PUT - entryId:', editingEntry.id);
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
        console.error('[CRUD DEBUG] Journal PUT failed:', res.status, errData);
      }
    } catch (error) { console.error('Error updating entry:', error); }
    finally { setEditSaving(false); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      console.log('[CRUD DEBUG] Journal DELETE - entryId:', pendingDeleteId);
      const res = await apiFetch('/api/journal', {
        method: 'DELETE',
        body: JSON.stringify({ entryId: pendingDeleteId }),
      });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Journal DELETE failed:', res.status, errData);
      }
    } catch (error) { console.error('Error deleting entry:', error); }
    finally { setPendingDeleteId(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <TrendingUp size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
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
      {/* Edit Journal Entry Overlay */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setEditingEntry(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar entrada</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Título" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
              <textarea placeholder="Contenido" value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666] h-28 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#999] uppercase tracking-wider font-medium mb-2 block">Ánimo (1-5)</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setEditForm({ ...editForm, mood: n })}
                        className={`w-8 h-8 rounded border text-xs ${n <= editForm.mood ? 'bg-[#c8a55a] border-[#c8a55a] text-black' : 'bg-[#000000] border-[#1a1a1a] text-[#666]'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#999] uppercase tracking-wider font-medium mb-2 block">Gratitud</label>
                  <input type="text" placeholder="Agradecido por..." value={editForm.gratitude} onChange={(e) => setEditForm({ ...editForm, gratitude: e.target.value })}
                    className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-3 py-2 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666]" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingEntry(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
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
            <h3 className="text-lg font-bold text-white mb-2">Eliminar entrada</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPendingDeleteId(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-red-500 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

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
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6">
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
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666]" />
            <textarea placeholder="¿Qué hay en tu mente?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666] h-32 resize-none" />
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
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-base sm:text-sm placeholder-[#666]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={submitEntry} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-[#d4b468]">Guardar</button>
              <button onClick={() => setShowAdd(false)} className="text-[#999] px-4 py-2 text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {entries.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 group hover:border-[#222] transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[#c8a55a] font-medium">{entry.title}</h3>
                  <div className="flex items-center gap-2">
                    {entry.mood && (
                      <span className="flex items-center gap-1 text-xs text-[#c8a55a]">
                        <Heart size={12} /> {entry.mood}/5
                      </span>
                    )}
                    <span className="text-xs text-[#666]">{new Date(entry.createdAt).toLocaleDateString('es')}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(entry)} className="p-1.5 rounded-lg hover:bg-[#c8a55a]/10 text-[#555] hover:text-[#c8a55a] transition-all" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => setPendingDeleteId(entry.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-all" title="Eliminar"><Trash2 size={14} /></button>
                    </div>
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
          <PremiumEmptyState
            icon={BookOpenText}
            title="Tu diario está en blanco"
            subtitle="Escribe tu primera entrada y comienza a documentar tu evolución"
            cta="Nueva entrada"
            onCta={() => setShowAdd(true)}
            size="sm"
          />
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6">
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
