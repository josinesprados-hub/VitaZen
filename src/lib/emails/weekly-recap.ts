// ═══════════════════════════════════════════
// WEEKLY RECAP EMAIL TEMPLATE
// Premium dark/champagne design, transactional-first
// Black background, V logo, champagne accents
// Optimized for Gmail/Outlook/Apple Mail
// Anti-dark-mode: color-scheme light-only
// ═══════════════════════════════════════════

import type { EmailContent } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

// ─── V Logo: public URL for maximum email client compatibility ───
const V_LOGO_SRC = 'https://vitazen.cc/images/icon-192x192.png';

// ─── Cross-client font stack ───
const FONT_STACK_CSS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ─── Anti-dark-mode + Gmail compatibility styles ───
// Same 3-layer defense strategy as templates.ts:
// 1. <meta color-scheme="light"> — prevents Gmail Android tablet auto-inversion
// 2. u + .email-body selectors — override Gmail mobile dark mode
// 3. Inline styles everywhere — survive when <style> is stripped
const ANTI_DARK_MODE_STYLES = `
  <style type="text/css">
    /* ====== EMAIL CLIENT RESETS ====== */
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }

    /* ====== GMAIL DARK MODE OVERRIDES (defense layer 2) ====== */
    u + .email-body .email-bg { background-color:#080808 !important; }
    u + .email-body .content-cell { background-color:#080808 !important; }
    u + .email-body .champagne-text { color:#c8a55a !important; }
    u + .email-body .white-text { color:#ffffff !important; }
    u + .email-body .heading-text { color:#ffffff !important; }
    u + .email-body .body-text { color:#d4d4d4 !important; }
    u + .email-body .secondary-text { color:#aaaaaa !important; }
    u + .email-body .label-text { color:#777777 !important; }
    u + .email-body .muted-text { color:#666666 !important; }
    u + .email-body .subtle-text { color:#555555 !important; }
    u + .email-body .cta-cell { background-color:#c8a55a !important; }
    u + .email-body .cta-link { color:#0a0a0a !important; }
    u + .email-body .divider-champagne { background-color:#c8a55a !important; }
    u + .email-body .divider-subtle { background-color:#333333 !important; }
    u + .email-body .logo-img { filter:none !important; -webkit-filter:none !important; }

    /* ====== NO @media (prefers-color-scheme: dark) ====== */
    /* Deliberately omitted: email is already dark-themed. */
    /* Dark media query causes Apple Mail to double-apply dark mode, */
    /* washing out the premium palette. color-scheme:light prevents Gmail. */
  </style>
  <!--[if mso]>
  <style type="text/css">
    body,table,td,p,a,h1,span { font-family:Tahoma,Verdana,Segoe,sans-serif !important; }
  </style>
  <![endif]-->
`;

// ─── Types ───

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

// ─── Helpers ───

function metricRow(label: string, value: string): string {
  return `
    <tr>
      <td class="content-cell" style="padding:4px 0;color:#777;font-size:13px;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808"><span class="label-text">${label}</span></td>
      <td class="content-cell" style="padding:4px 0;color:#ffffff;font-size:13px;text-align:right;font-weight:400;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808"><span class="white-text">${value}</span></td>
    </tr>`;
}

function sectionLabel(text: string): string {
  return `<p class="champagne-text" style="color:#c8a55a;font-size:10px;letter-spacing:3px;margin:0 0 8px;font-weight:500;font-family:${FONT_STACK_CSS};">${text}</p>`;
}

// ─── Main template ───

export function weeklyRecapEmail(data: WeeklyRecapEmailData): EmailContent {
  const subject = `Resumen de tu semana en VitaZen`;
  const preheader = `${data.name}, tu puntuación de bienestar: ${data.score}/100.`;

  const hasHabits = data.topHabits.length > 0;
  const hasInsight = data.mainInsight !== null;

  // Build habits section
  const habitsHtml = hasHabits
    ? `
    <tr>
      <td class="content-cell" style="padding:24px 0 0;background-color:#080808;" bgcolor="#080808">
        ${sectionLabel('HÁBITOS')}
        <table width="100%" cellpadding="0" cellspacing="0">
          ${data.topHabits.map(h => metricRow(h.name, `${h.streak} días`)).join('')}
        </table>
      </td>
    </tr>`
    : '';

  // Build insight section
  const insightHtml = hasInsight
    ? `
    <tr>
      <td class="content-cell" style="padding:24px 0 0;background-color:#080808;" bgcolor="#080808">
        ${sectionLabel('INSIGHT')}
        <p class="white-text" style="color:#ffffff;font-size:14px;font-weight:400;margin:0 0 4px;line-height:1.4;font-family:${FONT_STACK_CSS};">${data.mainInsight!.title}</p>
        <p class="secondary-text" style="color:#999;font-size:13px;line-height:1.5;margin:0;font-family:${FONT_STACK_CSS};">${data.mainInsight!.description}</p>
      </td>
    </tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!-- Anti-dark-mode: declare light-only so Gmail/Android tablets skip auto-inversion -->
  <!-- Our email is already dark-themed; we DON'T want client dark mode on top -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>VitaZen</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  ${ANTI_DARK_MODE_STYLES}
</head>
<body class="email-body" style="margin:0;padding:0;background-color:#080808;-webkit-font-smoothing:antialiased;font-family:${FONT_STACK_CSS};" bgcolor="#080808">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#080808;line-height:1px;font-family:${FONT_STACK_CSS};">
    ${preheader}&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>
  <!-- Outer table: explicit bgcolor on table AND td for maximum Gmail/Outlook compat -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:#080808;" bgcolor="#080808">
    <tr>
      <td align="center" class="content-cell" style="padding:48px 16px;background-color:#080808;" bgcolor="#080808">
        <!-- Inner container table: also explicit bgcolor -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#080808;" bgcolor="#080808">

          <!-- V Logo -->
          <tr>
            <td class="content-cell" style="padding:0 40px 20px;text-align:center;background-color:#080808;" bgcolor="#080808">
              <img class="logo-img" src="${V_LOGO_SRC}" alt="V" width="48" height="48" style="display:inline-block;border:0;outline:none;text-decoration:none;border-radius:10px;-ms-interpolation-mode:bicubic;font-size:20px;color:#c8a55a;" />
            </td>
          </tr>

          <!-- Brand Name -->
          <tr>
            <td class="content-cell" style="padding:0 40px 24px;text-align:center;background-color:#080808;" bgcolor="#080808">
              <p class="champagne-text" style="color:#c8a55a;font-size:12px;letter-spacing:6px;margin:0;font-weight:500;font-family:${FONT_STACK_CSS};">VITAZEN</p>
            </td>
          </tr>

          <!-- Champagne Accent Line -->
          <tr>
            <td class="content-cell" style="padding:0 40px 0;background-color:#080808;" bgcolor="#080808">
              <div class="divider-champagne" style="width:40px;height:1px;background-color:#c8a55a;margin:0 auto;font-size:1px;line-height:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td class="content-cell" style="padding:32px 40px 0;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">
              <p class="label-text" style="color:#777;font-size:11px;letter-spacing:2px;margin:0 0 8px;font-family:${FONT_STACK_CSS};">RECAP SEMANAL</p>
              <h1 class="heading-text" style="color:#ffffff;font-size:20px;font-weight:400;margin:0 0 4px;line-height:1.3;letter-spacing:0.3px;font-family:${FONT_STACK_CSS};">Tu semana, ${data.name}.</h1>
              <p class="muted-text" style="color:#666;font-size:12px;margin:0;font-family:${FONT_STACK_CSS};">${data.weekLabel}</p>
            </td>
          </tr>

          <!-- Wellness Score -->
          <tr>
            <td class="content-cell" style="padding:28px 40px 0;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">
              ${sectionLabel('BIENESTAR')}
              <p style="color:#ffffff;font-size:32px;font-weight:300;margin:0;line-height:1;font-family:${FONT_STACK_CSS};">
                <span class="white-text">${data.score}</span><span class="muted-text" style="color:#666;font-size:13px;font-weight:400;font-family:${FONT_STACK_CSS};"> / 100 · </span><span class="champagne-text" style="color:#c8a55a;font-size:13px;font-weight:400;font-family:${FONT_STACK_CSS};">${data.scoreLabel}</span>
              </p>
            </td>
          </tr>

          <!-- Activity -->
          <tr>
            <td class="content-cell" style="padding:24px 40px 0;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">
              ${sectionLabel('ACTIVIDAD')}
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
            <td class="content-cell" style="padding:24px 40px 0;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">
              ${sectionLabel('ESTADO EMOCIONAL')}
              <table width="100%" cellpadding="0" cellspacing="0">
                ${metricRow('Estado', data.emotionalState.statusLabel)}
                ${metricRow('Energía', `${data.emotionalState.energy}/100`)}
                ${metricRow('Consistencia', `${data.emotionalState.consistency}/100`)}
              </table>
            </td>
          </tr>

          <!-- Habits -->
          ${hasHabits ? `<tr><td class="content-cell" style="padding:0 40px;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">${habitsHtml}</td></tr>` : ''}

          <!-- Insight -->
          ${hasInsight ? `<tr><td class="content-cell" style="padding:0 40px;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">${insightHtml}</td></tr>` : ''}

          <!-- Recommendation -->
          <tr>
            <td class="content-cell" style="padding:24px 40px 0;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">
              ${sectionLabel('RECOMENDACIÓN')}
              <p class="body-text" style="color:#d4d4d4;font-size:13px;line-height:1.6;margin:0;font-family:${FONT_STACK_CSS};">${data.mentorRecommendation}</p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td class="content-cell" style="padding:32px 40px 40px;font-family:${FONT_STACK_CSS};text-align:center;background-color:#080808;" bgcolor="#080808">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td class="cta-cell" style="background-color:#c8a55a;border-radius:3px;" bgcolor="#c8a55a">
                    <a href="${APP_URL}/dashboard" class="cta-link" style="display:inline-block;padding:12px 32px;color:#0a0a0a;font-size:14px;font-weight:500;text-decoration:none;font-family:${FONT_STACK_CSS};letter-spacing:0.5px;">ACCEDER</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#080808;" bgcolor="#080808">
          <tr>
            <td class="content-cell" style="padding:0 40px;background-color:#080808;" bgcolor="#080808">
              <div class="divider-subtle" style="width:40px;height:1px;background-color:#333;margin:0 auto 20px;font-size:1px;line-height:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="content-cell" style="padding:0 40px;text-align:center;background-color:#080808;" bgcolor="#080808">
              <p class="champagne-text" style="color:#c8a55a;font-size:11px;letter-spacing:4px;margin:0 0 4px;font-weight:500;font-family:${FONT_STACK_CSS};">VITAZEN</p>
              <p class="subtle-text" style="color:#555;font-size:11px;margin:0 0 8px;font-family:${FONT_STACK_CSS};">vitazen.cc</p>
              <p style="color:#555;font-size:11px;margin:0;font-family:${FONT_STACK_CSS};"><a href="${APP_URL}/perfil" class="muted-text" style="color:#666;text-decoration:underline;font-family:${FONT_STACK_CSS};">Desactivar resumen semanal</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ─── Plain text version (unchanged) ───

  const habitsText = hasHabits
    ? '\nHábitos:\n' + data.topHabits.map(h => `  ${h.name}: ${h.streak} días`).join('\n')
    : '';

  const insightText = hasInsight
    ? `\nInsight: ${data.mainInsight!.title}\n${data.mainInsight!.description}`
    : '';

  const text = `Tu semana, ${data.name}.

${data.weekLabel}

Bienestar: ${data.score}/100 · ${data.scoreLabel}

Actividad:
  Check-ins: ${data.progress.checkins}
  Hábitos completados: ${data.progress.habitsCompleted}
  Meditaciones: ${data.progress.meditationSessions}
  Entradas de diario: ${data.progress.journalEntries}

Estado emocional:
  Estado: ${data.emotionalState.statusLabel}
  Energía: ${data.emotionalState.energy}/100
  Consistencia: ${data.emotionalState.consistency}/100
${habitsText}
${insightText}

Recomendación: ${data.mentorRecommendation}

Acceder: ${APP_URL}/dashboard

Desactivar resumen semanal: ${APP_URL}/perfil

VitaZen · vitazen.cc`;

  return { html, text, subject };
}
