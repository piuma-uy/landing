// Grabación real de pantalla de teléfono con Playwright (390 × 844 CSS, deviceScaleFactor 3 → 1170 × 2532 px),
// CUADRO A CUADRO a 30 fps con el tiempo controlado (T108c).
//
// Antes se usaba el screencast de Chromium (CDP Page.startScreencast) en tiempo real: a 1170 × 2532 Chromium no llega
// a codificar 30 JPEG por segundo y durante los desplazamientos perdía uno de cada 4–6 cuadros; al pasar a 30 fps
// constantes esos huecos quedaban como cuadros repetidos y el desplazamiento se veía «trancado».
//
// Ahora el tiempo de la página es virtual y sólo avanza cuando el grabador lo dice:
//   - relojes de la página (Date, performance.now, setTimeout, setInterval, requestAnimationFrame) con page.clock,
//     en pausa durante la toma y adelantados exactamente 1/30 s por cuadro;
//   - animaciones y transiciones CSS (Web Animations) con la línea de tiempo de Chromium detenida (CDP
//     Animation.setPlaybackRate 0) y cada una llevada al instante virtual en cada cuadro;
//   - desplazamientos calculados por cuadro (easeInOutCubic) con window.scrollTo instantáneo.
// Cada cuadro es una captura (page.screenshot) tomada cuando la página ya está quieta, así que no se pierde ninguno,
// tarde lo que tarde la captura. Lo que espera red (navegación, API) avanza cuadro a cuadro igual que el resto.
// Al lado del MP4 queda un JSON con marcas (cortes del montaje) y toques (posición en CSS px).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pw = process.env.PLAYWRIGHT_MODULE ? path.resolve(process.env.PLAYWRIGHT_MODULE) : 'playwright';
const { chromium } = require(pw);

const VIEWPORT = { width: 390, height: 844 };
const ESCALA = 3;
const FPS = 30;

const FUENTES = path.join(__dirname, '..', 'fuentes', 'fonts');
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CSS_FUENTES = [
  ['Inter', 'normal', 400, 'inter-latin-400-normal'],
  ['Inter', 'normal', 500, 'inter-latin-500-normal'],
  ['Inter', 'normal', 600, 'inter-latin-600-normal'],
  ['Playfair Display', 'normal', 500, 'playfair-display-latin-500-normal'],
  ['Playfair Display', 'normal', 600, 'playfair-display-latin-600-normal'],
  ['Playfair Display', 'normal', 700, 'playfair-display-latin-700-normal'],
  ['Playfair Display', 'italic', 500, 'playfair-display-latin-500-italic'],
]
  .map(([familia, estilo, peso, archivo]) => {
    const datos = fs.readFileSync(path.join(FUENTES, archivo + '.woff2')).toString('base64');
    return `@font-face{font-family:'${familia}';font-style:${estilo};font-weight:${peso};font-display:swap;` +
      `src:url(data:font/woff2;base64,${datos}) format('woff2');unicode-range:${LATIN};}`;
  })
  .join('\n');

async function abrir() {
  // Sin QUIC: en esta red las fuentes de fonts.gstatic.com quedaban colgadas por HTTP/3.
  const browser = await chromium.launch({ args: ['--disable-quic'] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: ESCALA,
    isMobile: true,
    hasTouch: true,
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    // Sin PostHog: la grabación no debe ensuciar la analítica real.
    serviceWorkers: 'block',
    // La CSP de piuma.uy (font-src 'self' fonts.gstatic.com) no deja usar las fuentes locales en data:. Sólo afecta
    // a este navegador que graba; la web no se toca.
    bypassCSP: true,
  });
  await context.route(/posthog\.com/, (r) => r.abort());
  // Fuentes de la web (Inter 400/500/600 y Playfair Display 500/600/700 de Google Fonts) servidas desde
  // fuentes/fonts/ (los mismos archivos latinos, OFL): la toma no depende de la red y ningún texto cambia de fuente
  // a mitad de la grabación.
  await context.route(/fonts\.googleapis\.com\/css2/, (r) => r.fulfill({ contentType: 'text/css', body: CSS_FUENTES }));
  await context.route(/fonts\.gstatic\.com/, (r) => r.abort());
  // Relojes falsos desde el primer script; corren solos hasta que empieza la toma.
  await context.clock.install();
  // Sin desplazamiento suave nativo: el grabador mueve la página cuadro a cuadro.
  // El build de producción (https://piuma.uy) trae el CSS de Google Fonts INLINE en el index.html, así que la ruta de
  // css2 no se usa y, con gstatic cortado, la web caía a fuentes del sistema (T108d). Las mismas @font-face locales
  // van también al final del <head>: con descriptores iguales gana la última declarada.
  await context.addInitScript((css) => {
    const poner = () => {
      const s = document.createElement('style');
      s.textContent = 'html, body, * { scroll-behavior: auto !important; }\n' + css;
      document.head.appendChild(s);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner);
    else poner();
  }, CSS_FUENTES);
  const page = await context.newPage();
  return { browser, context, page };
}

// Carga ya las imágenes diferidas y las fuentes de la página, para que nada aparezca a medias durante la toma.
async function precargar(page) {
  await page.evaluate(async () => {
    for (const i of document.images) if (i.loading === 'lazy') i.loading = 'eager';
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => (i.onload = i.onerror = r)))));
  });
}

class Grabador {
  constructor(page) {
    this.page = page;
    this.n = 0; // cuadros capturados
    this.marcas = {};
    this.toques = [];
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piuma-grabacion-'));
  }

  async empezar() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.cdp.send('Animation.enable');
    await this.cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    const ahora = await this.page.evaluate(() => Date.now());
    await this.page.clock.pauseAt(ahora + 100);
    await this.cuadro();
  }

  // Tiempo virtual de la toma (s) = cuadros ya capturados / 30. El cuadro n se ve en t = n / 30.
  ahora() {
    return this.n / FPS;
  }

  marca(nombre) {
    this.marcas[nombre] = +this.ahora().toFixed(3);
    console.log(`marca ${nombre} ${this.marcas[nombre]} s`);
  }

  // Lleva las animaciones Web Animations / CSS al instante virtual y captura el cuadro n.
  async cuadro() {
    const vt = this.ahora() * 1000;
    await this.page.evaluate((vt) => {
      const inicio = (window.__grabadorAnim ??= new WeakMap());
      for (const a of document.getAnimations()) {
        // Las animaciones ligadas al scroll (ScrollTimeline/ViewTimeline) ya siguen al desplazamiento por cuadro.
        if (a.timeline !== document.timeline) continue;
        if (!inicio.has(a)) inicio.set(a, vt - Math.max(0, Number(a.currentTime) || 0));
        const t = vt - inicio.get(a);
        const fin = a.effect?.getComputedTiming().endTime;
        if (Number.isFinite(fin) && t >= fin) a.finish();
        else a.currentTime = t;
      }
    }, vt);
    // La captura espera un fotograma real del compositor, así que estilos, layout y scroll ya están aplicados.
    await this.page.screenshot({ path: path.join(this.dir, `f${String(this.n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 });
    this.n++;
  }

  // Avanza un cuadro: relojes de la página + 1/30 s (33 o 34 ms, sin acumular error) y captura.
  async paso() {
    const ms = Math.round((this.n * 1000) / FPS) - Math.round(((this.n - 1) * 1000) / FPS);
    await this.page.clock.runFor(ms);
    await this.cuadro();
  }

  async esperar(ms) {
    const fin = this.n + Math.round((ms / 1000) * FPS);
    while (this.n < fin) await this.paso();
  }

  // Avanza cuadro a cuadro mientras corre una acción de Playwright que espera algo de la página (navegación, red,
  // un texto que aparece). La página sigue viva en tiempo virtual y la toma registra lo que pasa de verdad.
  async durante(promesa, maxCuadros = 300) {
    let listo = false;
    let error;
    const p = Promise.resolve(promesa).then(
      (v) => ((listo = true), v),
      (e) => ((listo = true), (error = e)),
    );
    for (let i = 0; !listo; i++) {
      if (i >= maxCuadros) throw new Error('durante: la página no respondió');
      await this.paso();
    }
    if (error) throw error;
    return p;
  }

  // Anota el toque (centro del elemento, en CSS px del viewport), deja 350 ms para que el montaje muestre el
  // círculo antes de la respuesta de la página y toca de verdad (eventos touch).
  async tocar(locator, nombre) {
    await locator.scrollIntoViewIfNeeded();
    const caja = await locator.boundingBox();
    if (!caja) throw new Error(`Sin caja para tocar: ${nombre}`);
    const x = caja.x + caja.width / 2;
    const y = caja.y + caja.height / 2;
    this.toques.push({ nombre, t: +this.ahora().toFixed(3), x: +x.toFixed(1), y: +y.toFixed(1) });
    await this.esperar(350);
    await this.page.touchscreen.tap(x, y);
  }

  // Desplazamiento suave y determinista (easeInOutCubic), un scrollTo instantáneo por cuadro.
  async desplazar(destino, ms = 700) {
    const { y0, y1 } = await this.page.evaluate((destino) => ({
      y0: window.scrollY,
      y1: Math.max(0, Math.min(destino, document.documentElement.scrollHeight - innerHeight)),
    }), destino);
    const cuadros = Math.max(1, Math.round((ms / 1000) * FPS));
    for (let i = 1; i <= cuadros; i++) {
      const k = i / cuadros;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await this.page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y0 + (y1 - y0) * e);
      await this.paso();
    }
  }

  async desplazarA(locator, arriba = 120, ms = 700) {
    const y = await locator.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    await this.desplazar(y - arriba, ms);
  }

  async terminar(salida) {
    const r = spawnSync(
      'ffmpeg',
      ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(this.dir, 'f%05d.jpg'),
        '-vf', 'scale=1170:2532:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
        '-r', String(FPS), '-movflags', '+faststart', salida + '.mp4'],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) throw new Error('ffmpeg falló al armar la grabación');
    const duracion = +(this.n / FPS).toFixed(3);
    const meta = { viewport: VIEWPORT, escala: ESCALA, fps: FPS, duracion, marcas: this.marcas, toques: this.toques };
    fs.writeFileSync(salida + '.json', JSON.stringify(meta, null, 2) + '\n');
    fs.rmSync(this.dir, { recursive: true, force: true });
    console.log(`ok ${salida}.mp4 (${this.n} cuadros, ${duracion} s, cuadro a cuadro)`);
  }
}

module.exports = { abrir, precargar, Grabador, VIEWPORT, ESCALA, FPS };
