// Renderiza el reel: abre fuentes/reel.html, llama a render(t) para cada fotograma a 30 fps y
// envía las capturas por tubería a FFmpeg (no se guardan secuencias de fotogramas en disco).
// Uso: node render-reel.cjs                 → reel-proximamente-web.mp4
//      node render-reel.cjs --cuadros 0,3.5  → PNG sueltos en el directorio actual (revisión rápida)
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { listo } = require('./listo.cjs');

const RAIZ = path.join(__dirname, '..');
const FPS = 30;

(async () => {
  const i = process.argv.indexOf('--cuadros');
  const sueltos = i > 0 ? process.argv[i + 1].split(',').map(Number) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(RAIZ, 'fuentes', 'reel.html'));
  await listo(page);
  const duracion = await page.evaluate(() => window.DURACION);

  if (sueltos) {
    for (const t of sueltos) {
      await page.evaluate((t) => window.render(t), t);
      await page.screenshot({ path: `cuadro-${t.toFixed(2)}.png` });
    }
    await browser.close();
    return;
  }

  const salida = path.join(RAIZ, 'reel-proximamente-web.mp4');
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.1',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', salida,
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
  await browser.close();
  console.log('ok', salida);
})();
