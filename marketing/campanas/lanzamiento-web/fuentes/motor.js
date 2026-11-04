// Utilidades de las composiciones. Cada pieza define window.DURACION y window.render(t) (asíncrona: espera que el
// fotograma de la grabación esté decodificado). produccion/render.cjs llama a window.preparar() con la carpeta de
// cuadros extraídos de cada grabación y su JSON (marcas y toques), y después render(t) para cada fotograma a 30 fps.
const FPS = 30;
const K = 640 / 390; // CSS px de la grabación → px del lienzo
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (t, a, b) => clamp((t - a) / (b - a));
const suave = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const entre = (t, a, b) => suave(lin(t, a, b));
const mezcla = (a, b, k) => a + (b - a) * k;
const $ = (s) => document.querySelector(s);

// Muestra el cuadro de la grabación `nombre` en el instante `ts` (s) dentro del <img>.
async function cuadro(img, nombre, ts) {
  const { dir, total } = window.GRABACIONES[nombre];
  const n = Math.min(total, Math.max(1, Math.round(ts * FPS) + 1));
  const src = `${dir}/f${String(n).padStart(5, '0')}.jpg`;
  if (img.dataset.src !== src) {
    img.dataset.src = src;
    img.src = src;
    await img.decode();
  }
}

// Dibuja el toque `toque` (de la grabación) visto en el instante de la grabación `ts`.
function dibujarToque(el, anillo, toque, ts) {
  if (!toque) {
    el.style.opacity = 0;
    anillo.style.opacity = 0;
    return;
  }
  const d = ts - toque.t; // el toque real ocurre en d = 0,35
  const aparece = entre(d, -0.05, 0.12);
  const se_va = 1 - entre(d, 0.75, 1.0);
  el.style.left = toque.x * K + 'px';
  el.style.top = toque.y * K + 'px';
  el.style.opacity = d < -0.05 || d > 1.0 ? 0 : aparece * se_va;
  const presion = d > 0.3 && d < 0.5 ? 0.88 : 1;
  el.style.transform = `scale(${mezcla(0.6, 1, aparece) * presion})`;
  const a = lin(d, 0.35, 0.85);
  anillo.style.left = el.style.left;
  anillo.style.top = el.style.top;
  anillo.style.opacity = d < 0.35 || d > 0.85 ? 0 : 0.9 * (1 - a);
  anillo.style.transform = `scale(${mezcla(1, 2.2, suave(a))})`;
}

async function listoImagenes() {
  await document.fonts.ready;
  await Promise.all([...document.images].filter((i) => i.getAttribute('src')).map((i) => i.decode().catch(() => {})));
}

window.preparar = (grabaciones) => {
  window.GRABACIONES = grabaciones;
  return window.alPreparar ? window.alPreparar() : null;
};
