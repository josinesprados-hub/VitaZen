// @vitest-environment jsdom
/**
 * E-2 — Coherencia de Energía: feedback honesto + rating accesible + datos visibles.
 *
 * H-2 (UI)   — con createdAt en la respuesta del GET, la fila Wellness muestra la
 *              hora; sin él cae al fallback "—" (síntoma documentado del defecto).
 *              Nutrition no se rompe (sigue mostrando su hora).
 * H-3        — los seis flujos de escritura (POST/PUT/DELETE × wellness/nutrition)
 *              anuncian el fallo con role="alert" y un mensaje fijo y breve; el
 *              feedback NO depende de console.error (que se conserva para
 *              debugging); no se exponen detalles internos del servidor; el
 *              diálogo de borrado solo se cierra cuando el borrado tuvo éxito, y
 *              un reintento con éxito limpia el error y completa la operación.
 * H-4        — RatingInput replica el patrón ARIA radio consolidado de
 *              CheckInModal.ValueSlider: radiogroup con nombre, roving tabindex
 *              (un único tab stop por grupo), ArrowRight/ArrowUp incrementan,
 *              ArrowLeft/ArrowDown decrementan, siempre clampeado al rango 1–5,
 *              y aria-checked marcando exactamente un radio.
 * H-8        — la página delega el refresco de día en useMadridDayRefresh: el
 *              hook se registra y UNA transición dispara EXACTAMENTE una ronda
 *              de refetch (GET wellness + GET nutrition), sin mutaciones.
 *              (El comportamiento DST-exacto del watcher real se prueba en
 *              energy-e2-madrid-refresh.test.tsx.)
 */

import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnergiaPage from '@/app/(dashboard)/imperio/energia/page';

// ─── Mocks (hoisted) ─────────────────────────────────────────

const H = vi.hoisted(() => {
  const apiFetch = vi.fn();
  const madridRefreshCb = { fn: null as null | (() => void) };
  return { apiFetch, madridRefreshCb };
});

vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ apiFetch: H.apiFetch }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', privacyStatsVisible: true } }),
}));
vi.mock('@/context/ScreenshotModeContext', () => ({
  useScreenshotMode: () => ({ displayUser: null, isActive: () => false }),
}));
// H-8: se captura el callback que la página registra en el hook. El
// comportamiento del hook/watcher REAL se cubre en su propio test file.
vi.mock('@/hooks/useMadridDayRefresh', () => ({
  useMadridDayRefresh: (cb: () => void) => { H.madridRefreshCb.fn = cb; },
}));
// EmpireTipsSection haría su propio apiFetch(`/api/empire/tips...`) — fuera
// de alcance para estos tests: se stubbea para aislar el comportamiento de
// la página.
vi.mock('@/components/ui/EmpireTipsSection', () => ({
  default: () => <div data-testid="tips-stub" />,
}));

// ─── Fixtures ────────────────────────────────────────────────

const SAVE_MSG = 'No se pudo guardar. Inténtalo de nuevo.';
const UPDATE_MSG = 'No se pudo actualizar. Inténtalo de nuevo.';
const DELETE_MSG = 'No se pudo eliminar. Inténtalo de nuevo.';

const WELLNESS_LOG = {
  id: 'wl-1',
  date: '2026-09-07T10:00:00.000Z',
  mood: 3,
  energy: 3,
  sleep: 3,
  stress: 3,
  notes: null,
  createdAt: '2026-09-07T10:30:00.000Z',
};

const NUTRITION_LOG = {
  id: 'nl-1',
  date: '2026-09-07T10:00:00.000Z',
  meals: 'Comida',
  water: 6,
  calories: 2100,
  notes: null,
  createdAt: '2026-09-07T11:00:00.000Z',
};

// ─── Helpers ─────────────────────────────────────────────────

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
}

function fail(status = 500, json: unknown = { error: 'Internal server error' }) {
  return { ok: false, status, json: async () => json } as unknown as Response;
}

type WriteHandler = (path: string, method: string) => Response;

/**
 * Instala el mock de apiFetch: los GET de carga devuelven los logs dados y
 * cualquier escritura se delega en writeHandler (o falla con "unexpected").
 */
function installFetches(wellnessLogs: unknown[], nutritionLogs: unknown[], writeHandler?: WriteHandler) {
  H.apiFetch.mockImplementation(async (path: string, options?: RequestInit) => {
    const method = (options?.method || 'GET').toUpperCase();
    if (method === 'GET' && path === '/api/wellness') return ok({ logs: wellnessLogs });
    if (method === 'GET' && path === '/api/nutrition') return ok({ logs: nutritionLogs });
    if (writeHandler) return writeHandler(path, method);
    throw new Error(`unexpected apiFetch ${method} ${path}`);
  });
}

/** h2 → div.flex (fila) → sección (div.bg-[#0a0a0a]) */
function sectionOf(heading: string): HTMLElement {
  const h = screen.getByText(heading);
  return h.parentElement!.parentElement! as HTMLElement;
}

async function renderLoadedPage(wellnessLogs: unknown[] = [], nutritionLogs: unknown[] = [], writeHandler?: WriteHandler) {
  installFetches(wellnessLogs, nutritionLogs, writeHandler);
  render(<EnergiaPage />);
  await screen.findByText('Registro de Bienestar');
}

async function openWellnessForm() {
  const user = userEvent.setup();
  const wellnessSection = sectionOf('Registro de Bienestar');
  await user.click(within(wellnessSection).getByRole('button', { name: '+ Registrar hoy' }));
  return { user, wellnessSection };
}

async function openNutritionForm() {
  const user = userEvent.setup();
  const nutritionSection = sectionOf('Registro Nutricional');
  await user.click(within(nutritionSection).getByRole('button', { name: '+ Registrar hoy' }));
  return { user, nutritionSection };
}

function radiosOf(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
}

function checkedOf(group: HTMLElement): HTMLElement {
  const checked = radiosOf(group).filter((r) => r.getAttribute('aria-checked') === 'true');
  expect(checked).toHaveLength(1);
  return checked[0];
}

beforeEach(() => {
  // console.error se conserva en el código para debugging; aquí se silencia
  // para no ensuciar la salida — los asserts de feedback son el role="alert".
  vi.spyOn(console, 'error').mockImplementation(() => {});
  H.madridRefreshCb.fn = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════
// H-3 — feedback visible de errores en los seis flujos
// ══════════════════════════════════════════════════════════════

describe('E-2 H-3 — POST Wellness con error → mensaje visible (role="alert")', () => {
  it('respuesta !ok → alert con texto exacto; el formulario sigue abierto; console.error se mantiene para debugging', async () => {
    await renderLoadedPage([], [], () => fail());
    const { user, wellnessSection } = await openWellnessForm();

    await user.click(within(wellnessSection).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(SAVE_MSG);
    // El usuario puede reintentar: el formulario no se cerró como si nada.
    expect(within(wellnessSection).getByRole('button', { name: 'Guardar' })).toBeTruthy();
    // El feedback no depende del log: visible AUNQUE console.error también dispare.
    expect(console.error).toHaveBeenCalled();
  });

  it('fallo de red (apiFetch rechaza) → la misma alert visible', async () => {
    // Solo la ESCRITURA rechaza; los GET de carga responden con éxito.
    H.apiFetch.mockImplementation(async (path: string, options?: RequestInit) => {
      const method = (options?.method || 'GET').toUpperCase();
      if (method === 'GET' && path === '/api/wellness') return ok({ logs: [] });
      if (method === 'GET' && path === '/api/nutrition') return ok({ logs: [] });
      return Promise.reject(new TypeError('fetch failed'));
    });
    render(<EnergiaPage />);
    await screen.findByText('Registro de Bienestar');
    const { user, wellnessSection } = await openWellnessForm();

    await user.click(within(wellnessSection).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(SAVE_MSG);
    expect(within(wellnessSection).getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });

  it('reintento con éxito → la alert desaparece, el formulario se cierra y el registro aparece', async () => {
    let failNext = true;
    await renderLoadedPage([], [], () => (failNext ? fail() : ok({ log: WELLNESS_LOG, newlyUnlocked: [] })));
    const { user, wellnessSection } = await openWellnessForm();

    await user.click(within(wellnessSection).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    failNext = false;
    await user.click(within(wellnessSection).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    // Formulario cerrado (operación completada) y fila visible con sus botones.
    expect(within(wellnessSection).queryByRole('button', { name: 'Guardar' })).toBeNull();
    expect(within(wellnessSection).getByRole('button', { name: /^Editar registro de bienestar/ })).toBeTruthy();
  });
});

describe('E-2 H-3 — POST Nutrition con error → mensaje visible (role="alert")', () => {
  it('respuesta !ok → alert con texto exacto; el formulario sigue abierto', async () => {
    await renderLoadedPage([], [], () => fail());
    const { user, nutritionSection } = await openNutritionForm();

    await user.click(within(nutritionSection).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(SAVE_MSG);
    expect(within(nutritionSection).getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });
});

describe('E-2 H-3 — PUT Wellness con error → mensaje visible dentro del diálogo', () => {
  it('respuesta !ok → alert "actualizar"; el diálogo de edición sigue abierto', async () => {
    await renderLoadedPage([WELLNESS_LOG], [], () => fail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Editar registro de bienestar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar bienestar' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(UPDATE_MSG);
    expect(screen.getByRole('dialog', { name: 'Editar bienestar' })).toBeTruthy();
  });

  it('fallo de red → la misma alert dentro del diálogo', async () => {
    installFetches([WELLNESS_LOG], []);
    H.apiFetch.mockImplementation((path: string, options?: RequestInit) => {
      const method = (options?.method || 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(ok({ logs: [WELLNESS_LOG] }));
      return Promise.reject(new TypeError('fetch failed'));
    });
    render(<EnergiaPage />);
    await screen.findByText('Registro de Bienestar');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Editar registro de bienestar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar bienestar' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(UPDATE_MSG);
  });
});

describe('E-2 H-3 — PUT Nutrition con error → mensaje visible dentro del diálogo', () => {
  it('respuesta !ok → alert "actualizar"; el diálogo de edición sigue abierto', async () => {
    await renderLoadedPage([], [NUTRITION_LOG], () => fail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Editar registro nutricional/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar nutrición' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(UPDATE_MSG);
    expect(screen.getByRole('dialog', { name: 'Editar nutrición' })).toBeTruthy();
  });
});

describe('E-2 H-3 — DELETE con error → el diálogo permanece y anuncia el fallo', () => {
  it('DELETE Wellness !ok → alert "eliminar"; el registro NO desaparece', async () => {
    await renderLoadedPage([WELLNESS_LOG], [], () => fail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Eliminar registro de bienestar/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar registro' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(DELETE_MSG);
    // El diálogo NO se cierra como si hubiera tenido éxito...
    expect(screen.getByRole('alertdialog', { name: 'Eliminar registro' })).toBeTruthy();
    // ...y el registro sigue ahí (el usuario puede reintentar o cancelar).
    expect(screen.getByRole('button', { name: /^Editar registro de bienestar/ })).toBeTruthy();
  });

  it('DELETE Nutrition !ok → alert "eliminar"; el registro NO desaparece', async () => {
    await renderLoadedPage([], [NUTRITION_LOG], () => fail());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Eliminar registro nutricional/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar registro' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(DELETE_MSG);
    expect(screen.getByRole('alertdialog', { name: 'Eliminar registro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Editar registro nutricional/ })).toBeTruthy();
  });

  it('DELETE con éxito → el diálogo se cierra y la fila desaparece (regresión del cierre movido al éxito)', async () => {
    await renderLoadedPage([WELLNESS_LOG], [], () => ok({ success: true }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Eliminar registro de bienestar/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar registro' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Eliminar registro' })).toBeNull());
    expect(screen.queryByRole('button', { name: /^Editar registro de bienestar/ })).toBeNull();
  });

  it('los mensajes nunca contienen detalles internos del servidor', async () => {
    await renderLoadedPage([], [], () => fail(500, { error: 'db connection string postgres://secret@host' }));
    const { user, wellnessSection } = await openWellnessForm();

    await user.click(within(wellnessSection).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const text = screen.getByRole('alert').textContent || '';
    expect(text).toBe(SAVE_MSG);
    expect(text).not.toMatch(/postgres|secret|error|Error/);
  });
});

// ══════════════════════════════════════════════════════════════
// H-4 — RatingInput accesible (patrón ARIA radio de CheckInModal)
// ══════════════════════════════════════════════════════════════

describe('E-2 H-4 — RatingInput: radiogroup con roving tabindex y flechas', () => {
  it('radiogroup nombrado con 5 radios, exactamente uno marcado y un único tab stop', async () => {
    await renderLoadedPage();
    const { wellnessSection } = await openWellnessForm();
    const group = within(wellnessSection).getByRole('radiogroup', { name: 'Estado de ánimo' });

    const radios = radiosOf(group);
    expect(radios).toHaveLength(5);
    // Un solo valor seleccionado (por defecto 3)...
    expect(checkedOf(group).textContent).toBe('3');
    // ...y un único elemento tabbable: el seleccionado (roving tabindex).
    const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].textContent).toBe('3');
    expect(radios.filter((r) => r.getAttribute('tabindex') === '-1')).toHaveLength(4);
  });

  it('ArrowRight/ArrowUp incrementan; ArrowLeft/ArrowDown decrementan; nunca sale del rango 1–5', async () => {
    await renderLoadedPage();
    const { wellnessSection } = await openWellnessForm();
    const group = within(wellnessSection).getByRole('radiogroup', { name: 'Estado de ánimo' });

    fireEvent.keyDown(checkedOf(group), { key: 'ArrowRight' });
    expect(checkedOf(group).textContent).toBe('4');
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowUp' });
    expect(checkedOf(group).textContent).toBe('5');
    // Límite superior: ni flecha derecha ni arriba pasan de 5.
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowRight' });
    expect(checkedOf(group).textContent).toBe('5');
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowUp' });
    expect(checkedOf(group).textContent).toBe('5');

    fireEvent.keyDown(checkedOf(group), { key: 'ArrowLeft' });
    expect(checkedOf(group).textContent).toBe('4');
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowDown' });
    expect(checkedOf(group).textContent).toBe('3');
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowLeft' });
    expect(checkedOf(group).textContent).toBe('2');
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowLeft' });
    expect(checkedOf(group).textContent).toBe('1');
    // Límite inferior: ni flecha izquierda ni abajo bajan de 1.
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowLeft' });
    expect(checkedOf(group).textContent).toBe('1');
    fireEvent.keyDown(checkedOf(group), { key: 'ArrowDown' });
    expect(checkedOf(group).textContent).toBe('1');
  });

  it('el tab stop rota con el valor: solo el radio marcado tiene tabindex=0', async () => {
    await renderLoadedPage();
    const { wellnessSection } = await openWellnessForm();
    const group = within(wellnessSection).getByRole('radiogroup', { name: 'Estado de ánimo' });

    fireEvent.keyDown(checkedOf(group), { key: 'ArrowRight' });
    const tabbable = radiosOf(group).filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].textContent).toBe('4');
    expect(tabbable[0].getAttribute('aria-checked')).toBe('true');
  });

  it('selección con ratón: click en 5 lo marca', async () => {
    await renderLoadedPage();
    const { user, wellnessSection } = await openWellnessForm();
    const group = within(wellnessSection).getByRole('radiogroup', { name: 'Energía' });

    await user.click(radiosOf(group)[4]);
    expect(checkedOf(group).textContent).toBe('5');
  });

  it('el mismo patrón se aplica en el diálogo de edición (misma instancia de componente)', async () => {
    await renderLoadedPage([WELLNESS_LOG], []);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Editar registro de bienestar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar bienestar' });

    const group = within(dialog).getByRole('radiogroup', { name: 'Sueño' });
    expect(radiosOf(group)).toHaveLength(5);
    expect(radiosOf(group).filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);

    fireEvent.keyDown(checkedOf(group), { key: 'ArrowRight' });
    expect(checkedOf(group).textContent).toBe('4');
  });
});

// ══════════════════════════════════════════════════════════════
// H-2 (UI) — la hora de Wellness deja de ser "—" cuando hay createdAt
// ══════════════════════════════════════════════════════════════

describe('E-2 H-2 — la UI muestra la hora cuando el GET devuelve createdAt', () => {
  it('fila Wellness con createdAt → hora visible (HH:MM), sin fallback', async () => {
    await renderLoadedPage([WELLNESS_LOG], []);
    const wellnessSection = sectionOf('Registro de Bienestar');
    expect(wellnessSection.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('fila Wellness SIN createdAt (shape antiguo) → sigue cayendo al fallback "—"', async () => {
    const { createdAt, ...legacy } = WELLNESS_LOG;
    await renderLoadedPage([legacy], []);
    const wellnessSection = sectionOf('Registro de Bienestar');
    expect(wellnessSection.textContent).toContain('—');
  });

  it('Nutrition no se rompe: su createdAt sigue renderizando la hora', async () => {
    await renderLoadedPage([], [NUTRITION_LOG]);
    const nutritionSection = sectionOf('Registro Nutricional');
    expect(nutritionSection.textContent).toMatch(/\d{1,2}:\d{2}/);
  });
});

// ══════════════════════════════════════════════════════════════
// H-8 — delegación del refresco de día en useMadridDayRefresh
// ══════════════════════════════════════════════════════════════

describe('E-2 H-8 — el refresco de día pasa por useMadridDayRefresh', () => {
  it('el hook se registra al montar la página', async () => {
    await renderLoadedPage();
    expect(typeof H.madridRefreshCb.fn).toBe('function');
  });

  it('una transición de día dispara EXACTAMENTE una ronda de refetch (GET wellness + GET nutrition), sin mutaciones', async () => {
    await renderLoadedPage([WELLNESS_LOG], [NUTRITION_LOG]);
    H.apiFetch.mockClear();

    H.madridRefreshCb.fn!();

    await waitFor(() => expect(H.apiFetch).toHaveBeenCalledTimes(2));
    const calls = H.apiFetch.mock.calls.map(([p, o]: any[]) => `${(o?.method || 'GET').toUpperCase()} ${p}`);
    // Sin doble refresh: una sola transición = una sola ronda de dos GET.
    expect(calls).toEqual(['GET /api/wellness', 'GET /api/nutrition']);
  });

  it('dos transiciones → dos rondas (una por transición), nunca acumuladas', async () => {
    await renderLoadedPage();
    H.apiFetch.mockClear();

    H.madridRefreshCb.fn!();
    await waitFor(() => expect(H.apiFetch).toHaveBeenCalledTimes(2));

    H.madridRefreshCb.fn!();
    await waitFor(() => expect(H.apiFetch).toHaveBeenCalledTimes(4));
    const methods = H.apiFetch.mock.calls.map(([p, o]: any[]) => (o?.method || 'GET').toUpperCase());
    expect(methods.every((m: string) => m === 'GET')).toBe(true);
  });
});
