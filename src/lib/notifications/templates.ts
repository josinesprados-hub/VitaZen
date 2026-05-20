// ═══════════════════════════════════════════
// NOTIFICATION TEMPLATES — VitaZen
// ═══════════════════════════════════════════
//
// Calm, human, premium messaging.
// The user should feel: "la app me acompaña"
// NOT: "la app me persigue"
//
// Expanded with more variety.
// Every message validated for:
//  - No guilt-tripping language ("deberías", "tienes que")
//  - No urgency ("¡ya!", "¡ahora!")
//  - No anxiety ("no pierdas tu racha")
//  - No coaching
//  - No wellness startup tone
//  - Calm, inviting, human, varied

import { NotificationType, NotificationTemplate } from './types';

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
  {
    title: 'El día empieza',
    body: 'Sin prisa.',
    url: '/checkin',
  },
  {
    title: 'Cuando quieras',
    body: 'Tu espacio está ahí.',
    url: '/checkin',
  },
  {
    title: 'Buen inicio',
    body: 'Si tienes un momento.',
    url: '/checkin',
  },
  {
    title: 'El día',
    body: 'Tiene un rato para ti.',
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
  {
    title: '{streak} días seguidos',
    body: 'Poco a poco.',
    url: '/dashboard',
  },
];

const WEEKLY_RECAP_TEMPLATES: NotificationTemplate[] = [
  {
    title: 'Tu semana',
    body: 'Un resumen tranquilo, cuando quieras.',
    url: '/insights',
  },
  {
    title: 'La semana',
    body: 'Un momento para mirar atrás.',
    url: '/insights',
  },
  {
    title: 'Esta semana',
    body: 'Si quieres mirar atrás.',
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
  {
    title: 'Otra vez',
    body: 'Tu espacio no se movió.',
    url: '/dashboard',
  },
  {
    title: 'Hola',
    body: 'Lo importante es que estás aquí.',
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
    body: 'No tienes que escribir nada largo.',
    url: '/timeline',
  },
  {
    title: 'El día se cierra',
    body: 'Si hay algo que quieras notar.',
    url: '/timeline',
  },
  {
    title: 'Un momento quieto',
    body: 'Antes de que el día se vaya.',
    url: '/timeline',
  },
  {
    title: 'La noche',
    body: 'Un momento antes de descansar.',
    url: '/timeline',
  },
  {
    title: 'Quietud',
    body: 'Si hay algo que quieras notar.',
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
