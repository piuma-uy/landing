// Grabación real de pantalla de teléfono con Playwright (390 × 844 CSS, deviceScaleFactor 3 → 1170 × 2532 px).
// Usa el screencast de Chromium (CDP Page.startScreencast): cada fotograma llega con su marca de tiempo cuando la
// pantalla cambia. Al cerrar se arma un video de 30 fps constantes repitiendo el último fotograma hasta el siguiente,
// así el tiempo del video es el tiempo real de la grabación. Además se anotan marcas (cortes del montaje) y toques
// (posición en CSS px) en un JSON al lado del MP4, para que el montaje dibuje el toque y acerque la cámara.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pw = process.env.PLAYWRIGHT_MODULE ? path.resolve(process.env.PLAYWRIGHT_MODULE) : 'playwright';
const { chromium } = require(pw);

const VIEWPORT = { width: 390, height: 844 };
const ESCALA = 3;
const FPS = 30;

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
  });
  await context.route(/posthog\.com/, (r) => r.abort());
  const page = await context.newPage();
  return { browser, context, page };
}

class Grabador {
  constructor(page) {
    this.page = page;
    this.cuadros = [];
    this.marcas = {};
    this.toques = [];
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piuma-grabacion-'));
  }

  async empezar() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async (f) => {
      const archivo = path.join(this.dir, `f${String(this.cuadros.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(archivo, Buffer.from(f.data, 'base64'));
      this.cuadros.push({ t: f.metadata.timestamp, archivo });
      await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 95,
      maxWidth: VIEWPORT.width * ESCALA,
      maxHeight: VIEWPORT.height * ESCALA,
      everyNthFrame: 1,
    });
    // Fuerza un primer cuadro y fija el origen del tiempo.
    await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await this.esperar(300);
    this.origen = this.cuadros.length ? this.cuadros[0].t : Date.now() / 1000;
  }

  ahora() {
    return Date.now() / 1000 - this.origen;
  }

  marca(nombre) {
    this.marcas[nombre] = +this.ahora().toFixed(3);
    console.log(`marca ${nombre} ${this.marcas[nombre]} s`);
  }

  esperar(ms) {
    return this.page.waitForTimeout(ms);
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

  // Desplazamiento suave y determinista (easeInOutCubic) hasta que el elemento quede a `arriba` px del borde.
  async desplazar(destino, ms = 700) {
    await this.page.evaluate(
      ({ destino, ms }) =>
        new Promise((r) => {
          const y0 = window.scrollY;
          const y1 = Math.max(0, Math.min(destino, document.documentElement.scrollHeight - innerHeight));
          const t0 = performance.now();
          const paso = (ahora) => {
            const k = Math.min(1, (ahora - t0) / ms);
            const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
            window.scrollTo(0, y0 + (y1 - y0) * e);
            if (k < 1) requestAnimationFrame(paso);
            else r();
          };
          requestAnimationFrame(paso);
        }),
      { destino, ms },
    );
  }

  async desplazarA(locator, arriba = 120, ms = 700) {
    const y = await locator.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    await this.desplazar(y - arriba, ms);
  }

  async terminar(salida) {
    await this.cdp.send('Page.stopScreencast');
    await this.esperar(200);
    const fin = this.ahora();
    // Lista de concat de FFmpeg con duraciones reales; -r 30 la vuelve CFR.
    const lineas = [];
    for (let i = 0; i < this.cuadros.length; i++) {
      const a = this.cuadros[i].t - this.origen;
      const b = i + 1 < this.cuadros.length ? this.cuadros[i + 1].t - this.origen : fin;
      if (b <= 0) continue;
      lineas.push(`file '${this.cuadros[i].archivo}'`, `duration ${Math.max(0.001, b - Math.max(0, a)).toFixed(4)}`);
    }
    lineas.push(`file '${this.cuadros[this.cuadros.length - 1].archivo}'`);
    const lista = path.join(this.dir, 'lista.txt');
    fs.writeFileSync(lista, lineas.join('\n'));
    const r = spawnSync(
      'ffmpeg',
      ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-vf', `fps=${FPS},scale=1170:2532:flags=lanczos`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', salida + '.mp4'],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) throw new Error('ffmpeg falló al armar la grabación');
    const meta = { viewport: VIEWPORT, escala: ESCALA, fps: FPS, duracion: +fin.toFixed(3), marcas: this.marcas, toques: this.toques };
    fs.writeFileSync(salida + '.json', JSON.stringify(meta, null, 2) + '\n');
    fs.rmSync(this.dir, { recursive: true, force: true });
    console.log(`ok ${salida}.mp4 (${this.cuadros.length} cuadros reales, ${fin.toFixed(1)} s)`);
  }
}

module.exports = { abrir, Grabador, VIEWPORT, ESCALA };
