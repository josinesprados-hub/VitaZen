'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Brain, Play, Pause, Clock, Wind, Trash2, Calendar, Timer, CheckCircle, Pencil, ArrowLeft, ChevronRight } from 'lucide-react';
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

interface BreathingPhase {
  label: string;
  seconds: number;
}

interface BreathingTechnique {
  type: string;
  label: string;
  subtitle: string;
  duration: number;
  what: string;
  steps: string[];
  benefitsList: string[];
  recommendation: string;
  phases: BreathingPhase[];
}

const BREATHING_TECHNIQUES: BreathingTechnique[] = [
  {
    type: 'diaphragmatic',
    label: 'Diafragmática',
    subtitle: 'Respiración abdominal',
    duration: 5,
    what: 'Respiración profunda que expande el abdomen en lugar del pecho, activando el diafragma para una oxigenación más eficiente y una respuesta de calma inmediata.',
    steps: [
      'Siéntate cómodamente o túmbate. Coloca una mano en el pecho y otra en el abdomen.',
      'Inhala lentamente por la nariz (~4 s), sintiendo cómo el abdomen se expande bajo tu mano.',
      'Haz una pausa breve al final de la inhalación.',
      'Exhala de forma lenta y controlada (~5-6 s), vaciando el abdomen primero.',
    ],
    benefitsList: [
      'Activa el sistema parasimpático',
      'Reduce cortisol y frecuencia cardíaca',
      'Disminuye ansiedad y estrés',
      'Mejora la oxigenación sanguínea',
    ],
    recommendation: 'Ideal antes de dormir',
    phases: [
      { label: 'Inhala', seconds: 4 },
      { label: 'Exhala', seconds: 6 },
    ],
  },
  {
    type: 'coherence',
    label: 'Coherencia Cardíaca',
    subtitle: 'Respiración lenta',
    duration: 5,
    what: 'Respiración rítmica que sincroniza el sistema respiratorio con el cardiovascular, creando un estado de coherencia fisiológica óptima.',
    steps: [
      'Siéntate con la espalda recta y los pies apoyados en el suelo.',
      'Inhala durante 5 segundos de forma suave y continua.',
      'Exhala durante 5 segundos al mismo ritmo, sin pausas.',
      'Mantén este patrón constante de ~6 respiraciones por minuto.',
    ],
    benefitsList: [
      'Aumenta la variabilidad cardíaca (HRV)',
      'Mejora la regulación emocional',
      'Reduce la ansiedad',
      'Sincroniza respiración y cardiovascular',
    ],
    recommendation: 'Perfecta para empezar el día',
    phases: [
      { label: 'Inhala', seconds: 5 },
      { label: 'Exhala', seconds: 5 },
    ],
  },
  {
    type: 'mindfulness',
    label: 'Atención Plena',
    subtitle: 'Mindfulness',
    duration: 10,
    what: 'Observación consciente de la respiración sin modificarla, simplemente atendiendo al flujo natural del aire como ancla al momento presente.',
    steps: [
      'Cierra los ojos y respira de forma natural, sin forzar ningún ritmo.',
      'Dirige tu atención a la sensación del aire entrando y saliendo por la nariz.',
      'Cuando la mente divague, reconócelo suavemente y vuelve a la respiración.',
      'No juzgues ni modifiques la respiración. Solo observa.',
    ],
    benefitsList: [
      'Reduce ansiedad y depresión',
      'Mejora la atención sostenida',
      'Favorece la regulación emocional',
      'Cultiva la presencia mental',
    ],
    recommendation: 'Ideal para pausas conscientes',
    phases: [
      { label: 'Natural', seconds: 0 },
    ],
  },
  {
    type: 'nadi_shodhana',
    label: 'Nadi Shodhana',
    subtitle: 'Respiración alterna',
    duration: 5,
    what: 'Técnica yogui milenaria de respiración alternada por las fosas nasales que equilibra los canales energéticos y los hemisferios cerebrales.',
    steps: [
      'Usa el dedo pulgar derecho para tapar la fosa nasal derecha.',
      'Inhala por la fosa nasal izquierda (~4 s).',
      'Tapa la izquierda con el anular, destapa la derecha y exhala (~4 s).',
      'Inhala por la derecha, tapa, y exhala por la izquierda. Esto es un ciclo completo.',
    ],
    benefitsList: [
      'Equilibra los hemisferios cerebrales',
      'Reduce frecuencia cardíaca y estrés',
      'Mejora funciones cognitivas',
      'Favorece la claridad mental',
    ],
    recommendation: 'Perfecta para estrés',
    phases: [
      { label: 'Inhala izq.', seconds: 4 },
      { label: 'Exhala der.', seconds: 4 },
    ],
  },
  {
    type: 'box',
    label: 'Box Breathing',
    subtitle: 'Respiración cuadrada',
    duration: 5,
    what: 'Patrón simétrico de cuatro fases iguales utilizado por Navy SEALs y astronautas para regular el sistema nervioso bajo presión.',
    steps: [
      'Inhala lentamente por la nariz contando hasta 4.',
      'Mantén la respiración contando hasta 4 (retención a pulmones llenos).',
      'Exhala lentamente por la nariz contando hasta 4.',
      'Mantén los pulmones vacíos contando hasta 4. Repite el ciclo.',
    ],
    benefitsList: [
      'Control del estrés agudo',
      'Aumenta concentración y claridad',
      'Regula el sistema nervioso autónomo',
      'Utilizado por élites militares',
    ],
    recommendation: 'Rápida para recuperar foco',
    phases: [
      { label: 'Inhala', seconds: 4 },
      { label: 'Mantén', seconds: 4 },
      { label: 'Exhala', seconds: 4 },
      { label: 'Mantén', seconds: 4 },
    ],
  },
];

/* ─── Breathing Pattern Visualizer ─── */
function PatternFlow({ phases }: { phases: BreathingPhase[] }) {
  const activePhases = phases.filter(p => p.seconds > 0);
  const isNatural = activePhases.length === 0;

  if (isNatural) {
    return (
      <div className="flex items-center justify-center gap-3 py-3">
        <div className="w-12 h-12 rounded-full border border-[#c8a55a]/30 flex items-center justify-center">
          <Wind size={18} className="text-[#c8a55a]" />
        </div>
        <div>
          <p className="text-[#c8a55a] text-sm font-medium">Ritmo natural</p>
          <p className="text-[#666] text-xs">Sin patrón fijo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5 py-3 overflow-x-auto">
      {activePhases.map((phase, i) => (
        <div key={i} className="flex items-center gap-1.5 shrink-0">
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full border flex items-center justify-center ${
              phase.label.includes('Mantén')
                ? 'border-[#c8a55a]/35 bg-[#c8a55a]/8'
                : 'border-[#c8a55a]/50 bg-[#c8a55a]/12'
            }`}>
              <span className="text-[#c8a55a] text-xs font-semibold">{phase.seconds}s</span>
            </div>
            <span className="text-[10px] text-[#666] mt-1.5 whitespace-nowrap">{phase.label}</span>
          </div>
          {i < activePhases.length - 1 && (
            <div className="w-4 h-px bg-[#333] mb-5 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function MentePage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Meditation[]>([]);
  const [meditating, setMeditating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timer, setTimer] = useState(0);
  const [selectedType, setSelectedType] = useState(BREATHING_TECHNIQUES[0]);
  const [viewingGuide, setViewingGuide] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completedSession, setCompletedSession] = useState<{ duration: number; type: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<Meditation | null>(null);
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editType, setEditType] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Ref for auto-scrolling into view when meditation starts
  const breathingSectionRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when any modal is open — save/restore scroll position
  useEffect(() => {
    const anyOverlayOpen = !!(pendingDeleteId || completedSession || editingSession);
    if (anyOverlayOpen) {
      const scrollY = window.scrollY;
      document.body.classList.add('scroll-locked');
      document.body.style.top = `-${scrollY}px`;
      return () => {
        document.body.classList.remove('scroll-locked');
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [pendingDeleteId, completedSession, editingSession]);

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

  const startMeditation = (type: BreathingTechnique) => {
    setSelectedType(type);
    setTimer(0);
    setPaused(false);
    setMeditating(true);
    // Scroll to breathing section after render — requestAnimationFrame ensures
    // the DOM has updated (guide unmounted, timer mounted) before scrolling
    requestAnimationFrame(() => {
      breathingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  const guideTechnique = viewingGuide
    ? BREATHING_TECHNIQUES.find(t => t.type === viewingGuide)
    : null;

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
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* ─── Completion Overlay ─── */}
      {completedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center breathing-complete-backdrop p-4"
          onClick={() => setCompletedSession(null)}
        >
          <div
            className="breathing-complete-content p-10 max-w-md w-full"
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

      {/* ─── Edit Session Overlay ─── */}
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

      {/* ─── Delete Confirmation Overlay ─── */}
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

      {/* ─── Header ─── */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Brain size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Imperio Mente</h1>
          <p className="text-[#999] text-sm">Calma interior, claridad mental y respiración consciente</p>
        </div>
      </div>

      {/* ─── Breathing Section ─── */}
      <div ref={breathingSectionRef} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-1">
        <div className="flex items-center gap-3 mb-5">
          <Wind size={20} className="text-[#c8a55a]" />
          <div>
            <h2 className="text-lg font-semibold text-white">Sesión de Respiración</h2>
            <p className="text-[#666] text-xs mt-0.5">Elige una técnica y practica</p>
          </div>
        </div>

        {/* ── Active Timer ── */}
        {meditating && (
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
        )}

        {/* ── Technique Guide Detail ── */}
        {!meditating && guideTechnique && (
          <div>
            {/* Back to techniques */}
            <button
              onClick={() => setViewingGuide(null)}
              className="flex items-center gap-2 text-[#666] text-sm hover:text-[#c8a55a] transition-colors mb-5"
            >
              <ArrowLeft size={15} />
              <span>Técnicas</span>
            </button>

            {/* Technique header */}
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center mx-auto mb-3">
                <Wind size={24} className="text-[#c8a55a]" />
              </div>
              <h3 className="text-xl font-bold text-white">{guideTechnique.label}</h3>
              <p className="text-[#666] text-sm mt-1">{guideTechnique.subtitle} · {guideTechnique.duration} min</p>
            </div>

            {/* Breathing pattern */}
            <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 mb-5">
              <PatternFlow phases={guideTechnique.phases} />
            </div>

            {/* Sections */}
            <div className="space-y-5">
              {/* Qué es */}
              <div>
                <p className="text-[#c8a55a] text-[10px] uppercase tracking-[2px] font-semibold mb-2">Qué es</p>
                <p className="text-[#aaa] text-sm leading-relaxed">{guideTechnique.what}</p>
              </div>

              {/* Cómo practicarla */}
              <div>
                <p className="text-[#c8a55a] text-[10px] uppercase tracking-[2px] font-semibold mb-3">Cómo practicarla</p>
                <div className="space-y-2.5">
                  {guideTechnique.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full border border-[#c8a55a]/40 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[#c8a55a] text-[10px] font-semibold">{i + 1}</span>
                      </div>
                      <p className="text-[#aaa] text-sm leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Beneficios */}
              <div>
                <p className="text-[#c8a55a] text-[10px] uppercase tracking-[2px] font-semibold mb-3">Beneficios</p>
                <div className="space-y-2">
                  {guideTechnique.benefitsList.map((benefit, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8a55a] shrink-0" />
                      <p className="text-[#aaa] text-sm">{benefit}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recomendación */}
              <div>
                <div className="inline-flex items-center gap-2.5 bg-[#c8a55a]/8 border border-[#c8a55a]/20 rounded-lg px-3.5 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#c8a55a] shrink-0" />
                  <p className="text-[#c8a55a] text-xs font-medium">{guideTechnique.recommendation}</p>
                </div>
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={() => {
                startMeditation(guideTechnique);
                setViewingGuide(null);
              }}
              className="flex items-center justify-center gap-2 w-full bg-[#c8a55a] text-black font-semibold px-6 py-3.5 rounded-xl hover:bg-[#d4b468] transition-colors mt-6 touch-press"
            >
              <Play size={16} />
              Comenzar sesión
            </button>
          </div>
        )}

        {/* ── Technique Card Grid ── */}
        {!meditating && !viewingGuide && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BREATHING_TECHNIQUES.map((tech) => (
              <button
                key={tech.type}
                onClick={() => setViewingGuide(tech.type)}
                className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 text-left hover:border-[#c8a55a]/50 transition-all group touch-press"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-white text-sm font-medium group-hover:text-[#c8a55a] transition-colors">{tech.label}</p>
                  <ChevronRight size={14} className="text-[#555] group-hover:text-[#c8a55a] transition-colors shrink-0" />
                </div>
                <p className="text-[#666] text-xs mb-2.5">{tech.subtitle} · {tech.duration} min</p>
                <div className="inline-flex items-center gap-1.5 bg-[#c8a55a]/8 border border-[#c8a55a]/20 rounded px-2 py-0.5">
                  <div className="w-1 h-1 rounded-full bg-[#c8a55a]" />
                  <p className="text-[#c8a55a] text-[10px]">{tech.recommendation}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Session History ─── */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 section-enter-2">
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
          <div className="space-y-1.5 max-h-72 sm:max-h-80 overflow-y-auto pr-1">
            {sessions.map((session) => {
              const tech = BREATHING_TECHNIQUES.find(t => t.type === session.type);
              return (
                <div key={session.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 group hover:border-[#222] transition-colors">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center shrink-0">
                      <Wind size={16} className="text-[#c8a55a]" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{tech?.label ?? session.type.replace('_', ' ')}</p>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-[#999]"><Timer size={11} />{session.duration} min</span>
                        <span className="text-[#333] text-xs">·</span>
                        <span className="flex items-center gap-1 text-xs text-[#999]"><Calendar size={11} />{new Date(session.completedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span className="text-[#333] text-xs">·</span>
                        <span className="flex items-center gap-1 text-xs text-[#999]"><Clock size={11} />{new Date(session.completedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(session)}
                      className="p-2 rounded-lg hover:bg-[#c8a55a]/10 text-[#666] hover:text-[#c8a55a] transition-all touch-press"
                      title="Editar sesión"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(session.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-[#666] hover:text-red-400 transition-all touch-press"
                      title="Eliminar sesión"
                    >
                      <Trash2 size={14} />
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
