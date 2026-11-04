// Grabación real del flujo de compra para «Comprá en 3 pasos»: categoría Cubrecamas → Cubrecama Chiara →
// Agregar al carrito → carrito → (datos y entrega, que el montaje saltea) → Pago con tarjeta → «Confirmar y pagar».
// Front real (rama tienda-local, `npx ng serve --port 4308`) contra la API local de produccion/api-local.sh.
// Uso: PLAYWRIGHT_MODULE=<ruta a node_modules/playwright> node grabar-compra.cjs
const path = require('node:path');
const crypto = require('node:crypto');
const { abrir, precargar, Grabador } = require('./grabador.cjs');

const SALIDA = path.join(__dirname, '..', 'fuentes', 'grabaciones', 'compra-3-pasos');
const FRONT = process.env.FRONT_URL ?? 'http://localhost:4308';
const API = process.env.API_URL ?? 'http://localhost:3108';

// Rastros que no tienen que verse: stock de demo («10 disponibles»), nombre y correo de la cuenta de prueba y,
// si se grabara contra el entorno dev, el rótulo «Tienda de prueba · Sin cobros».
const OCULTAR = `.detail__stock, .preview-label { visibility: hidden !important; }
  .step__hint.video-oculto { visibility: hidden !important; }
  * { -webkit-tap-highlight-color: transparent !important; }`;

(async () => {
  const { browser, context, page } = await abrir();
  await context.route('**/runtime-config.json', (r) =>
    r.fulfill({ json: { commerceEnabled: true, apiBaseUrl: API, auth: 'cookie' } }),
  );
  // La grabación termina en el sitio de la tienda: la salida hacia Mercado Pago (aquí el simulador local) se
  // responde con 204, que en Chromium cancela la navegación y deja la pantalla de Piuma.
  await context.route('http://localhost:8108/**', (r) =>
    r.request().isNavigationRequest() ? r.fulfill({ status: 204 }) : r.continue(),
  );
  await context.addInitScript((css) => {
    const poner = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
      // Marca el renglón «Nombre · correo» del paso 1 cuando aparece.
      new MutationObserver(() => {
        for (const p of document.querySelectorAll('.step__hint:not(.video-oculto)'))
          if (p.textContent.includes('@')) p.classList.add('video-oculto');
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner);
    else poner();
  }, OCULTAR);

  // Cuenta local descartable (vive sólo en la memoria de la API local).
  const cuenta = { email: `video-${Date.now()}@piuma.local`, password: crypto.randomBytes(18).toString('base64url') + 'aA1!' };
  const reg = await page.request.post(`${API}/auth/register`, {
    headers: { Origin: FRONT },
    data: { ...cuenta, name: 'Video' },
  });
  if (!reg.ok()) throw new Error(`register ${reg.status()}: ${await reg.text()}`);

  await page.goto(`${FRONT}/catalogo/cubrecamas/`, { waitUntil: 'load' });
  await page.locator('main a').filter({ hasText: 'Cubrecama Chiara' }).first().waitFor();
  await precargar(page);
  await page.waitForTimeout(600);

  const g = new Grabador(page);
  await g.empezar();

  // 1 · Elegí
  g.marca('elegi');
  await g.esperar(900);
  const chiara = page.locator('main a').filter({ hasText: 'Cubrecama Chiara' }).first();
  await g.desplazarA(chiara, 150, 800);
  await g.esperar(300);
  await g.tocar(chiara, 'chiara');
  await g.durante(page.waitForURL('**/cubrecama-chiara/'));
  // Fotos de la ficha: la toma espera (sin avanzar el tiempo) a que estén decodificadas, así no aparecen a medias.
  await precargar(page);
  g.marca('producto');
  await g.esperar(1400);

  // 2 · Agregá
  g.marca('agrega');
  const agregar = page.getByRole('button', { name: 'Agregar al carrito' });
  await g.desplazarA(agregar, 330, 800);
  await g.esperar(500);
  await g.tocar(agregar, 'agregar');
  await g.durante(page.getByText('Producto agregado al carrito').waitFor());
  await g.esperar(1300);
  await g.tocar(page.getByRole('button', { name: /carrito/i }).first(), 'carrito');
  // El carrito es otra ruta: hasta que la página nueva sube al principio quedaba un cuadro con la página nueva a la
  // altura de la anterior (el pie). Se espera sin avanzar el tiempo y se sube antes del cuadro siguiente.
  await page.getByRole('heading', { name: 'Tu carrito' }).waitFor({ timeout: 10000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  g.marca('carrito');
  await g.esperar(1600);

  // Datos y entrega: se graban (es el flujo real) pero el montaje los saltea.
  g.marca('datos');
  await g.durante(page.locator('input[type=tel]').fill('099000000'));
  await g.durante(page.getByRole('button', { name: 'Continuar' }).last().click());
  await g.durante(page.locator('main select', { has: page.locator('option', { hasText: 'Pocitos' }) }).first().selectOption({ label: 'Pocitos' }));
  await g.durante(page.locator('input[name=street]').fill('Calle 1234'));
  await g.durante(page.getByRole('button', { name: 'Continuar' }).last().click());
  const tarjeta = page.locator('label').filter({ hasText: 'Tarjeta con Mercado Pago' });
  await g.durante(tarjeta.waitFor());
  await precargar(page);
  // Los pasos anteriores se pliegan con transiciones CSS que corren en tiempo virtual: se dejan terminar antes de medir
  // dónde quedó «Pago» (este tramo no sale en el montaje).
  await g.esperar(700);
  await g.desplazarA(page.getByRole('heading', { name: 'Pago' }), 90, 10);
  await g.esperar(400);

  // 3 · Pagá
  g.marca('paga');
  await g.esperar(1000);
  await g.tocar(tarjeta, 'tarjeta');
  await g.esperar(1200);
  await g.tocar(page.getByRole('button', { name: /^(Pagar con Mercado Pago|Confirmar y pagar)/ }), 'pagar');
  await g.esperar(1400);
  g.marca('fin');
  await g.esperar(200);
  await g.terminar(SALIDA);
  await browser.close();
})();
