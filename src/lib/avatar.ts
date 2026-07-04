// ═══════════════════════════════════════════
// VITAZEN — AVATAR IMAGE PROCESSING
// ═══════════════════════════════════════════
// Client-side avatar processing:
//   - MIME type validation
//   - HEIC/HEIF detection with clear error
//   - Auto-resize to max 512×512
//   - JPEG compression to ~80% quality
//   - Final size cap at 200KB data URL
//
// No Firebase Storage, no S3, no external deps.
// Uses Canvas API — universal browser support.
// ═══════════════════════════════════════════

// ─── Constants ───────────────────────────────────────────

const MAX_DIMENSION = 512;          // px — ample for a 96px avatar + retina
const JPEG_QUALITY = 0.8;           // 80% — visually lossless at avatar size
const MAX_INPUT_SIZE = 10 * 1024 * 1024;  // 10MB input limit (before compression)
const MAX_OUTPUT_SIZE = 200 * 1024;       // 200KB data URL limit after compression

// MIME types we reliably handle via Canvas
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);

// HEIC/HEIF indicators — we detect but cannot convert in-browser
const HEIC_INDICATORS = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'heic',
  'heif',
];

// ─── Types ───────────────────────────────────────────────

export interface AvatarProcessResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface AvatarProcessError {
  reason: 'too_large' | 'heic_not_supported' | 'invalid_type' | 'processing_failed' | 'output_too_large';
  message: string;  // Human-readable Spanish message
}

// ─── Validation ──────────────────────────────────────────

/**
 * Check if a file's type suggests HEIC/HEIF format.
 * HEIC is the default iPhone photo format. Most browsers
 * cannot decode it via FileReader or Canvas, causing silent
 * failures or empty data URLs.
 */
function isHeicFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  // Check MIME type
  for (const indicator of HEIC_INDICATORS) {
    if (type.includes(indicator)) return true;
  }

  // Check file extension (some browsers don't set MIME for HEIC)
  if (name.endsWith('.heic') || name.endsWith('.heif')) return true;

  return false;
}

/**
 * Validate the file before processing.
 * Returns an AvatarProcessError if the file is not acceptable,
 * or null if it looks good.
 */
export function validateAvatarFile(file: File): AvatarProcessError | null {
  // HEIC detection — give a clear, actionable message
  if (isHeicFile(file)) {
    return {
      reason: 'heic_not_supported',
      message: 'Las fotos iPhone (HEIC) no se pueden usar directamente. Conviértela a JPG desde la app Fotos: selecciona la imagen → Compartir → Opciones → Formato más compatible.',
    };
  }

  // Size check (before compression — generous limit)
  if (file.size > MAX_INPUT_SIZE) {
    return {
      reason: 'too_large',
      message: 'La imagen es demasiado grande. El máximo es 10MB.',
    };
  }

  // Empty file guard
  if (file.size === 0) {
    return {
      reason: 'invalid_type',
      message: 'El archivo está vacío.',
    };
  }

  // MIME type validation
  // If the browser provides a type, check it.
  // If type is empty (rare), we let it through — Canvas will fail later if invalid.
  if (file.type && !SUPPORTED_MIME_TYPES.has(file.type) && !file.type.startsWith('image/')) {
    return {
      reason: 'invalid_type',
      message: `Formato no soportado ("${file.type}"). Usa JPG, PNG o WebP.`,
    };
  }

  return null;
}

// ─── Processing ──────────────────────────────────────────

/**
 * Load an image from a File into an HTMLImageElement.
 * Returns a promise that resolves with the loaded image,
 * or rejects if the browser can't decode it.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen. Puede que el formato no sea compatible.'));
    };
    img.src = url;
  });
}

/**
 * Draw an image onto a canvas, resizing if needed.
 * Returns the canvas and the final dimensions.
 */
function drawToCanvas(img: HTMLImageElement): { canvas: HTMLCanvasElement; width: number; height: number } {
  let { naturalWidth: w, naturalHeight: h } = img;

  // If either dimension is 0, the image is broken
  if (w === 0 || h === 0) {
    throw new Error('La imagen tiene dimensiones inválidas.');
  }

  // Scale down if exceeding MAX_DIMENSION, preserving aspect ratio
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible en este navegador.');

  // White background for transparent PNGs (no dark-mode black bleed)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.drawImage(img, 0, 0, w, h);

  return { canvas, width: w, height: h };
}

/**
 * Compress a canvas to a JPEG data URL.
 * Iteratively reduces quality if the output exceeds MAX_OUTPUT_SIZE.
 */
function compressCanvas(canvas: HTMLCanvasElement): string {
  // First try at target quality
  let dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  // If within budget, done
  if (dataUrl.length <= MAX_OUTPUT_SIZE) return dataUrl;

  // Iteratively reduce quality
  const qualities = [0.7, 0.6, 0.5, 0.4, 0.3];
  for (const q of qualities) {
    dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length <= MAX_OUTPUT_SIZE) return dataUrl;
  }

  // Last resort: reduce dimensions by 50% and try again
  const halfCanvas = document.createElement('canvas');
  halfCanvas.width = Math.max(1, Math.round(canvas.width / 2));
  halfCanvas.height = Math.max(1, Math.round(canvas.height / 2));
  const ctx = halfCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, halfCanvas.width, halfCanvas.height);
    dataUrl = halfCanvas.toDataURL('image/jpeg', 0.5);
    if (dataUrl.length <= MAX_OUTPUT_SIZE) return dataUrl;
  }

  return dataUrl; // Return best effort even if over budget
}

// ─── Main Entry Point ────────────────────────────────────

/**
 * Process an avatar image file for upload.
 *
 * 1. Validates format and size
 * 2. Resizes to max 512×512
 * 3. Compresses to JPEG
 * 4. Returns a base64 data URL (≤200KB)
 *
 * If the file is invalid, throws an object with `reason` and `message`.
 */
export async function processAvatar(file: File): Promise<AvatarProcessResult> {
  // Step 1: Validate
  const validationError = validateAvatarFile(file);
  if (validationError) throw validationError;

  // Step 2: Load image
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch (err) {
    throw {
      reason: 'processing_failed',
      message: err instanceof Error ? err.message : 'No se pudo procesar la imagen.',
    } as AvatarProcessError;
  }

  // Step 3: Resize + draw to canvas
  let canvas: HTMLCanvasElement;
  let width: number;
  let height: number;
  try {
    const result = drawToCanvas(img);
    canvas = result.canvas;
    width = result.width;
    height = result.height;
  } catch (err) {
    throw {
      reason: 'processing_failed',
      message: err instanceof Error ? err.message : 'Error al procesar la imagen.',
    } as AvatarProcessError;
  }

  // Step 4: Compress to JPEG data URL
  const dataUrl = compressCanvas(canvas);
  const sizeBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75); // approximate decoded size

  // Warn in console if output is unusually large (but don't block)
  if (dataUrl.length > MAX_OUTPUT_SIZE) {
    console.warn(
      `[Avatar] Output data URL is ${Math.round(dataUrl.length / 1024)}KB, ` +
      `exceeding the ${MAX_OUTPUT_SIZE / 1024}KB target. Image was compressed as much as possible.`
    );
  }

  return { dataUrl, width, height, sizeBytes };
}

// ─── Server-side Validation ──────────────────────────────

/**
 * Validate an avatarUrl value on the server side.
 * Checks that it's a valid data URL with reasonable size.
 * Returns null if valid, or an error string if invalid.
 */
export function validateAvatarUrlServer(avatarUrl: string | null | undefined): string | null {
  if (avatarUrl === undefined || avatarUrl === null || avatarUrl === '') return null; // clearing avatar is fine

  // Must be a data URL
  if (!avatarUrl.startsWith('data:')) {
    return 'avatarUrl debe ser una imagen data URL';
  }

  // Must be JPEG data URL (our processing always outputs JPEG)
  if (!avatarUrl.startsWith('data:image/jpeg;base64,')) {
    return 'Formato de imagen no válido. Solo se permite JPEG.';
  }

  // Size check: data URL should not exceed 300KB
  // (200KB target + base64 overhead + some margin)
  const MAX_DATA_URL_LENGTH = 300 * 1024;
  if (avatarUrl.length > MAX_DATA_URL_LENGTH) {
    return 'Imagen demasiado grande después de compresión. Intenta con una imagen más pequeña.';
  }

  return null;
}
