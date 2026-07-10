'use client';

import { useEffect, useState, useCallback, memo } from 'react';
import { useApi } from '@/hooks/useApi';
import { CheckInModal } from '@/components/checkin/CheckInModal';
import { CheckinSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import ContextualHelp from '@/components/ui/ContextualHelp';
import {
  Sunrise,
  TrendingUp,
  Calendar,
  Heart,
  Zap,
  Target,
  AlertTriangle,
  Pencil,
  Trash2,
} from 'lucide-react';
import PrivacyMask from '@/components/ui/PrivacyMask';
import { getMadridDateKey, getTodayDateKey } from '@/lib/deterministic';

// ─── Types ───────────────────────────────────────────────

interface CheckinData {
  id: string;
  date: string;
  emotion: number;
  energy: number;
  focus: number;
  stress: number;
  intention: string;
  note: string | null;
  createdAt: string;
}

interface TrendsData {
  emotion: number;
  energy: number;
  focus: number;
  stress: number;
  totalDays: number;
  daily: { date: string; emotion: number; energy: number; focus: number; stress: number }[];
}

// ─── Helpers ─────────────────────────────────────────────

const METRIC_CONFIG = [
  { key: 'emotion', label: 'Emoción', icon: Heart, color: '#c8a55a' },
  { key: 'energy', label: 'Energía', icon: Zap, color: '#c8a55a' },
  { key: 'focus', label: 'Enfoque', icon: Target, color: '#c8a55a' },
  { key: 'stress', label: 'Estrés', icon: AlertTriangle, color: '#c8a55a' },
] as const;

function formatDate(dateStr: string): string {
  const checkinKey = getMadridDateKey(new Date(dateStr));
  const todayKey = getTodayDateKey();

  if (checkinKey === todayKey) return 'Hoy';

  // Calculate calendar-day difference using Madrid-normalized dates
  const [cY, cM, cD] = checkinKey.split('-').map(Number);
  const [tY, tM, tD] = todayKey.split('-').map(Number);
  const checkinDate = new Date(cY, cM - 1, cD);
  const todayDate = new Date(tY, tM - 1, tD);
  const diff = Math.round((todayDate.getTime() - checkinDate.getTime()) / 86400000);

  if (diff === 1) return 'Ayer';

  return checkinDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ─── Mini Bar Chart ──────────────────────────────────────

const MiniBarChart = memo(function MiniBarChart({ data, metricKey }: { data: TrendsData['daily']; metricKey: string }) {
  if (data.length === 0) return null;

  return (
    <div className="flex items-end gap-[3px] h-5">
      {data.slice(-14).map((d, i) => {
        const val = (d as any)[metricKey] as number;
        const pct = (val / 5) * 100;
        return (
          <div
            key={i}
            className="flex-1 h-5 rounded-sm bg-[#1a1a1a] overflow-hidden transition-all duration-300"
            title={`${val}/5`}
          >
            <div
              className="w-full bg-champagne/30 rounded-sm"
              style={{ height: `${pct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
});

// ─── Component ───────────────────────────────────────────

export default function CheckinPage() {
  const { apiFetch } = useApi();
  const [checkins, setCheckins] = useState<CheckinData[]>([]);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCheckin, setEditingCheckin] = useState<CheckinData | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Lock body scroll when delete confirmation overlay is open — save/restore scroll position
  useEffect(() => {
    if (pendingDeleteId) {
      document.body.classList.add('scroll-locked');
      return () => {
        document.body.classList.remove('scroll-locked');
      };
    }
  }, [pendingDeleteId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [todayRes, historyRes, trendsRes] = await Promise.all([
        apiFetch('/api/checkin?mode=today'),
        apiFetch('/api/checkin?mode=history&days=30'),
        apiFetch('/api/checkin?mode=trends&days=14'),
      ]);

      if (todayRes.ok) {
        const data = await todayRes.json();
        setTodayCheckin(data.today);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setCheckins(data.checkins || []);
      }

      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(data.trends || null);
      }

      // If all three fail, show error
      if (!todayRes.ok && !historyRes.ok && !trendsRes.ok) {
        setFetchError(true);
      }
    } catch (err) {
      console.error('[CHECKIN PAGE] Error:', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleModalClose = useCallback(() => {
    setShowModal(false);
    setEditingCheckin(null);
    // Only refetch if data might have changed (new/edited checkin)
    // The save handler already updates state optimistically
  }, []);

  const handleCheckinSave = useCallback(async (data: { emotion: number; energy: number; focus: number; stress: number; intention: string; note?: string }): Promise<{ xpAwarded: number }> => {
    if (editingCheckin) {
      // PUT - update existing checkin (no XP awarded on edit)
      const res = await apiFetch('/api/checkin', {
        method: 'PUT',
        body: JSON.stringify({ checkinId: editingCheckin.id, ...data }),
      });
      if (!res.ok) throw new Error(`Check-in update failed: ${res.status}`);
      const result = await res.json();
      setCheckins(prev => prev.map(c => c.id === editingCheckin.id ? result.checkin : c));
      if (todayCheckin?.id === editingCheckin.id) {
        setTodayCheckin(result.checkin);
      }
      return { xpAwarded: 0 };
    } else {
      // POST - create today's checkin
      const wasFirstCheckin = !todayCheckin;
      const res = await apiFetch('/api/checkin', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Check-in save failed: ${res.status}`);
      const result = await res.json();
      setTodayCheckin(result.checkin);
      return { xpAwarded: wasFirstCheckin ? 10 : 0 };
    }
  }, [apiFetch, editingCheckin, todayCheckin]);

  const startEditCheckin = useCallback((checkin: CheckinData) => {
    setEditingCheckin(checkin);
    setShowModal(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      const res = await apiFetch('/api/checkin', {
        method: 'DELETE',
        body: JSON.stringify({ checkinId: pendingDeleteId }),
      });
      if (res.ok) {
        setCheckins(prev => prev.filter(c => c.id !== pendingDeleteId));
        if (todayCheckin?.id === pendingDeleteId) {
          setTodayCheckin(null);
        }
      }
    } catch (error) {
      console.error('Error deleting checkin:', error);
    } finally {
      setPendingDeleteId(null);
    }
  }, [apiFetch, pendingDeleteId, todayCheckin]);

  if (loading) {
    return <CheckinSkeleton />;
  }

  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto min-h-[50vh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudieron cargar los check-ins"
          onRetry={fetchData}
          size="md"
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Modal */}
      {showModal && (
        <CheckInModal
          onClose={handleModalClose}
          initialData={editingCheckin ? { ...editingCheckin, note: editingCheckin.note ?? undefined } : todayCheckin ? { ...todayCheckin, note: todayCheckin.note ?? undefined } : null}
          onSave={handleCheckinSave}
        />
      )}

      {/* Delete Confirmation Overlay */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={() => setPendingDeleteId(null)}>
          <div className="modal-content-destructive p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar check-in</h3>
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
        storageKey="vitazen_help_checkin"
        title="Check-in"
        text="Cómo te sientes hoy: emoción, energía, enfoque y estrés."
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-7">
        <div className="flex items-center gap-2.5">
          <Sunrise size={18} className="text-champagne" />
          <h1 className="text-lg sm:text-xl font-bold text-white">Check-in Diario</h1>
        </div>
        <button
          onClick={() => { setEditingCheckin(null); setShowModal(true); }}
          className="border border-champagne/30 text-champagne font-medium px-4 py-2 rounded-lg hover:bg-champagne/8 transition-colors text-sm"
        >
          {todayCheckin ? 'Editar hoy' : 'Check-in'}
        </button>
      </div>

      {/* Today Summary */}
      {todayCheckin && (
        <div className="bg-[#0a0a0a] border border-champagne/10 rounded-lg p-3 sm:p-4 mb-5 sm:mb-7">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-lg">{todayCheckin.emotion >= 4 ? '😊' : todayCheckin.emotion >= 3 ? '😐' : '😔'}</span>
            <div>
              <p className="text-white font-medium text-xs">Tu check-in de hoy</p>
              <p className="text-champagne/80 text-xs italic">«{todayCheckin.intention}»</p>
            </div>
          </div>
          <PrivacyMask compact>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Emoción', val: todayCheckin.emotion },
                { label: 'Energía', val: todayCheckin.energy },
                { label: 'Enfoque', val: todayCheckin.focus },
                { label: 'Estrés', val: todayCheckin.stress },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-sm font-medium text-champagne/70">{item.val}<span className="text-[10px] text-[#444]">/5</span></p>
                  <p className="text-[10px] text-[#444]">{item.label}</p>
                </div>
              ))}
            </div>
          </PrivacyMask>
          {todayCheckin.note && (
            <p className="text-[11px] text-[#555] mt-2.5 border-t border-[#1a1a1a] pt-2.5">{todayCheckin.note}</p>
          )}
        </div>
      )}

      {/* Trends */}
      {trends && (
        <div className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-champagne/60" />
            <h2 className="text-base font-semibold text-white">Tendencias</h2>
            <span className="text-[11px] text-[#555]">últimos {trends.totalDays} días</span>
          </div>

          <PrivacyMask compact>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {METRIC_CONFIG.map((metric) => {
                const Icon = metric.icon;
                const val = (trends as any)[metric.key] as number;
                return (
                  <div
                    key={metric.key}
                    className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2.5 sm:p-3 hover:border-champagne/15 transition-colors touch-press"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon size={12} className="text-champagne/60" />
                      <span className="label-discrete">{metric.label}</span>
                    </div>
                    <p className="text-lg font-semibold text-white mb-1.5">{val.toFixed(1)}<span className="text-[10px] text-[#444]">/5</span></p>
                    <MiniBarChart data={trends.daily} metricKey={metric.key} />
                  </div>
                );
              })}
            </div>
          </PrivacyMask>
        </div>
      )}

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-champagne/60" />
            <h2 className="text-base font-semibold text-white">Historial</h2>
          </div>
          {checkins.length > 0 && (
            <span className="text-[11px] text-[#555] bg-[#0a0a0a] border border-[#1a1a1a] rounded-full px-2.5 py-0.5">{checkins.length} check-in{checkins.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {checkins.length === 0 ? (
        <PremiumEmptyState
          icon={Sunrise}
          title="Aún no hay check-ins"
          subtitle="Empieza cuando quieras"
          cta="Hacer check-in"
          onCta={() => { setEditingCheckin(null); setShowModal(true); }}
          size="md"
        />
        ) : (
          <div className="space-y-1.5">
            {checkins.map((c, idx) => (
              <div
                key={c.id}
                className={`bg-[#000000] border border-[#1a1a1a] rounded-lg px-3 py-3 group hover:border-[#222] transition-colors stagger-${Math.min(idx + 1, 6)}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-champagne/8 flex items-center justify-center shrink-0">
                    <span className="text-sm">{c.emotion >= 4 ? '😊' : c.emotion >= 3 ? '😐' : '😔'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#888]">{formatDate(c.date)}</span>
                      <span className="text-champagne/70 text-[11px] font-medium truncate">«{c.intention}»</span>
                    </div>
                    <PrivacyMask compact>
                      <div className="flex gap-3 mt-0.5">
                        {[
                          { label: 'Emoción', val: c.emotion },
                          { label: 'Energía', val: c.energy },
                          { label: 'Enfoque', val: c.focus },
                          { label: 'Estrés', val: c.stress },
                        ].map((item) => (
                          <span key={item.label} className="text-[10px] text-[#444]">
                            {item.label} <span className="text-champagne/60">{item.val}</span>
                          </span>
                        ))}
                      </div>
                    </PrivacyMask>
                    {c.note && <p className="text-[10px] text-[#3a3a3a] mt-0.5 truncate">{c.note}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => startEditCheckin(c)} className="p-2 rounded-lg hover:bg-champagne/8 text-[#444] hover:text-champagne transition-all touch-press-sm" title="Editar">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setPendingDeleteId(c.id)} className="p-2 rounded-lg hover:bg-red-500/8 text-[#444] hover:text-red-400 transition-all touch-press-sm" title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
