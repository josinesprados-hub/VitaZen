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
    body: 'Tu check-in te espera cuando estés listo.',
    url: '/checkin',
  },
  {
    title: 'Tu espacio',
    body: 'Cuando tengas un momento.',
    url: '/checkin',
  },
  {
    title: 'Respira',
    body: 'Un momento para ti, si quieres.',
    url: '/checkin',
  },
];

const STREAK_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Llevas {streak} días',
    body: 'Un día más.',
    url: '/dashboard',
  },
  {
    title: '{streak} días',
    body: 'Sigues aquí.',
    url: '/dashboard',
  },
];

const WEEKLY_RECAP_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Tu semana',
    body: 'Un resumen tranquilo, cuando quieras.',
    url: '/insights',
  },
];

const COMEBACK_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Aquí estás',
    body: 'Da igual cuánto tiempo haya pasado.',
    url: '/dashboard',
  },
  {
    title: 'Bienvenido',
    body: 'Sin prisa. Cuando tú decidas.',
    url: '/dashboard',
  },
];

const REFLECTION_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Antes de descansar',
    body: 'Si tienes un minuto.',
    url: '/timeline',
  },
  {
    title: 'El día en silencio',
    body: 'Un momento quieto, si te apetece.',
    url: '/timeline',
  },
  {
    title: 'Aterriza',
    body: 'El día pasó. Tu espacio está ahí.',
    url: '/timeline',
  },
  {
    title: 'La noche llega',
    body: 'No tienes que escribir nada largo. Solo sentir.',
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
 * Pick a template for the given notification type using
 * sequential rotation (not random). This avoids the
 * "always seeing the same one" problem that random selection
 * creates with small template sets.
 *
 * Optionally interpolate variables like {streak} from `vars`.
 */
export function getTemplate(
  type: NotificationType,
  vars?: Record<string, string | number>,
): NotificationTemplate {
  const templates = TEMPLATE_MAP[type];
  // Sequential rotation based on current day — same template all day,
  // different each day. Deterministic, not random.
  const dayIndex = Math.floor(Date.now() / 86400000);
  const template = templates[dayIndex % templates.length];

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
