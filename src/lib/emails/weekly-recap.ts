// ═══════════════════════════════════════════
// WEEKLY RECAP EMAIL TEMPLATE
// Premium dark/gold design, transactional-first
// Black background, V logo, gold accents
// Optimized for Gmail/Outlook/Apple Mail
// ═══════════════════════════════════════════

import type { EmailContent } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

// ─── V Logo: public URL for maximum email client compatibility ───
// cid: attachments fail in Gmail iOS/Android; public HTTPS URL works everywhere
const V_LOGO_SRC = 'https://vitazen.cc/images/v-gold-logo.png';

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
      <td style="padding:4px 0;color:#777;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${label}</td>
      <td style="padding:4px 0;color:#ffffff;font-size:13px;text-align:right;font-weight:400;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${value}</td>
    </tr>`;
}

function sectionLabel(text: string): string {
  return `<p style="color:#c8a55a;font-size:10px;letter-spacing:3px;margin:0 0 8px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${text}</p>`;
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
      <td style="padding:24px 0 0;">
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
      <td style="padding:24px 0 0;">
        ${sectionLabel('INSIGHT')}
        <p style="color:#ffffff;font-size:14px;font-weight:400;margin:0 0 4px;line-height:1.4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${data.mainInsight!.title}</p>
        <p style="color:#999;font-size:13px;line-height:1.5;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${data.mainInsight!.description}</p>
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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
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
</head>
<body style="margin:0;padding:0;background-color:#080808;-webkit-font-smoothing:antialiased;" bgcolor="#080808">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#080808;line-height:1px;">
    ${preheader}&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#080808;" bgcolor="#080808">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- V Logo -->
          <tr>
            <td style="padding:0 40px 20px;text-align:center;">
              <img src="${V_LOGO_SRC}" alt="V" width="48" height="48" style="display:inline-block;border:0;outline:none;text-decoration:none;border-radius:10px;" />
            </td>
          </tr>

          <!-- Brand Name -->
          <tr>
            <td style="padding:0 40px 24px;text-align:center;">
              <p style="color:#c8a55a;font-size:12px;letter-spacing:6px;margin:0;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">VITAZEN</p>
            </td>
          </tr>

          <!-- Gold Accent Line -->
          <tr>
            <td style="padding:0 40px 0;">
              <div style="width:40px;height:1px;background-color:#c8a55a;margin:0 auto;"></div>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <p style="color:#777;font-size:11px;letter-spacing:2px;margin:0 0 8px;">RECAP SEMANAL</p>
              <h1 style="color:#ffffff;font-size:20px;font-weight:400;margin:0 0 4px;line-height:1.3;letter-spacing:0.3px;">Tu semana, ${data.name}.</h1>
              <p style="color:#666;font-size:12px;margin:0;">${data.weekLabel}</p>
            </td>
          </tr>

          <!-- Wellness Score -->
          <tr>
            <td style="padding:28px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              ${sectionLabel('BIENESTAR')}
              <p style="color:#ffffff;font-size:32px;font-weight:300;margin:0;line-height:1;">
                ${data.score}<span style="color:#666;font-size:13px;font-weight:400;"> / 100 · </span><span style="color:#c8a55a;font-size:13px;font-weight:400;">${data.scoreLabel}</span>
              </p>
            </td>
          </tr>

          <!-- Activity -->
          <tr>
            <td style="padding:24px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
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
            <td style="padding:24px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              ${sectionLabel('ESTADO EMOCIONAL')}
              <table width="100%" cellpadding="0" cellspacing="0">
                ${metricRow('Estado', data.emotionalState.statusLabel)}
                ${metricRow('Energía', `${data.emotionalState.energy}/100`)}
                ${metricRow('Consistencia', `${data.emotionalState.consistency}/100`)}
              </table>
            </td>
          </tr>

          <!-- Habits -->
          ${hasHabits ? `<tr><td style="padding:0 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${habitsHtml}</td></tr>` : ''}

          <!-- Insight -->
          ${hasInsight ? `<tr><td style="padding:0 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${insightHtml}</td></tr>` : ''}

          <!-- Recommendation -->
          <tr>
            <td style="padding:24px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              ${sectionLabel('RECOMENDACIÓN')}
              <p style="color:#d4d4d4;font-size:13px;line-height:1.6;margin:0;">${data.mentorRecommendation}</p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:32px 40px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="background-color:#c8a55a;border-radius:3px;">
                    <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 32px;color:#0a0a0a;font-size:14px;font-weight:500;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.5px;">ACCEDER</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td style="padding:0 40px;">
              <div style="width:40px;height:1px;background-color:#333;margin:0 auto 20px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;text-align:center;">
              <p style="color:#c8a55a;font-size:11px;letter-spacing:4px;margin:0 0 4px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">VITAZEN</p>
              <p style="color:#555;font-size:11px;margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">vitazen.cc</p>
              <p style="color:#555;font-size:11px;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><a href="${APP_URL}/perfil" style="color:#666;text-decoration:underline;">Desactivar resumen semanal</a></p>
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
