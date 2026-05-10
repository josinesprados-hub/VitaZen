'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Brain, Play, Pause, Clock, ChevronDown, ChevronUp, Wind, Trash2, Calendar, Timer, CheckCircle, Pencil } from 'lucide-react';
import EmpireTipsSection from '@/components/ui/EmpireTipsSection';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { EmpireSkeleton } from '@/components/ui/PremiumSkeleton';
import { MicroReward } from '@/components/ui/MicroReward';

interface Meditation {
  id: string;
  duration: number;
  type: string;
  completedAt: string;
}

const BREATHING_TECHNIQUES = [
  {
    type: 'diaphragmatic',
    label: 'Diafragmática',
    subtitle: 'Respiración abdominal',
    duration: 5,
    what: 'Respiración profunda que expande el abdomen en lugar del pecho, activando el diafragma.',
    how: 'Inhala por la nariz (~4 s) expandiendo el abdomen. Pausa breve. Exhala lento (~5–6 s). El pecho se mueve poco.',
    benefits: 'Reduce estrés y ansiedad al activar el sistema parasimpático. Disminuye cortisol y frecuencia cardíaca. Mejora la oxigenación.',
  },
  {
    type: 'coherence',
    label: 'Coherencia Cardíaca',
    subtitle: 'Respiración lenta',
    duration: 5,
    what: 'Respiración a ritmo constante que sincroniza el sistema respiratorio con el cardiovascular.',
    how: 'Inhala 5 s → Exhala 5 s. Ritmo constante de ~6 respiraciones por minuto.',
    benefits: 'Aumenta la variabilidad de la frecuencia cardíaca (HRV). Mejora la regulación emocional y reduce la ansiedad. Sincroniza respiración y sistema cardiovascular.',
  },
  {
    type: 'mindfulness',
    label: 'Atención Plena',
    subtitle: 'Mindfulness',
    duration: 10,
    what: 'Observación consciente de la respiración sin modificarla, solo atender al flujo natural del aire.',
    how: 'Respira de forma natural. Observa la sensación en la nariz, pecho o abdomen. No la modifiques, solo atiéndela.',
    benefits: 'Reduce ansiedad, depresión y estrés. Mejora la atención y la regulación emocional.',
  },
  {
    type: 'nadi_shodhana',
    label: 'Nadi Shodhana',
    subtitle: 'Respiración alterna',
    duration: 5,
    what: 'Técnica yogui de respiración alternada por las fosas nasales que equilibra los hemisferios cerebrales.',
    how: 'Tapa una fosa nasal e inhala por la otra. Cambia y exhala por la contraria. Alterna de forma rítmica.',
    benefits: 'Reduce estrés y frecuencia cardíaca. Mejora funciones cognitivas y la atención.',
  },
  {
    type: 'box',
    label: 'Box Breathing',
    subtitle: 'Respiración cuadrada',
    duration: 5,
    what: 'Patrón simétrico de cuatro fases iguales que regula el sistema nervioso autónomo de forma controlada.',
    how: 'Inhala 4 s → Mantén 4 s → Exhala 4 s → Mantén 4 s. Repite el ciclo.',
    benefits: 'Mejora el control del estrés agudo. Aumenta la concentración y la claridad mental.',
  },
];

export default function MentePage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Meditation[]>([]);
  const [meditating, setMeditating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timer, setTimer] = useState(0);
  const [selectedType, setSelectedType] = useState(BREATHING_TECHNIQUES[0]);
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completedSession, setCompletedSession] = useState<{ duration: number; type: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<Meditation | null>(null);
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editType, setEditType] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Lock body scroll when modal is open — save/restore scroll position
  useEffect(() => {
    if (pendingDeleteId) {
      const scrollY = window.scrollY;
      document.body.classList.add('scroll-locked');
      document.body.style.top = `-${scrollY}px`;
      return () => {
        document.body.classList.remove('scroll-locked');
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [pendingDeleteId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [medRes] = await Promise.all([
        apiFetch('/api/meditation'),
      ]);
      if (medRes.ok) { const d = await medRes.json(); setSessions(d.sessions); }
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

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (meditating && !paused) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [meditating, paused]);

  const startMeditation = (type: typeof BREATHING_TECHNIQUES[0]) => {
    setSelectedType(type);
    setTimer(0);
    setPaused(false);
    setMeditating(true);
  };

  const endMeditation = async () => {
    setMeditating(false);
    setPaused(false);
    const duration = Math.max(1, Math.floor(timer / 60));
    const type = selectedType.type;
    setCompletedSession({ duration, type });
    try {
      const res = await apiFetch('/api/meditation', {
        method: 'POST',
        body: JSON.stringify({ duration, type }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(prev => [data.session, ...prev]);
      }
    } catch (error) {
      console.error('Error saving meditation:', error);
    }
    setTimer(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleTechnique = (type: string) => {
    setExpandedTechnique(prev => prev === type ? null : type);
  };

  const startEdit = (session: Meditation) => {
    setEditingSession(session);
    setEditDuration(session.duration);
    setEditType(session.type);
  };

  const saveEdit = async () => {
    if (!editingSession) return;
    setEditSaving(true);
    try {
      const res = await apiFetch('/api/meditation', {
        method: 'PUT',
        body: JSON.stringify({ sessionId: editingSession.id, duration: editDuration, type: editType }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(prev => prev.map(s => s.id === editingSession.id ? data.session : s));
        setEditingSession(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Meditation PUT failed:', res.status, errData);
      }
    } catch (error) {
      console.error('Error updating session:', error);
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const res = await apiFetch('/api/meditation', {
        method: 'DELETE',
        body: JSON.stringify({ sessionId: pendingDeleteId }),
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== pendingDeleteId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Meditation DELETE failed:', res.status, errData);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    } finally {
      setPendingDeleteId(null);
    }
  };

  if (loading) {
    return <EmpireSkeleton message="Preparando tu espacio de calma..." />;
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
      {/* Completion Overlay */}
      {completedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4"
          onClick={() => setCompletedSession(null)}
        >
          <div
            className="modal-content p-10 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Sesión completada</h3>
            <p className="text-[#c8a55a] text-sm font-medium capitalize mb-4">{completedSession.type.replace('_', ' ')}</p>
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-1.5 text-xs text-[#999]">
                <Timer size={13} />
                <span>{completedSession.duration} min</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#999]">
                <Wind size={13} />
                <span className="capitalize">{completedSession.type.replace('_', ' ')}</span>
              </div>
            </div>
            <button
              onClick={() => setCompletedSession(null)}
              className="bg-[#c8a55a] text-black font-semibold px-8 py-3 rounded-xl hover:bg-[#d4b468] transition-colors touch-press"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Edit Session Overlay */}
      {editingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4"
          onClick={() => setEditingSession(null)}
        >
          <div
            className="modal-content p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-5">
              <Pencil size={20} className="text-[#c8a55a]" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-6">Editar sesión</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#999] uppercase tracking-wider font-medium mb-2">Duración (min)</label>
                <input
                  type="number"
                  min={1}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-[#999] uppercase tracking-wider font-medium mb-2">Tipo de respiración</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:border-[#c8a55a]/50 transition-colors appearance-none"
                >
                  {BREATHING_TECHNIQUES.map((tech) => (
                    <option key={tech.type} value={tech.type}>{tech.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-7">
              <button
                onClick={() => setEditingSession(null)}
                className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="bg-[#c8a55a] text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {pendingDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="modal-content-destructive p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar sesión</h3>
            <p className="text-[#999] text-sm mb-6">Esta acción no se puede deshacer</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="bg-[#000000] border border-[#333] text-[#999] font-medium px-5 py-2.5 rounded-xl hover:bg-[#111] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="bg-red-500/90 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-red-500 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Brain size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Mente</h1>
          <p className="text-[#999] text-sm">Calma interior, claridad mental y respiración consciente</p>
        </div>
      </div>

      {/* Meditation Timer */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-1">
        <div className="flex items-center gap-3 mb-5">
          <Wind size={20} className="text-[#c8a55a]" />
          <div>
            <h2 className="text-lg font-semibold text-white">Sesión de Respiración</h2>
            <p className="text-[#666] text-xs mt-0.5">Elige una técnica y practica</p>
          </div>
        </div>
        
        {meditating ? (
          <div className={`text-center py-10 ${!paused ? 'breathing-ring' : ''}`}>
            <p className="text-xs text-[#c8a55a] uppercase tracking-widest mb-2">{selectedType.label}</p>
            <p className={`text-5xl font-bold mb-1 font-mono transition-opacity duration-300 ${paused ? 'text-[#c8a55a]/40' : 'text-[#c8a55a]'}`}>{formatTime(timer)}</p>
            {paused && <p className="text-[#c8a55a]/60 text-xs uppercase tracking-widest mb-1">En pausa</p>}
            <p className="text-[#666] text-sm mb-8">Objetivo: {selectedType.duration} min</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPaused(!paused)}
                className="flex items-center gap-2 bg-[#000000] border border-[#c8a55a]/30 text-[#c8a55a] font-semibold px-6 py-3 rounded-xl hover:bg-[#c8a55a]/10 transition-colors"
              >
                {paused ? <><Play size={16} /> Continuar</> : <><Pause size={16} /> Pausar</>}
              </button>
              <button
                onClick={endMeditation}
                className="bg-[#c8a55a] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#d4b468] transition-colors"
              >
                Finalizar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BREATHING_TECHNIQUES.map((tech) => (
              <button
                key={tech.type}
                onClick={() => startMeditation(tech)}
                className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 text-left hover:border-[#c8a55a]/50 transition-all group touch-press"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-white text-sm font-medium group-hover:text-[#c8a55a] transition-colors">{tech.label}</p>
                  <Play size={14} className="text-[#c8a55a] shrink-0" />
                </div>
                <p className="text-[#666] text-xs">{tech.subtitle} · {tech.duration} min</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Breathing Techniques Guide */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-2">
        <div className="flex items-center gap-3 mb-5">
          <Wind size={20} className="text-[#c8a55a]" />
          <div>
            <h2 className="text-lg font-semibold text-white">Guía de Técnicas</h2>
            <p className="text-[#666] text-xs mt-0.5">Conoce cada técnica antes de practicar</p>
          </div>
        </div>

        <div className="space-y-3">
          {BREATHING_TECHNIQUES.map((tech) => {
            const isExpanded = expandedTechnique === tech.type;
            return (
              <div
                key={tech.type}
                className="bg-[#000000] border border-[#1a1a1a] rounded-lg overflow-hidden transition-all"
              >
                {/* Collapsed header */}
                <button
                  onClick={() => toggleTechnique(tech.type)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#0a0a0a]/50 transition-colors"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{tech.label}</p>
                    <p className="text-[#666] text-xs mt-0.5">{tech.subtitle}</p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-[#c8a55a] shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-[#666] shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[#1a1a1a] pt-3">
                    <div>
                      <p className="text-[#c8a55a] text-xs uppercase tracking-wider font-semibold mb-1">Qué es</p>
                      <p className="text-[#ccc] text-sm leading-relaxed">{tech.what}</p>
                    </div>
                    <div>
                      <p className="text-[#c8a55a] text-xs uppercase tracking-wider font-semibold mb-1">Cómo practicarla</p>
                      <p className="text-[#ccc] text-sm leading-relaxed">{tech.how}</p>
                    </div>
                    <div>
                      <p className="text-[#c8a55a] text-xs uppercase tracking-wider font-semibold mb-1">Beneficios</p>
                      <p className="text-[#ccc] text-sm leading-relaxed">{tech.benefits}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Session History */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-3">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-[#c8a55a]" />
            <div>
              <h2 className="text-lg font-semibold text-white">Historial de Sesiones</h2>
              <p className="text-[#666] text-xs mt-0.5">Tu evolución en la práctica</p>
            </div>
          </div>
          {sessions.length > 0 && (
            <span className="text-xs text-[#666] bg-[#000000] border border-[#1a1a1a] rounded-full px-3 py-1">{sessions.length} sesión{sessions.length !== 1 ? 'es' : ''}</span>
          )}
        </div>

        {sessions.length === 0 ? (
          <PremiumEmptyState
            icon={Wind}
            title="Tu espacio de calma te espera"
            subtitle="Una sola respiración consciente marca la diferencia."
            size="sm"
            variant="gold"
          />
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {sessions.map((session) => {
              const tech = BREATHING_TECHNIQUES.find(t => t.type === session.type);
              return (
                <div key={session.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 group hover:border-[#222] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center shrink-0">
                      <Wind size={16} className="text-[#c8a55a]" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{tech?.label ?? session.type.replace('_', ' ')}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-[#999]"><Timer size={11} />{session.duration} min</span>
                        <span className="text-[#333] text-xs">·</span>
                        <span className="flex items-center gap-1 text-xs text-[#999]"><Calendar size={11} />{new Date(session.completedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span className="text-[#333] text-xs">·</span>
                        <span className="flex items-center gap-1 text-xs text-[#999]"><Clock size={11} />{new Date(session.completedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(session)}
                      className="p-2.5 rounded-lg hover:bg-[#c8a55a]/10 text-[#888] hover:text-[#c8a55a] transition-all touch-press"
                      title="Editar sesión"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(session.id)}
                      className="p-2.5 rounded-lg hover:bg-red-500/10 text-[#888] hover:text-red-400 transition-all touch-press"
                      title="Eliminar sesión"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tips */}
      <EmpireTipsSection empire="mente" subtitle="Técnicas para tu bienestar mental" />
      {/* Micro-reward for meditation completion */}
      <MicroReward trigger={completedSession !== null} message="Sesión completada" />
    </div>
  );
}
