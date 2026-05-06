'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Zap, Droplets, Flame, Apple, Lightbulb, Pencil, Trash2 } from 'lucide-react';
import PremiumBlur from '@/components/ui/PremiumBlur';

interface WellnessLog {
  id: string;
  date: string;
  mood: number;
  energy: number;
  sleep: number;
  stress: number;
  notes: string | null;
}

interface NutritionLog {
  id: string;
  date: string;
  meals: string | null;
  water: number;
  calories: number | null;
  notes: string | null;
}

interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

export default function EnergiaPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';
  const [wellnessLogs, setWellnessLogs] = useState<WellnessLog[]>([]);
  const [nutrition, setNutrition] = useState<NutritionLog[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [showWellness, setShowWellness] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [wellnessForm, setWellnessForm] = useState({ mood: 3, energy: 3, sleep: 3, stress: 3, notes: '' });
  const [nutritionForm, setNutritionForm] = useState({ meals: '', water: 0, calories: 0, notes: '' });
  const [loading, setLoading] = useState(true);
  const [editingWellness, setEditingWellness] = useState<WellnessLog | null>(null);
  const [editWellnessForm, setEditWellnessForm] = useState({ mood: 3, energy: 3, sleep: 3, stress: 3, notes: '' });
  const [editWellnessSaving, setEditWellnessSaving] = useState(false);
  const [editingNutrition, setEditingNutrition] = useState<NutritionLog | null>(null);
  const [editNutritionForm, setEditNutritionForm] = useState({ meals: '', water: 0, calories: 0, notes: '' });
  const [editNutritionSaving, setEditNutritionSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<{ id: string; type: 'wellness' | 'nutrition' } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [wRes, nRes, tRes] = await Promise.all([
          apiFetch('/api/wellness'),
          apiFetch('/api/nutrition'),
          apiFetch('/api/empire/tips?empire=energia'),
        ]);
        if (wRes.ok) { const d = await wRes.json(); setWellnessLogs(d.logs); }
        if (nRes.ok) { const d = await nRes.json(); setNutrition(d.logs); }
        if (tRes.ok) { const d = await tRes.json(); setTips(d.tips); }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const submitWellness = async () => {
    const res = await apiFetch('/api/wellness', {
      method: 'POST',
      body: JSON.stringify({ date: new Date().toISOString().split('T')[0], ...wellnessForm }),
    });
    if (res.ok) {
      const data = await res.json();
      setWellnessLogs([data.log, ...wellnessLogs]);
      setShowWellness(false);
    }
  };

  const submitNutrition = async () => {
    const res = await apiFetch('/api/nutrition', {
      method: 'POST',
      body: JSON.stringify({ date: new Date().toISOString().split('T')[0], ...nutritionForm }),
    });
    if (res.ok) {
      const data = await res.json();
      setNutrition([data.log, ...nutrition]);
      setShowNutrition(false);
    }
  };

  const RatingInput = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div>
      <label className="text-sm text-[#999] mb-1 block">{label}</label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)}
            className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${n <= value ? 'bg-[#c8a55a] border-[#c8a55a] text-black' : 'bg-[#000000] border-[#1a1a1a] text-[#666] hover:border-[#c8a55a]'}`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  const startEditWellness = (log: WellnessLog) => {
    setEditingWellness(log);
    setEditWellnessForm({ mood: log.mood, energy: log.energy, sleep: log.sleep, stress: log.stress, notes: log.notes || '' });
  };

  const saveEditWellness = async () => {
    if (!editingWellness) return;
    setEditWellnessSaving(true);
    try {
      console.log('[CRUD DEBUG] Wellness PUT - logId:', editingWellness.id);
      const res = await apiFetch('/api/wellness', {
        method: 'PUT',
        body: JSON.stringify({ logId: editingWellness.id, ...editWellnessForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setWellnessLogs(prev => prev.map(l => l.id === editingWellness.id ? data.log : l));
        setEditingWellness(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Wellness PUT failed:', res.status, errData);
      }
    } catch (error) { console.error('Error updating wellness log:', error); }
    finally { setEditWellnessSaving(false); }
  };

  const startEditNutrition = (log: NutritionLog) => {
    setEditingNutrition(log);
    setEditNutritionForm({ meals: log.meals || '', water: log.water, calories: log.calories || 0, notes: log.notes || '' });
  };

  const saveEditNutrition = async () => {
    if (!editingNutrition) return;
    setEditNutritionSaving(true);
    try {
      console.log('[CRUD DEBUG] Nutrition PUT - logId:', editingNutrition.id);
      const res = await apiFetch('/api/nutrition', {
        method: 'PUT',
        body: JSON.stringify({ logId: editingNutrition.id, ...editNutritionForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setNutrition(prev => prev.map(l => l.id === editingNutrition.id ? data.log : l));
        setEditingNutrition(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] Nutrition PUT failed:', res.status, errData);
      }
    } catch (error) { console.error('Error updating nutrition log:', error); }
    finally { setEditNutritionSaving(false); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const endpoint = pendingDeleteId.type === 'wellness' ? '/api/wellness' : '/api/nutrition';
      const bodyKey = 'logId';
      console.log('[CRUD DEBUG] DELETE - endpoint:', endpoint, 'logId:', pendingDeleteId.id, 'type:', pendingDeleteId.type);
      const res = await apiFetch(endpoint, {
        method: 'DELETE',
        body: JSON.stringify({ [bodyKey]: pendingDeleteId.id }),
      });
      if (res.ok) {
        if (pendingDeleteId.type === 'wellness') {
          setWellnessLogs(prev => prev.filter(l => l.id !== pendingDeleteId.id));
        } else {
          setNutrition(prev => prev.filter(l => l.id !== pendingDeleteId.id));
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[CRUD DEBUG] DELETE failed:', res.status, errData);
      }
    } catch (error) { console.error('Error deleting log:', error); }
    finally { setPendingDeleteId(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Zap size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Edit Wellness Overlay */}
      {editingWellness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setEditingWellness(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar bienestar</h3>
            <div className="space-y-4">
              <RatingInput label="Estado de ánimo" value={editWellnessForm.mood} onChange={(v) => setEditWellnessForm({ ...editWellnessForm, mood: v })} />
              <RatingInput label="Energía" value={editWellnessForm.energy} onChange={(v) => setEditWellnessForm({ ...editWellnessForm, energy: v })} />
              <RatingInput label="Sueño" value={editWellnessForm.sleep} onChange={(v) => setEditWellnessForm({ ...editWellnessForm, sleep: v })} />
              <RatingInput label="Estrés" value={editWellnessForm.stress} onChange={(v) => setEditWellnessForm({ ...editWellnessForm, stress: v })} />
              <textarea placeholder="Notas (opcional)" value={editWellnessForm.notes} onChange={(e) => setEditWellnessForm({ ...editWellnessForm, notes: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666] h-20 resize-none" />
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingWellness(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-lg hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEditWellness} disabled={editWellnessSaving} className="bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-lg hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editWellnessSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Nutrition Overlay */}
      {editingNutrition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setEditingNutrition(null)}>
          <div className="modal-content p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar nutrición</h3>
            <div className="space-y-3">
              <textarea placeholder="Comidas del día" value={editNutritionForm.meals} onChange={(e) => setEditNutritionForm({ ...editNutritionForm, meals: e.target.value })}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors placeholder-[#666] h-20 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#999] uppercase tracking-wider font-medium mb-2 block">Vasos de agua</label>
                  <input type="number" value={editNutritionForm.water} onChange={(e) => setEditNutritionForm({ ...editNutritionForm, water: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-[#999] uppercase tracking-wider font-medium mb-2 block">Calorías</label>
                  <input type="number" value={editNutritionForm.calories} onChange={(e) => setEditNutritionForm({ ...editNutritionForm, calories: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button onClick={() => setEditingNutrition(null)} className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-lg hover:bg-[#111] transition-colors">Cancelar</button>
              <button onClick={saveEditNutrition} disabled={editNutritionSaving} className="bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-lg hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editNutritionSaving ? 'Guardando...' : 'Guardar'}</button>
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
          <Zap size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Energía</h1>
          <p className="text-[#999] text-sm">Cuerpo, vitalidad y bienestar físico</p>
        </div>
      </div>

      {/* Wellness Log */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Registro de Bienestar</h2>
          <button onClick={() => setShowWellness(!showWellness)} className="text-sm text-[#c8a55a] hover:text-[#d4b468]">
            + Registrar hoy
          </button>
        </div>
        <p className="text-[#666] text-xs mb-5">Monitoriza tu estado físico y emocional</p>
        {showWellness && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 space-y-4">
            <RatingInput label="Estado de ánimo" value={wellnessForm.mood} onChange={(v) => setWellnessForm({ ...wellnessForm, mood: v })} />
            <RatingInput label="Energía" value={wellnessForm.energy} onChange={(v) => setWellnessForm({ ...wellnessForm, energy: v })} />
            <RatingInput label="Sueño" value={wellnessForm.sleep} onChange={(v) => setWellnessForm({ ...wellnessForm, sleep: v })} />
            <RatingInput label="Estrés" value={wellnessForm.stress} onChange={(v) => setWellnessForm({ ...wellnessForm, stress: v })} />
            <textarea placeholder="Notas (opcional)" value={wellnessForm.notes} onChange={(e) => setWellnessForm({ ...wellnessForm, notes: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666] h-20 resize-none" />
            <div className="flex gap-2">
              <button onClick={submitWellness} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d4b468]">Guardar</button>
              <button onClick={() => setShowWellness(false)} className="text-[#999] px-4 py-2 text-sm">Cancelar</button>
            </div>
          </div>
        )}
        {wellnessLogs.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {wellnessLogs.slice(0, 7).map((log) => (
              <div key={log.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 group hover:border-[#222] transition-colors">
                <span className="text-sm text-white">{new Date(log.date).toLocaleDateString('es')}</span>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 text-xs">
                    <span className="text-[#c8a55a]">Ánimo: {log.mood}</span>
                    <span className="text-[#c8a55a]">Energía: {log.energy}</span>
                    <span className="text-[#c8a55a]">Sueño: {log.sleep}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditWellness(log)} className="p-1 rounded hover:bg-[#c8a55a]/10 text-[#555] hover:text-[#c8a55a] transition-all" title="Editar"><Pencil size={12} /></button>
                    <button onClick={() => setPendingDeleteId({ id: log.id, type: 'wellness' })} className="p-1 rounded hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-all" title="Eliminar"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#666] text-sm text-center py-4">Registra tu primer estado del día y conoce tu bienestar</p>
        )}
      </div>

      {/* Nutrition */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Registro Nutricional</h2>
          <button onClick={() => setShowNutrition(!showNutrition)} className="text-sm text-[#c8a55a] hover:text-[#d4b468]">
            + Registrar hoy
          </button>
        </div>
        <p className="text-[#666] text-xs mb-5">Tu alimentación es la base de tu rendimiento</p>
        {showNutrition && (
          <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 mb-4 space-y-3">
            <textarea placeholder="Comidas del día" value={nutritionForm.meals} onChange={(e) => setNutritionForm({ ...nutritionForm, meals: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#666] h-20 resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[#999] mb-1 block">Vasos de agua</label>
                <input type="number" value={nutritionForm.water} onChange={(e) => setNutritionForm({ ...nutritionForm, water: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm" />
              </div>
              <div>
                <label className="text-sm text-[#999] mb-1 block">Calorías</label>
                <input type="number" value={nutritionForm.calories} onChange={(e) => setNutritionForm({ ...nutritionForm, calories: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-4 py-2 text-white text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={submitNutrition} className="bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d4b468]">Guardar</button>
              <button onClick={() => setShowNutrition(false)} className="text-[#999] px-4 py-2 text-sm">Cancelar</button>
            </div>
          </div>
        )}
        {nutrition.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {nutrition.slice(0, 7).map((log) => (
              <div key={log.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 group hover:border-[#222] transition-colors">
                <span className="text-sm text-white">{new Date(log.date).toLocaleDateString('es')}</span>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 text-xs">
                    <span className="flex items-center gap-1 text-[#c8a55a]"><Droplets size={12} /> {log.water}</span>
                    <span className="text-[#c8a55a]">{log.calories || 0} kcal</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditNutrition(log)} className="p-1 rounded hover:bg-[#c8a55a]/10 text-[#555] hover:text-[#c8a55a] transition-all" title="Editar"><Pencil size={12} /></button>
                    <button onClick={() => setPendingDeleteId({ id: log.id, type: 'nutrition' })} className="p-1 rounded hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-all" title="Eliminar"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#666] text-sm text-center py-4">Registra tu primera comida y toma control de tu nutrición</p>
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos de Expertos</h2>
          </div>
          <p className="text-[#666] text-xs mb-5">Estrategias para maximizar tu energía</p>
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
