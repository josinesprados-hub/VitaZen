// ═══════════════════════════════════════════
// NOTIFICATION TEMPLATES — VitaZen
// Calm, human, premium messaging.
// The user should feel: "la app me acompaña"
// NOT: "la app me persigue"
// ═══════════════════════════════════════════

import { NotificationType, NotificationTemplate } from './types';

/** Rotating message sets per type.
 *  Each send picks one at random to avoid repetition fatigue.
 *  Every message is validated for:
 *   - No guilt-tripping language ("deberías", "tienes que")
 *   - No urgency ("¡ya!", "¡ahora!")
 *   - No anxiety ("no pierdas tu racha")
 *   - Calm, inviting, human tone
 */

const CHECKIN_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Buenos días',
    body: 'Tu check-in te espera cuando estés listo. Sin prisa.',
    url: '/checkin',
  },
  {
    title: 'Un momento para ti',
    body: '¿Cómo amaneciste hoy? Tu check-in diario está aquí si quieres.',
    url: '/checkin',
  },
  {
    title: 'Tu espacio',
    body: 'Cuando tengas un minuto, tu check-in te espera. Es tuyo.',
    url: '/checkin',
  },
  {
    title: 'Respira',
    body: 'Tómate un momento. Tu check-in diario es un regalo, no una tarea.',
    url: '/checkin',
  },
];

const STREAK_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Llevas {streak} días',
    body: 'Cada día es un paso. Ni más ni menos.',
    url: '/dashboard',
  },
  {
    title: '{streak} días consecutivos',
    body: 'Tu constancia habla por sí sola. Sigue a tu ritmo.',
    url: '/dashboard',
  },
  {
    title: 'Racha de {streak} días',
    body: 'No importa el número. Importa que sigues aquí.',
    url: '/dashboard',
  },
];

const WEEKLY_RECAP_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Tu semana en VitaZen',
    body: 'Un resumen tranquilo de tu progreso. Cuando quieras mirarlo.',
    url: '/insights',
  },
  {
    title: 'Reflexión semanal',
    body: 'Ha pasado una semana. Aquí tienes tu resumen si quieres echarle un vistazo.',
    url: '/insights',
  },
];

const COMEBACK_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Te echamos de menos',
    body: 'Tu espacio en VitaZen sigue aquí. Vuelve cuando estés listo.',
    url: '/dashboard',
  },
  {
    title: 'Aquí estás',
    body: 'Da igual cuánto tiempo haya pasado. Lo importante es que volviste.',
    url: '/dashboard',
  },
  {
    title: 'Bienvenido de vuelta',
    body: 'No hay prisa ni presión. VitaZen te espera cuando tú decidas.',
    url: '/dashboard',
  },
];

const REFLECTION_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Un momento para ti',
    body: 'Antes de terminar el día, ¿cómo te sientes? Tu espacio te espera.',
    url: '/timeline',
  },
  {
    title: 'Reflexiona un instante',
    body: 'El día se acaba. Si quieres, anota cómo fue. Sin obligación.',
    url: '/timeline',
  },
  {
    title: 'Cierra el día',
    body: 'Un pequeño momento de reflexión puede cambiar mucho. Si te apetece.',
    url: '/timeline',
  },
  {
    title: 'La noche llega',
    body: '¿Cómo fue tu día? No tienes que escribir nada largo. Solo sentir.',
    url: '/timeline',
  },
  {
    title: 'Respira hondo',
    body: 'El día está por terminar. Si tienes un minuto, está tu espacio.',
    url: '/timeline',
  },
  {
    title: 'Antes de descansar',
    body: 'Tómate un instante. ¿Qué te queda del día? Tu diario te escucha.',
    url: '/timeline',
  },
  {
    title: 'El día en silencio',
    body: 'Un momento quieto antes de dormir. Tu reflexión, a tu ritmo.',
    url: '/timeline',
  },
  {
    title: 'Aterriza',
    body: 'El día pasó. Si quieres aterrizar un momento, tu espacio está ahí.',
    url: '/timeline',
  },
];

const TEMPLATE_MAP: Record<NotificationType, NotificationTemplate[]> = {
  checkin:      CHECKIN_TEMPLATES,
  streak:       STREAK_TEMPLATES,
  weekly_recap: WEEKLY_RECAP_TEMPLATES,
  comeback:     COMEBACK_TEMPLATES,
  reflection:   REFLECTION_TEMPLATES,
};

/**
 * Pick a random template for the given notification type.
 * Optionally interpolate variables like {streak} from `vars`.
 */
export function getTemplate(
  type: NotificationType,
  vars?: Record<string, string | number>,
): NotificationTemplate {
  const templates = TEMPLATE_MAP[type];
  const template = templates[Math.floor(Math.random() * templates.length)];

  // Interpolate variables
  let title = template.title;
  let body = template.body;

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{${key}}`;
      title = title.replace(placeholder, String(value));
      body = body.replace(placeholder, String(value));
    }
  }

  return {
    ...template,
    title,
    body,
    icon: '/images/icon-192x192.png',
  };
}
