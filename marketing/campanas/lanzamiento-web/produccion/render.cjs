// Renderiza un reel: abre fuentes/<pieza>.html, le pasa los cuadros de las grabaciones reales, llama a render(t)
// para cada fotograma a 30 fps y manda las capturas por tubería a FFmpeg (H.264 High, yuv420p, +faststart, sin audio).
// Uso: node render.cjs ya-esta-pronto|compra-3-pasos            → ../<pieza>.mp4
//      node render.cjs compra-3-pasos --cuadros 0,3.5,9           → PNG sueltos en la carpeta actual (revisión)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ? path.resolve(process.env.PLAYWRIGHT_MODULE) : 'playwright');

const RAIZ = path.join(__dirname, '..');
const FPS = 30;
const PIEZAS = {
  'ya-esta-pronto': { web: 'piuma-uy-inicio' },
  'compra-3-pasos': { compra: 'compra-3-pasos' },
};

// Extrae los cuadros de cada grabación a una carpeta temporal (JPEG de calidad alta) y devuelve su ubicación.
function extraer(grabaciones) {
  const salida = {};
  for (const [clave, nombre] of Object.entries(grabaciones)) {
    const base = path.join(RAIZ, 'fuentes', 'grabaciones', nombre);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `piuma-${nombre}-`));
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', base + '.mp4', '-q:v', '2', path.join(dir, 'f%05d.jpg')], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg no pudo extraer ' + nombre);
    const meta = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
    salida[clave] = { ...meta, dir: 'file://' + dir, total: fs.readdirSync(dir).length, carpeta: dir };
  }
  return salida;
}

(async () => {
  const pieza = process.argv[2];
  if (!PIEZAS[pieza]) throw new Error('Pieza desconocida: ' + pieza);
  const i = process.argv.indexOf('--cuadros');
  const sueltos = i > 0 ? process.argv[i + 1].split(',').map(Number) : null;
  const grabaciones = extraer(PIEZAS[pieza]);
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('error en la página:', e.message));
  await page.goto('file://' + path.join(RAIZ, 'fuentes', pieza + '.html'));
  await page.evaluate((g) => window.preparar(g), grabaciones);
  await page.evaluate(async () => {
    const fuentes = ['500 1em "Playfair Display"', 'italic 500 1em "Playfair Display"', '500 1em Inter', '600 1em Inter'];
    await Promise.all(fuentes.map((f) => document.fonts.load(f, 'áéíóúñ¿')));
    const faltan = fuentes.filter((f) => !document.fonts.check(f, 'áéíóúñ¿'));
    if (faltan.length) throw new Error('Fuentes sin cargar: ' + faltan.join(', '));
    const rotas = [...document.images].filter((i) => i.getAttribute('src') && !i.naturalWidth).map((i) => i.src);
    if (rotas.length) throw new Error('Imágenes sin cargar: ' + rotas.join(', '));
  });
  const duracion = await page.evaluate(() => window.DURACION);
  console.log(`${pieza}: ${duracion} s`);

  try {
    if (sueltos) {
      for (const t of sueltos) {
        await page.evaluate((t) => window.render(t), t);
        await page.screenshot({ path: `${pieza}-${t.toFixed(2)}.png` });
      }
      return;
    }
    const salida = path.join(RAIZ, pieza + '.mp4');
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-level', '4.1',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', '-an', salida,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const total = Math.round(duracion * FPS);
    for (let f = 0; f < total; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const png = await page.screenshot({ type: 'png' });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (f % 60 === 0) console.log(`fotograma ${f}/${total}`);
    }
    ffmpeg.stdin.end();
    await new Promise((r, x) => ffmpeg.on('close', (c) => (c === 0 ? r() : x(new Error('ffmpeg ' + c)))));
    console.log('ok', salida);
  } finally {
    await browser.close();
    for (const g of Object.values(grabaciones)) fs.rmSync(g.carpeta, { recursive: true, force: true });
  }
})();
