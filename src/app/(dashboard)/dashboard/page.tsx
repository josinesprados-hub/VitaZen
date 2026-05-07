'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { CheckInModal } from '@/components/checkin/CheckInModal';
import { EmotionalHero } from '@/components/dashboard/EmotionalHero';
import { OnboardingRecommendations } from '@/components/dashboard/OnboardingRecommendations';
import { WeeklyRecap } from '@/components/dashboard/WeeklyRecap';
import { DashboardSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { Shield, Brain, Zap, Gem, TrendingUp, Trophy, Flame, Star, Wind, BookOpen, CheckCircle, Wallet, Target, Crown, Lock, Sunrise, Sparkles, ArrowRight } from 'lucide-react';

const FRASES = [
  'La disciplina es el puente entre tus metas y tus logros.',
  'Cada mañana es una nueva oportunidad para reinventarte.',
  'El cambio no llega por suerte, llega por decisión.',
  'Tu mente es tu activo más poderoso. Entrénala.',
  'No necesitas motivación, necesitas compromiso.',
  'La excelencia no es un acto, es un hábito constante.',
  'Lo que hoy parece difícil, mañana será tu rutina.',
  'El progreso silencioso siempre supera al ruido de las excusas.',
  'Tu futuro se construye con las decisiones de hoy.',
  'La incomodidad es el precio del crecimiento.',
  'No esperes el momento perfecto. Crea el momento.',
  'Cada paso cuenta, incluso el más pequeño.',
  'La consistencia vence al talento cuando el talento no es consistente.',
  'Tu transformación comienza al otro lado de tu zona de confort.',
  'Las palabras que te dices a ti mismo definen tu realidad.',
  'La fuerza no viene de la capacidad, viene de la determinación.',
  'El éxito es la suma de pequeños esfuerzos repetidos cada día.',
  'No eres lo que piensan de ti, eres lo que decides ser.',
  'La verdadera libertad nace de la autodisciplina.',
  'Cada día sin progreso es un día perdido.',
  'Tu energía fluye hacia donde va tu atención.',
  'Los obstáculos son caminos disfrazados.',
  'La paciencia y la persistencia convierten lo imposible en inevitable.',
  'No te compares con otros, compárate con quien fuiste ayer.',
  'La claridad de propósito genera poder de acción.',
  'El dolor de la disciplina pesa gramos; el arrepentimiento pesa toneladas.',
  'Tu vida cambia cuando tus hábitos cambian.',
  'Las personas extraordinarias hacen lo que las ordinarias no están dispuestas a hacer.',
  'La mentalidad lo es todo. Lo crees, lo creas.',
  'El fracaso no es lo contrario del éxito, es parte del éxito.',
  'La mejor inversión es la que haces en ti mismo.',
  'La acción cura el miedo. La inacción lo alimenta.',
  'No hay atajos hacia lugares que valgan la pena.',
  'Tu potencial es ilimitado, pero requiere compromiso despiadado.',
  'La gratitud transforma lo que tienes en suficiente.',
  'El coraje no es la ausencia de miedo, es la decisión de avanzar.',
  'La persona que serás en cinco años depende de lo que hagas hoy.',
  'Lo que toleras, persiste. Lo que confrontas, se transforma.',
  'La simplicidad es la máxima sofisticación.',
  'Tu cuerpo escucha todo lo que tu mente dice. Elige bien tus palabras.',
  'El dinero es un sirviente bueno, pero un amo terrible.',
  'La riqueza no es tener más, es necesitar menos.',
  'La educación financiera es la llave que abre puertas invisibles.',
  'Cada euro invertido en ti mismo regresa multiplicado.',
  'La abundancia es un estado mental antes de ser un estado bancario.',
  'Gasta menos de lo que ganas, invierte la diferencia.',
  'La libertad financiera comienza con un solo hábito correcto.',
  'No trabajas por dinero, haces que el dinero trabaje por ti.',
  'La paciencia financiera genera las mayores recompensas.',
  'Tu relación con el dinero refleja tu relación contigo mismo.',
  'La salud es la base sobre la que se construye todo lo demás.',
  'Cuida tu cuerpo, es el único lugar que tienes para vivir.',
  'La energía que cultivas determina la vida que experimentas.',
  'Dormir bien no es un lujo, es una estrategia.',
  'El movimiento es medicina para el cuerpo y la mente.',
  'Lo que comes no solo alimenta tu cuerpo, alimenta tu estado mental.',
  'La vitalidad no se hereda, se entrena.',
  'Un cuerpo fuerte sostiene una mente poderosa.',
  'La hidratación y el descanso son las herramientas más subestimadas.',
  'Tu cuerpo te habla. Aprende a escucharlo.',
  'La respiración consciente puede cambiar tu estado en segundos.',
  'No hay salud mental sin salud física.',
  'El silencio interior es el lujo más grande del mundo moderno.',
  'Meditar no es vaciar la mente, es observarla sin juicio.',
  'La paz mental no se busca, se practica.',
  'Tu mente necesita descanso tanto como tu cuerpo.',
  'La claridad llega cuando dejas de forzar las respuestas.',
  'Entre el estímulo y la respuesta está tu libertad.',
  'La atención plena transforma lo ordinario en extraordinario.',
  'No eres tus pensamientos, eres el observador de ellos.',
  'La mente calmada ve soluciones que la mente agitada no percibe.',
  'La verdadera inteligencia es saber cuándo detenerse y reflexionar.',
  'El bienestar no es un destino, es una práctica diaria.',
  'Escribir aclara la mente y ordena el caos interior.',
  'La reflexión convierte la experiencia en sabiduría.',
  'Cada página de tu journal es un espejo de tu evolución.',
  'El crecimiento personal no es lineal, es una espiral ascendente.',
  'Aprender a desaprender es la habilidad más valiosa.',
  'La curiosidad mantiene joven la mente.',
  'Lo que no se mide, no se mejora.',
  'El conocimiento sin acción es solo entretenimiento.',
  'La humildad es la base de todo aprendizaje genuino.',
  'Tu historia no define tu destino, tus decisiones sí.',
  'El desarrollo personal es el proyecto más importante de tu vida.',
  'Las preguntas correctas son más poderosas que las respuestas rápidas.',
  'Cada crisis es una oportunidad de redefinirte.',
  'La madurez llega cuando aceptas lo que no puedes cambiar y mejoras lo que sí.',
  'No busques aprobación, busca autenticidad.',
  'La verdadera confianza nace de la competencia.',
  'El liderazgo empieza por liderarte a ti mismo.',
  'La vulnerabilidad no es debilidad, es coraje absoluto.',
  'Quien se conoce a sí mismo no puede ser derrotado.',
  'La autenticidad es la forma más alta de inteligencia social.',
  'Tu presencia es tu mayor regalo para los demás.',
  'El poder silencioso siempre supera al ruido vacío.',
  'La elegancia está en la simplicidad, no en la exageración.',
  'Los resultados hablan más fuerte que las intenciones.',
  'La integridad es hacer lo correcto cuando nadie te observa.',
  'El carácter se revela en los momentos difíciles.',
  'No sigas el camino, sé el camino.',
  'La grandeza no se hereda, se forja cada día.',
  'Tu legado se construye con acciones, no con palabras.',
  'La verdadera fuerza es suave, la verdadera suavidad es fuerte.',
  'El orden exterior refleja el orden interior.',
  'La belleza de la vida está en los detalles que casi nadie nota.',
  'La perfección es enemiga de la acción.',
  'Hazlo mal, pero hazlo. La mejora vendrá después.',
  'La procrastinación es el robo silencioso del potencial.',
  'Empieza antes de estar listo. La preparación llega en el camino.',
  'La mejor manera de predecir el futuro es crearlo.',
  'El momento de actuar fue ayer. El siguiente mejor momento es ahora.',
  'No hay nada más caro que una oportunidad ignorada.',
  'La disciplina no te limita, te libera.',
  'Lo que no te desafía no te transforma.',
  'El sacrificio temporal produce resultados permanentes.',
  'La diferencia entre quien eres y quien quieres ser es lo que haces.',
  'Renunciar es la única garantía de fracaso.',
  'El cansancio mental se cura con acción, no con descanso.',
  'Cada hábito pequeño es un voto por la persona que quieres ser.',
  'La rutina no es prisión, es libertad disfrazada.',
  'La diferencia entre un sueño y una meta es una fecha límite.',
  'El foco es decir no a mil cosas buenas para decir sí a una gran cosa.',
  'La productividad sin propósito es movimiento vacío.',
  'No gestionas el tiempo, gestionas tus prioridades.',
  'El caos externo se domina con orden interno.',
  'La dirección es más importante que la velocidad.',
  'Un minuto de planificación ahorra diez de ejecución.',
  'Las personas con propósito no necesitan motivación externa.',
  'La concentración es el superpoder del siglo XXI.',
  'Haz lo difícil primero y el resto será fácil.',
  'La rutina matutina define la calidad de tu día.',
  'El primer paso no necesita ser perfecto, necesita ser dado.',
  'La constancia discreta supera al esfuerzo espectacular.',
  'No celebres las intenciones, celebra los resultados.',
  'Tu entorno influye más que tu fuerza de voluntad. Diseñalo.',
  'La claridad genera acción. La confusión genera parálisis.',
  'La responsabilidad es el precio de la grandeza.',
  'No eres responsable de todo lo que te pasa, pero sí de cómo respondes.',
  'La madurez financiera comienza con un presupuesto honesto.',
  'El ahorro no es restricción, es libertad futura.',
  'La diferencia entre querer y lograr está en el plan.',
  'La inversión en conocimiento paga los mejores intereses.',
  'Cada gasto innecesario roba tiempo de tu libertad futura.',
  'La verdadera libertad financiera es no depender de nadie económicamente.',
  'El dinero bien gestionado es tranquilidad bien ganada.',
];

function getRandomIndex(exclude?: number): number {
  let idx: number;
  do { idx = Math.floor(Math.random() * FRASES.length); } while (idx === exclude);
  return idx;
}

interface EmpireData {
  empire: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  progress: number;
}

interface ChallengeData {
  id: string;
  completed: boolean;
  challenge: {
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
  };
}

const EMPIRE_CONFIG: Record<string, { name: string; icon: any; color: string; description: string }> = {
  disciplina: { name: 'Disciplina', icon: Shield, color: '#c8a55a', description: 'Construye hábitos y domina tu consistencia' },
  mente: { name: 'Mente', icon: Brain, color: '#c8a55a', description: 'Cultiva la calma y la claridad mental' },
  energia: { name: 'Energía', icon: Zap, color: '#c8a55a', description: 'Optimiza tu cuerpo y vitalidad física' },
  riqueza: { name: 'Finanzas', icon: Gem, color: '#c8a55a', description: 'Domina tus finanzas y alcanza la libertad' },
  crecimiento: { name: 'Crecimiento', icon: TrendingUp, color: '#c8a55a', description: 'Expande tu potencial y evoluciona' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [empires, setEmpires] = useState<EmpireData[]>([]);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fraseIndex, setFraseIndex] = useState(() => getRandomIndex());
  const [fraseVisible, setFraseVisible] = useState(true);
  const [metrics, setMetrics] = useState<{ meditationWeek: number; habitsCompleted: number; journalWeek: number; balance: number; totalIncome: number; totalExpense: number } | null>(null);
  const [streaks, setStreaks] = useState<{ meditationStreak: number; habitStreak: number; journalStreak: number } | null>(null);
  const [progress, setProgress] = useState<{ meditation: { count: number; target: number; percent: number }; habits: { count: number; target: number; percent: number }; journal: { count: number; target: number; percent: number }; totalPercent: number } | null>(null);
  const [achievements, setAchievements] = useState<{ key: string; title: string; description: string; category: string; icon: string; target: number; current: number; percent: number; unlocked: boolean; unlockedAt: string | null }[] | null>(null);
  const [achievementsStats, setAchievementsStats] = useState<{ total: number; unlocked: number; percent: number } | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<any | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [dashboardInsights, setDashboardInsights] = useState<{ id: string; type: string; category: string; icon: string; title: string; description: string }[] | null>(null);
  const [insightsScore, setInsightsScore] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, chRes, metRes, streakRes, progRes, achRes, checkRes, insRes] = await Promise.all([
          apiFetch('/api/empire'),
          apiFetch('/api/challenges'),
          apiFetch('/api/dashboard/metrics'),
          apiFetch('/api/dashboard/streaks'),
          apiFetch('/api/dashboard/progress'),
          apiFetch('/api/achievements'),
          apiFetch('/api/checkin?mode=today'),
          apiFetch('/api/insights'),
        ]);

        if (empRes.ok) {
          const empData = await empRes.json();
          setEmpires(empData.empires);
        }

        if (chRes.ok) {
          const chData = await chRes.json();
          setChallenge(chData.challenge);
        }

        if (metRes.ok) {
          const metData = await metRes.json();
          setMetrics(metData);
        }

        if (streakRes.ok) {
          const streakData = await streakRes.json();
          setStreaks(streakData);
        }

        if (progRes.ok) {
          const progData = await progRes.json();
          setProgress(progData);
        }

        if (achRes.ok) {
          const achData = await achRes.json();
          setAchievements(achData.achievements);
          setAchievementsStats(achData.stats);
        }

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          setTodayCheckin(checkData.today);
          if (!checkData.today) {
            setShowCheckinModal(true);
          }
        }

        if (insRes.ok) {
          const insData = await insRes.json();
          setDashboardInsights(insData.insights);
          setInsightsScore(insData.summary?.score ?? null);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Rotar frase cada 80 segundos con fade
  useEffect(() => {
    const interval = setInterval(() => {
      setFraseVisible(false);
      setTimeout(() => {
        setFraseIndex((prev) => getRandomIndex(prev));
        setFraseVisible(true);
      }, 600);
    }, 80000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (fetchError) {
    return (
      <div className="max-w-7xl mx-auto min-h-[60dvh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar el dashboard"
          subtitle="Tu progreso está seguro. Intenta recargar para volver a verlo."
          onRetry={() => window.location.reload()}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-12 overflow-x-contain">
      {/* Check-in Modal */}
      {showCheckinModal && (
        <CheckInModal
          onClose={() => setShowCheckinModal(false)}
          initialData={todayCheckin}
          onSave={async (data) => {
            const res = await apiFetch('/api/checkin', {
              method: 'POST',
              body: JSON.stringify(data),
            });
            if (res.ok) {
              const result = await res.json();
              setTodayCheckin(result.checkin);
            }
          }}
        />
      )}

      {/* Hero: Estado Actual */}
      <EmotionalHero />

      {/* Onboarding Recommendations */}
      <OnboardingRecommendations />

      {/* Weekly Recap */}
      <WeeklyRecap />

      {/* Welcome */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Bienvenido, <span className="text-[#c8a55a]">{user?.name || 'Guerrero'}</span>
            </h1>
            <p className="text-[#999] mt-1 sm:mt-2 text-sm sm:text-base">Construye tu imperio, un hábito a la vez.</p>
          </div>
          {todayCheckin && (
            <button
              onClick={() => setShowCheckinModal(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl px-4 py-2.5 hover:border-[#c8a55a]/40 transition-all group"
            >
              <Sunrise size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#999] group-hover:text-white transition-colors">Check-in de hoy</span>
            </button>
          )}
        </div>
        {todayCheckin && (
          <div className="mt-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-3 flex items-center gap-4">
            <span className="text-lg">{todayCheckin.emotion >= 4 ? '😊' : todayCheckin.emotion >= 3 ? '😐' : '😔'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#c8a55a] font-medium truncate">«{todayCheckin.intention}»</p>
              <p className="text-[10px] text-[#555]">
                Energía {todayCheckin.energy}/5 · Enfoque {todayCheckin.focus}/5 · Estrés {todayCheckin.stress}/5
              </p>
            </div>
            <Link href="/checkin" className="text-[10px] text-[#555] hover:text-[#c8a55a] transition-colors whitespace-nowrap">
              Historial
            </Link>
          </div>
        )}
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <Wind size={16} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Meditación</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{metrics.meditationWeek}</p>
            <p className="text-xs text-[#666] mt-1">sesiones esta semana</p>
            {streaks && streaks.meditationStreak > 0 && (
              <p className="text-xs text-[#c8a55a] mt-2 flex items-center gap-1">
                🔥 {streaks.meditationStreak} días
              </p>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <CheckCircle size={16} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Hábitos</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{metrics.habitsCompleted}</p>
            <p className="text-xs text-[#666] mt-1">completados esta semana</p>
            {streaks && streaks.habitStreak > 0 && (
              <p className="text-xs text-[#c8a55a] mt-2 flex items-center gap-1">
                🔥 {streaks.habitStreak} días
              </p>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <BookOpen size={16} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Diario</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{metrics.journalWeek}</p>
            <p className="text-xs text-[#666] mt-1">entradas esta semana</p>
            {streaks && streaks.journalStreak > 0 && (
              <p className="text-xs text-[#c8a55a] mt-2 flex items-center gap-1">
                🔥 {streaks.journalStreak} días
              </p>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <Wallet size={16} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Finanzas</span>
            </div>
            <p className={`text-lg sm:text-3xl font-bold ${metrics.balance >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
              {metrics.balance >= 0 ? '+' : ''}{metrics.balance.toFixed(2)}€
            </p>
            <p className="text-xs text-[#666] mt-1">balance últimos 30 días</p>
          </div>
        </div>
      )}

      {/* Progreso Semanal */}
      {progress && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div className="flex items-center gap-3">
              <Target size={22} className="text-[#c8a55a]" />
              <h2 className="text-lg font-semibold text-white">Progreso Semanal</h2>
            </div>
            <span className="text-2xl font-bold text-[#c8a55a]">{progress.totalPercent}%</span>
          </div>

          <div className="space-y-4">
            {/* Meditación */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#999]">Meditación</span>
                <span className="text-xs text-[#666]">{progress.meditation.count}/{progress.meditation.target} sesiones</span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[#c8a55a] h-2.5 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.meditation.percent}%` }}
                />
              </div>
            </div>

            {/* Hábitos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#999]">Hábitos</span>
                <span className="text-xs text-[#666]">{progress.habits.count}/{progress.habits.target} días activos</span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[#c8a55a] h-2.5 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.habits.percent}%` }}
                />
              </div>
            </div>

            {/* Diario */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#999]">Diario</span>
                <span className="text-xs text-[#666]">{progress.journal.count}/{progress.journal.target} entradas</span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[#c8a55a] h-2.5 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.journal.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insights Preview */}
      {dashboardInsights && dashboardInsights.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div className="flex items-center gap-3">
              <Sparkles size={22} className="text-[#c8a55a]" />
              <h2 className="text-lg sm:text-xl font-semibold text-white">Insights Semanales</h2>
              {insightsScore !== null && (
                <span className="text-xs text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 px-2 py-0.5 rounded-full font-medium">
                  {insightsScore}/100
                </span>
              )}
            </div>
            <Link href="/insights" className="text-xs text-[#c8a55a] hover:underline flex items-center gap-1">
              Ver todo <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {dashboardInsights.slice(0, 3).map((insight) => {
              const borderClass = insight.type === 'positive'
                ? 'border-[#22c55e]/15 hover:border-[#22c55e]/30'
                : insight.type === 'warning'
                ? 'border-[#e8a849]/15 hover:border-[#e8a849]/30'
                : 'border-[#1a1a1a] hover:border-[#2a2a2a]';
              return (
                <div
                  key={insight.id}
                  className={`bg-[#0a0a0a] border rounded-xl p-4 sm:p-5 transition-all duration-200 ${borderClass}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0">{insight.icon}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white mb-1">{insight.title}</h3>
                      <p className="text-xs text-[#999] leading-relaxed line-clamp-2">{insight.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Frase motivacional */}
      <div className="flex justify-center py-4 sm:py-6">
        <p
          className={`text-center text-[#c8a55a]/90 text-base sm:text-lg font-light italic tracking-wide max-w-2xl transition-opacity duration-500 px-4 ${fraseVisible ? 'opacity-100' : 'opacity-0'}`}
        >
          «{FRASES[fraseIndex]}»
        </p>
      </div>

      {/* Daily Challenge */}
      {challenge && (
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl p-3.5 sm:p-5">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <Trophy size={22} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Desafío Diario</h2>
            {challenge.completed && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-[#c8a55a]/20 text-[#c8a55a]">Completado</span>
            )}
          </div>
          <h3 className="text-[#c8a55a] font-medium text-lg mb-1">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-sm mb-4">{challenge.challenge.description}</p>
          {!challenge.completed && (
            <button
              onClick={async () => {
                const res = await apiFetch('/api/challenges/complete', {
                  method: 'POST',
                  body: JSON.stringify({ challengeId: challenge.challenge.id }),
                });
                if (res.ok) {
                  setChallenge({ ...challenge, completed: true });
                }
              }}
              className="bg-[#c8a55a] text-black font-semibold px-6 py-2.5 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
            >
              Marcar como completado
            </button>
          )}
        </div>
      )}

      {/* Empire Grid */}
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4 sm:mb-5">Tus Imperios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-5">
          {Object.entries(EMPIRE_CONFIG).map(([key, config]) => {
            const empireData = empires.find((e) => e.empire === key);
            const level = empireData?.level || 1;
            const progress = empireData?.progress || 0;
            const streak = empireData?.streak || 0;
            const Icon = config.icon;

            return (
              <Link
                key={key}
                href={`/imperio/${key}`}
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3.5 sm:p-5 hover:border-[#c8a55a]/30 transition-all group touch-press"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-5">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                    <Icon size={20} className="text-[#c8a55a]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-[#c8a55a] transition-colors">{config.name}</h3>
                    <p className="text-xs text-[#999]">Nivel {level}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[#1a1a1a] rounded-full h-2 mb-2.5">
                  <div
                    className="bg-[#c8a55a] h-2 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#666]">
                  <span>{Math.round(progress)}% para el siguiente nivel</span>
                  {streak > 0 && (
                    <span className="flex items-center gap-1 text-[#c8a55a]">
                      <Flame size={12} /> {streak} días
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Achievements Preview */}
      {achievementsStats && achievements && (
        <div>
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div className="flex items-center gap-3">
              <Trophy size={22} className="text-[#c8a55a]" />
              <h2 className="text-lg sm:text-xl font-semibold text-white">Logros</h2>
              <span className="text-xs text-[#666]">{achievementsStats.unlocked}/{achievementsStats.total}</span>
            </div>
            <Link href="/logros" className="text-xs text-[#c8a55a] hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {achievements
              .sort((a, b) => {
                if (a.unlocked && !b.unlocked) return -1;
                if (!a.unlocked && b.unlocked) return 1;
                return b.percent - a.percent;
              })
              .slice(0, 5)
              .map((ach) => {
                const isUnlocked = ach.unlocked;
                return (
                  <div
                    key={ach.key}
                    className={`rounded-xl p-4 transition-all duration-300 group ${
                      isUnlocked
                        ? 'bg-[#0a0a0a] border border-[#c8a55a]/20 hover:border-[#c8a55a]/40'
                        : 'bg-[#080808] border border-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 ${
                          isUnlocked ? 'bg-[#c8a55a]/15' : 'bg-[#111]'
                        }`}
                      >
                        {isUnlocked ? (
                          <Crown size={18} className="text-[#c8a55a]" />
                        ) : (
                          <Lock size={18} className="text-[#333]" />
                        )}
                      </div>
                      <h4 className={`text-xs font-semibold truncate w-full ${isUnlocked ? 'text-white' : 'text-[#555]'}`}>
                        {ach.title}
                      </h4>
                      <p className="text-[10px] text-[#555] mt-0.5 truncate w-full">{ach.description}</p>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-1 mt-2 overflow-hidden">
                        <div
                          className={`h-1 rounded-full transition-all duration-700 ${isUnlocked ? 'bg-[#c8a55a]' : 'bg-[#333]'}`}
                          style={{ width: `${ach.percent}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-[#555] mt-1">{ach.percent}%</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-5">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-6">
          <div className="flex items-center gap-3">
            <Star size={20} className="text-[#c8a55a]" />
            <div>
              <p className="text-2xl font-bold text-white">{empires.reduce((sum, e) => sum + e.xp, 0)}</p>
              <p className="text-xs text-[#999]">XP total</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Trophy size={20} className="text-[#c8a55a]" />
            <div>
              <p className="text-lg sm:text-2xl font-bold text-white">{empires.reduce((sum, e) => sum + e.level, 0)}</p>
              <p className="text-xs text-[#999]">Niveles totales</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Flame size={20} className="text-[#c8a55a]" />
            <div>
              <p className="text-lg sm:text-2xl font-bold text-white">
                {Math.max(...empires.map((e) => e.streak), 0)}
              </p>
              <p className="text-xs text-[#999]">Mejor racha</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
