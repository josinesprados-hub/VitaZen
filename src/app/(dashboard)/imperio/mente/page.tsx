'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Brain, Play, Clock, MessageCircle, Lightbulb, ChevronDown, ChevronUp, Wind } from 'lucide-react';
import Link from 'next/link';
import PremiumBlur from '@/components/ui/PremiumBlur';

interface Meditation {
  id: string;
  duration: number;
  type: string;
  completedAt: string;
}

interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
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
  const isPremium = user?.plan === 'PREMIUM';
  const [sessions, setSessions] = useState<Meditation[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [meditating, setMeditating] = useState(false);
  const [timer, setTimer] = useState(0);
  const [selectedType, setSelectedType] = useState(BREATHING_TECHNIQUES[0]);
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [medRes, tipsRes] = await Promise.all([
          apiFetch('/api/meditation'),
          apiFetch('/api/empire/tips?empire=mente'),
        ]);
        if (medRes.ok) { const d = await medRes.json(); setSessions(d.sessions); }
        if (tipsRes.ok) { const d = await tipsRes.json(); setTips(d.tips); }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (meditating) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [meditating]);

  const startMeditation = (type: typeof BREATHING_TECHNIQUES[0]) => {
    setSelectedType(type);
    setTimer(0);
    setMeditating(true);
  };

  const endMeditation = async () => {
    setMeditating(false);
    const duration = Math.max(1, Math.floor(timer / 60));
    const res = await apiFetch('/api/meditation', {
      method: 'POST',
      body: JSON.stringify({ duration, type: selectedType.type }),
    });
    if (res.ok) {
      const data = await res.json();
      setSessions([data.session, ...sessions]);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Brain size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
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

      {/* AI Mentor CTA */}
      <Link
        href="/imperio/mentor"
        className="flex items-center gap-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/30 transition-all group"
      >
        <div className="w-11 h-11 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
          <MessageCircle size={22} className="text-[#c8a55a]" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white group-hover:text-[#c8a55a] transition-colors">Mentor IA</h3>
          <p className="text-sm text-[#999]">Tu coach personal disponible 24/7</p>
        </div>
        <span className="text-[#c8a55a] text-sm font-medium">Abrir →</span>
      </Link>

      {/* Meditation Timer */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
        <div className="flex items-center gap-3 mb-5">
          <Wind size={20} className="text-[#c8a55a]" />
          <div>
            <h2 className="text-lg font-semibold text-white">Sesión de Respiración</h2>
            <p className="text-[#666] text-xs mt-0.5">Elige una técnica y practica</p>
          </div>
        </div>
        
        {meditating ? (
          <div className="text-center py-10">
            <p className="text-xs text-[#c8a55a] uppercase tracking-widest mb-2">{selectedType.label}</p>
            <p className="text-5xl font-bold text-[#c8a55a] mb-1 font-mono">{formatTime(timer)}</p>
            <p className="text-[#666] text-sm mb-8">Objetivo: {selectedType.duration} min</p>
            <button
              onClick={endMeditation}
              className="bg-[#c8a55a] text-black font-semibold px-8 py-3 rounded-lg hover:bg-[#d4b468] transition-colors"
            >
              Finalizar sesión
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BREATHING_TECHNIQUES.map((tech) => (
              <button
                key={tech.type}
                onClick={() => startMeditation(tech)}
                className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 text-left hover:border-[#c8a55a]/50 transition-all group"
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
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
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

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Historial de Sesiones</h2>
            <p className="text-[#666] text-xs mt-0.5">Tu evolución en la práctica</p>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sessions.slice(0, 10).map((session) => (
              <div key={session.id} className="flex items-center justify-between bg-[#000000] border border-[#1a1a1a] rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Clock size={16} className="text-[#c8a55a]" />
                  <span className="text-sm text-white capitalize">{session.type.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#999]">
                  <span>{session.duration} min</span>
                  <span>{new Date(session.completedAt).toLocaleDateString('es')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {tips.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos de Expertos</h2>
          </div>
          <p className="text-[#666] text-xs mb-5">Técnicas para tu bienestar mental</p>
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
