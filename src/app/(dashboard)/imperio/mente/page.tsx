'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Brain, Play, Clock, MessageCircle, Lightbulb } from 'lucide-react';
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

const MEDITATION_TYPES = [
  { type: 'guided', label: 'Guiada', duration: 10 },
  { type: 'breathing', label: 'Respiración', duration: 5 },
  { type: 'body_scan', label: 'Escaneo corporal', duration: 15 },
  { type: 'mindfulness', label: 'Atención plena', duration: 10 },
];

export default function MentePage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';
  const [sessions, setSessions] = useState<Meditation[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [meditating, setMeditating] = useState(false);
  const [timer, setTimer] = useState(0);
  const [selectedType, setSelectedType] = useState(MEDITATION_TYPES[0]);
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

  const startMeditation = (type: typeof MEDITATION_TYPES[0]) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Brain size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Brain size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Imperio Mente</h1>
          <p className="text-[#999] text-sm">Meditación, mentor IA y bienestar mental</p>
        </div>
      </div>

      {/* AI Mentor CTA */}
      <Link
        href="/imperio/mente/mentor"
        className="flex items-center gap-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6 hover:border-[#c8a55a]/30 transition-all group"
      >
        <div className="w-12 h-12 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
          <MessageCircle size={24} className="text-[#c8a55a]" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white group-hover:text-[#c8a55a] transition-colors">Mentor IA Personal</h3>
          <p className="text-sm text-[#999]">Tu coach de desarrollo personal disponible 24/7</p>
        </div>
        <span className="text-[#c8a55a] text-sm">Abrir →</span>
      </Link>

      {/* Meditation Timer */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Meditación</h2>
        
        {meditating ? (
          <div className="text-center py-8">
            <p className="text-5xl font-bold text-[#c8a55a] mb-2 font-mono">{formatTime(timer)}</p>
            <p className="text-[#999] mb-6">{selectedType.label} — Objetivo: {selectedType.duration} min</p>
            <button
              onClick={endMeditation}
              className="bg-[#c8a55a] text-black font-semibold px-8 py-3 rounded-lg hover:bg-[#d4b468] transition-colors"
            >
              Finalizar meditación
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MEDITATION_TYPES.map((med) => (
              <button
                key={med.type}
                onClick={() => startMeditation(med)}
                className="bg-[#000000] border border-[#1a1a1a] rounded-lg p-4 text-center hover:border-[#c8a55a]/50 transition-colors"
              >
                <Play size={24} className="text-[#c8a55a] mx-auto mb-2" />
                <p className="text-white text-sm font-medium">{med.label}</p>
                <p className="text-[#666] text-xs">{med.duration} min</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Sesiones recientes</h2>
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
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Consejos</h2>
          </div>
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
