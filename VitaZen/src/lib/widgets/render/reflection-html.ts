// ═══════════════════════════════════════════
// REFLECTION WIDGET RENDERER — VitaZen
// Generates standalone premium HTML for the Reflection Widget
// ═══════════════════════════════════════════
//
// Design philosophy:
//   - Zero client-side JavaScript (no hydration, no fetches)
//   - All content server-rendered from snapshot
//   - Pure HTML + inline CSS — maximum compatibility
//   - Apple/Oura/Headspace aesthetic
//   - Works in WKWebView (iOS), WebView (Android), iframe
//
// This HTML is what gets displayed in the native widget container.
// It's designed to be:
//   - Beautiful at a glance (2 seconds)
//   - Battery-efficient (no JS = no CPU)
//   - Small payload (< 3KB total)
//   - Stable (no layout shifts, no hydration)

import { ReflectionWidgetPayload } from '../types';

// ─── Types ──────────────────────────────────

export type WidgetSize = 'small' | 'medium';

export interface ReflectionWidgetRenderOptions {
  payload: ReflectionWidgetPayload;
  size: WidgetSize;
  /** User's plan — PREMIUM gets category accent */
  plan?: string;
}

// ─── Color Palette ──────────────────────────
//
// Premium dark palette inspired by Headspace/Oura.
// Warm undertones — not cold blue-black, not pure black.
// Feels calm, intimate, present.

const COLORS = {
  // Background
  bgPrimary:     '#0C0C14',   // Deep dark with slight blue
  bgSecondary:   '#12121C',   // Slightly lighter for depth

  // Text
  textPrimary:   '#E8E4DF',   // Warm off-white — not pure white (too harsh)
  textSecondary: '#8A8694',   // Muted lavender-gray
  textTertiary:  '#5A5666',   // Very subtle, for branding

  // Accent (PREMIUM only)
  accentChampagne: '#b8995e',  // Champagne-soft — calm luxury, not flashy
  accentSage:    '#7B9E87',   // Sage green — natural calm
  accentRose:    '#B08E9E',   // Muted rose — soft warmth

  // Separator
  separator:     '#1E1E2A',   // Barely visible divider
} as const;

// ─── Category Accent Mapping ────────────────
//
// PREMIUM feature: each reflection category gets a
// subtle accent color for visual variety.
// These are intentionally muted — not saturated.

const CATEGORY_ACCENTS: Record<string, string> = {
  disciplina:    COLORS.accentChampagne,
  claridad:      COLORS.accentSage,
  presencia:     COLORS.accentRose,
  enfoque:       COLORS.accentChampagne,
  'propósito':   COLORS.accentSage,
  crecimiento:   COLORS.accentRose,
  bienestar:     COLORS.accentSage,
  mente:         COLORS.accentChampagne,
};

// ─── Typography ─────────────────────────────
//
// System font stack for maximum compatibility.
// No web font loading (avoids FOUT, network requests, battery).

const FONT_STACK = `
  -apple-system,
  BlinkMacSystemFont,
  'SF Pro Display',
  'Segoe UI',
  'Noto Sans SC',
  system-ui,
  sans-serif
`.trim();

// ─── Text Processing ────────────────────────
//
// Smartly truncate long reflections for small widgets.
// Never cut mid-word. Add ellipsis gracefully.

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── CSS Generation ─────────────────────────

function generateBaseCSS(): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    body {
      font-family: ${FONT_STACK};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background: ${COLORS.bgPrimary};
      color: ${COLORS.textPrimary};
    }

    .widget {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    /* Subtle ambient glow — PREMIUM only */
    .widget::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -20%;
      width: 60%;
      height: 60%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(184, 153, 94, 0.03) 0%, transparent 70%);
      pointer-events: none;
    }

    .label {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: ${COLORS.textSecondary};
      margin-bottom: 12px;
    }

    .reflection-text {
      font-size: 15px;
      font-weight: 300;
      line-height: 1.6;
      color: ${COLORS.textPrimary};
      flex: 1;
      display: flex;
      align-items: flex-start;
      padding-top: 4px;
    }

    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid ${COLORS.separator};
    }

    .brand-name {
      font-size: 9px;
      font-weight: 400;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: ${COLORS.textTertiary};
    }

    .brand-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: ${COLORS.textTertiary};
      opacity: 0.4;
    }
  `;
}

function generateSmallCSS(accentColor?: string): string {
  const accentLine = accentColor
    ? `border-left: 2px solid ${accentColor}; padding-left: 12px;`
    : '';

  return `
    .widget {
      padding: 16px;
    }

    .label {
      font-size: 8px;
      letter-spacing: 1.2px;
      margin-bottom: 10px;
    }

    .reflection-text {
      font-size: 13px;
      line-height: 1.55;
      ${accentLine}
    }

    .brand {
      margin-top: auto;
      padding-top: 10px;
    }

    .brand-name {
      font-size: 7px;
      letter-spacing: 1.5px;
    }
  `;
}

function generateMediumCSS(accentColor?: string): string {
  const accentLine = accentColor
    ? `border-left: 2px solid ${accentColor}; padding-left: 16px;`
    : '';

  return `
    .reflection-text {
      font-size: 15px;
      line-height: 1.65;
      ${accentLine}
    }

    /* Medium widget: show category if PREMIUM */
    .category {
      font-size: 9px;
      font-weight: 400;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: ${accentColor || COLORS.textSecondary};
      margin-top: 8px;
      opacity: 0.7;
    }
  `;
}

// ─── HTML Generation ────────────────────────

function generateSmallHtml(payload: ReflectionWidgetPayload, plan?: string): string {
  const accentColor = plan === 'PREMIUM' && payload.category
    ? CATEGORY_ACCENTS[payload.category] || undefined
    : undefined;

  const maxChars = 120; // Small widget: ~2 lines
  const text = escapeHtml(truncateText(payload.text, maxChars));

  return `
    <div class="widget">
      <div class="label">${escapeHtml(payload.label)}</div>
      <div class="reflection-text">${text}</div>
      <div class="brand">
        <span class="brand-name">VitaZen</span>
        <span class="brand-dot"></span>
      </div>
    </div>
  `;
}

function generateMediumHtml(payload: ReflectionWidgetPayload, plan?: string): string {
  const accentColor = plan === 'PREMIUM' && payload.category
    ? CATEGORY_ACCENTS[payload.category] || undefined
    : undefined;

  const maxChars = 220; // Medium widget: ~4 lines
  const text = escapeHtml(truncateText(payload.text, maxChars));
  const showCategory = plan === 'PREMIUM' && payload.category;

  return `
    <div class="widget">
      <div class="label">${escapeHtml(payload.label)}</div>
      <div class="reflection-text">${text}</div>
      ${showCategory ? `<div class="category">${escapeHtml(payload.category!)}</div>` : ''}
      <div class="brand">
        <span class="brand-name">VitaZen</span>
        <span class="brand-dot"></span>
      </div>
    </div>
  `;
}

// ─── Main Export ─────────────────────────────

/**
 * Generate complete standalone HTML for the Reflection Widget.
 *
 * This HTML:
 *   - Has ZERO JavaScript (battery-safe)
 *   - Has ZERO external dependencies (works offline once loaded)
 *   - Has ZERO network requests after initial load
 *   - Uses system fonts (no FOUT, no font loading)
 *   - Is fully self-contained (inline CSS only)
 *
 * Compatible with:
 *   - iOS WidgetKit WKWebView
 *   - Android Glance WebView
 *   - PWA widget containers
 *   - Browser iframes
 */
export function renderReflectionWidget(
  options: ReflectionWidgetRenderOptions,
): string {
  const { payload, size, plan } = options;

  const accentColor = plan === 'PREMIUM' && payload.category
    ? CATEGORY_ACCENTS[payload.category] || undefined
    : undefined;

  const baseCSS = generateBaseCSS();
  const sizeCSS = size === 'small'
    ? generateSmallCSS(accentColor)
    : generateMediumCSS(accentColor);

  const bodyHTML = size === 'small'
    ? generateSmallHtml(payload, plan)
    : generateMediumHtml(payload, plan);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="color-scheme" content="dark">
  <title>VitaZen</title>
  <style>
    ${baseCSS}
    ${sizeCSS}
  </style>
</head>
<body>
  ${bodyHTML}
</body>
</html>`;
}
