// ═══════════════════════════════════════════
// WEEKLY RECAP EMAIL TEMPLATE
// Premium, minimalista, coherente con VitaZen
// Negro + dorado. Tono humano y calmado.
// ═══════════════════════════════════════════

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';
const LOGO_URL = `${APP_URL}/images/vitazen-logo.png`;

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface WeeklyRecapEmailData {
  name: string;
  weekLabel: string;
  score: number;
  scoreLabel: string;
  progress: {
    totalActivities: number;
    checkins: number;
    habitsCompleted: number;
    meditationSessions: number;
    journalEntries: number;
  };
  topHabits: { name: string; streak: number }[];
  emotionalState: {
    statusLabel: string;
    energy: number;
    consistency: number;
  };
  mainInsight: {
    title: string;
    description: string;
  } | null;
  mentorRecommendation: string;
  plan: string;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function scoreBar(score: number): string {
  const width = Math.round(score);
  const color = score >= 70 ? '#c8a55a' : score >= 40 ? '#8a7a3a' : '#4a4a4a';
  return `
    <div style="width: 100%; height: 3px; background-color: #1a1a1a; border-radius: 2px; margin: 12px 0 4px;">
      <div style="width: ${width}%; height: 3px; background-color: ${color}; border-radius: 2px;"></div>
    </div>`;
}

function metricRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 6px 0; color: #666; font-size: 13px; letter-spacing: 0.3px;">${label}</td>
      <td style="padding: 6px 0; color: #c8a55a; font-size: 13px; text-align: right; font-weight: 500;">${value}</td>
    </tr>`;
}

function insightBlock(title: string, description: string): string {
  return `
    <div style="background-color: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 4px; padding: 20px 24px; margin: 20px 0;">
      <p style="color: #c8a55a; font-size: 11px; letter-spacing: 3px; margin: 0 0 8px; font-weight: 500;">INSIGHT</p>
      <p style="color: #ffffff; font-size: 15px; font-weight: 300; margin: 0 0 10px; line-height: 1.4;">${title}</p>
      <p style="color: #777; font-size: 13px; line-height: 1.6; margin: 0;">${description}</p>
    </div>`;
}

function habitItem(name: string, streak: number): string {
  return `
    <tr>
      <td style="padding: 5px 0; color: #999; font-size: 13px;">${name}</td>
      <td style="padding: 5px 0; color: #c8a55a; font-size: 13px; text-align: right;">${streak}d</td>
    </tr>`;
}

// ─────────────────────────────────────────
// Main template
// ─────────────────────────────────────────

export function weeklyRecapEmail(data: WeeklyRecapEmailData): string {
  const hasHabits = data.topHabits.length > 0;
  const hasInsight = data.mainInsight !== null;

  // Build habits section
  const habitsSection = hasHabits
    ? `
    <tr>
      <td style="padding: 24px 0 0;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 3px; margin: 0 0 12px; font-weight: 500;">HÁBITOS DESTACADOS</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${data.topHabits.map(h => habitItem(h.name, h.streak)).join('')}
        </table>
      </td>
    </tr>`
    : '';

  // Build insight section
  const insightSection = hasInsight
    ? `
    <tr>
      <td>
        ${insightBlock(data.mainInsight!.title, data.mainInsight!.description)}
      </td>
    </tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: #000000; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto;">

    <!-- Spacer top -->
    <tr><td style="height: 64px;"></td></tr>

    <!-- Logo -->
    <tr>
      <td style="text-align: center; padding-bottom: 12px;">
        <img src="${LOGO_URL}" alt="V" width="40" height="40" style="margin-bottom: 20px; opacity: 0.9;" />
      </td>
    </tr>

    <!-- Brand name -->
    <tr>
      <td style="text-align: center; padding-bottom: 8px;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 8px; margin: 0; font-weight: 400;">VITAZEN</p>
      </td>
    </tr>

    <!-- Gold accent line -->
    <tr>
      <td style="text-align: center; padding: 24px 0 0;">
        <div style="width: 32px; height: 1px; background-color: #c8a55a; margin: 0 auto;"></div>
      </td>
    </tr>

    <!-- Header -->
    <tr>
      <td style="padding: 48px 32px 0;">
        <p style="color: #555; font-size: 11px; letter-spacing: 2px; margin: 0 0 16px;">RESUMEN SEMANAL</p>
        <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 300; margin: 0 0 8px; letter-spacing: 0.3px; line-height: 1.4;">
          ${data.name}, tu semana.
        </h1>
        <p style="color: #555; font-size: 13px; margin: 0;">${data.weekLabel}</p>
      </td>
    </tr>

    <!-- Wellness Score -->
    <tr>
      <td style="padding: 32px 32px 0;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 3px; margin: 0 0 6px; font-weight: 500;">BIENESTAR</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <span style="color: #ffffff; font-size: 32px; font-weight: 300; letter-spacing: 1px;">${data.score}</span>
              <span style="color: #555; font-size: 14px; font-weight: 300;"> / 100</span>
            </td>
            <td style="text-align: right; vertical-align: bottom;">
              <span style="color: #888; font-size: 13px;">${data.scoreLabel}</span>
            </td>
          </tr>
        </table>
        ${scoreBar(data.score)}
      </td>
    </tr>

    <!-- Activity metrics -->
    <tr>
      <td style="padding: 24px 32px 0;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 3px; margin: 0 0 12px; font-weight: 500;">ACTIVIDAD</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${metricRow('Check-ins', String(data.progress.checkins))}
          ${metricRow('Hábitos completados', String(data.progress.habitsCompleted))}
          ${metricRow('Meditaciones', String(data.progress.meditationSessions))}
          ${metricRow('Entradas de diario', String(data.progress.journalEntries))}
        </table>
      </td>
    </tr>

    <!-- Emotional state -->
    <tr>
      <td style="padding: 24px 32px 0;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 3px; margin: 0 0 12px; font-weight: 500;">ESTADO EMOCIONAL</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${metricRow('Estado', data.emotionalState.statusLabel)}
          ${metricRow('Energía', data.emotionalState.energy + '/100')}
          ${metricRow('Consistencia', data.emotionalState.consistency + '/100')}
        </table>
      </td>
    </tr>

    <!-- Habits -->
    ${hasHabits ? `<tr><td style="padding: 0 32px;">${habitsSection}</td></tr>` : ''}

    <!-- Insight -->
    ${hasInsight ? `<tr><td style="padding: 0 32px;">${insightSection}</td></tr>` : ''}

    <!-- Mentor recommendation -->
    <tr>
      <td style="padding: 24px 32px 0;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 3px; margin: 0 0 10px; font-weight: 500;">RECOMENDACIÓN</p>
        <p style="color: #999; font-size: 14px; line-height: 1.7; margin: 0; font-weight: 300;">${data.mentorRecommendation}</p>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding: 40px 32px 0;">
        <div style="text-align: center;">
          <a href="${APP_URL}/dashboard" style="background-color: #c8a55a; color: #000000; border: none; padding: 16px 48px; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 2px; display: inline-block; letter-spacing: 3px;">VER MI PROGRESO</a>
        </div>
      </td>
    </tr>

    <!-- Premium hint for FREE users -->
    ${data.plan !== 'PREMIUM' ? `
    <tr>
      <td style="padding: 32px 32px 0; text-align: center;">
        <p style="color: #333; font-size: 12px; line-height: 1.6; margin: 0;">
          Con <span style="color: #c8a55a;">Premium</span>, recibe comparativas semanales y análisis avanzados.
        </p>
        <a href="${APP_URL}/pricing" style="color: #c8a55a; font-size: 11px; letter-spacing: 2px; text-decoration: none; font-weight: 500;">SABER MÁS</a>
      </td>
    </tr>` : ''}

    <!-- Gold accent line -->
    <tr>
      <td style="text-align: center; padding-top: 48px;">
        <div style="width: 32px; height: 1px; background-color: #c8a55a; margin: 0 auto;"></div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 32px 32px 16px; text-align: center;">
        <p style="color: #2a2a2a; font-size: 10px; letter-spacing: 3px; margin: 0 0 12px;">VITAZEN</p>
        <p style="color: #1a1a1a; font-size: 11px; margin: 0; line-height: 1.5;">
          Puedes desactivar este resumen en <a href="${APP_URL}/perfil" style="color: #333; text-decoration: underline;">tu perfil</a>.
        </p>
      </td>
    </tr>
    <tr><td style="height: 32px;"></td></tr>

  </table>
</body>
</html>`;
}
