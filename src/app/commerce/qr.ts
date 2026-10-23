// QR code (ISO/IEC 18004) for the TOTP enrollment link, without a library: byte mode, error
// correction level M, versions 1 to 10 (up to 213 bytes; an otpauth URL is ~100).
// Framework-free so node --test can load it.

const EC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Format bits of level M. */
const LEVEL_M = 0;

function rawModules(version: number) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number) {
  return (
    Math.floor(rawModules(version) / 8) -
    EC_PER_BLOCK[version - 1] * BLOCKS[version - 1]
  );
}

function gfMultiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number) {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMultiply(coef, factor)));
  }
  return result;
}

/** Data codewords followed by error correction, blocks interleaved. */
function codewords(bytes: Uint8Array, version: number) {
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const capacity = dataCodewords(version) * 8;
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const blocks = BLOCKS[version - 1];
  const ecLength = EC_PER_BLOCK[version - 1];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const divisor = rsDivisor(ecLength);
  const split: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(
      k,
      k + shortLength - ecLength + (i < shortBlocks ? 0 : 1),
    );
    k += block.length;
    const ec = rsRemainder(block, divisor);
    if (i < shortBlocks) block.push(0);
    split.push([...block, ...ec]);
  }
  const result: number[] = [];
  for (let i = 0; i < split[0].length; i++)
    split.forEach((block, j) => {
      // The padding byte of short blocks is not transmitted.
      if (i !== shortLength - ecLength || j >= shortBlocks)
        result.push(block[i]);
    });
  return result;
}

function alignmentPositions(version: number, size: number) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step)
    result.splice(1, 0, pos);
  return result;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Matrix {
  readonly size: number;
  readonly dark: boolean[][];
  readonly reserved: boolean[][];
  constructor(size: number) {
    this.size = size;
    this.dark = Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false),
    );
    this.reserved = Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false),
    );
  }
  fixed(x: number, y: number, dark: boolean) {
    this.dark[y][x] = dark;
    this.reserved[y][x] = true;
  }
}

function drawFormat(m: Matrix, mask: number) {
  const data = (LEVEL_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const n = m.size;
  for (let i = 0; i <= 5; i++) m.fixed(8, i, bit(i));
  m.fixed(8, 7, bit(6));
  m.fixed(8, 8, bit(7));
  m.fixed(7, 8, bit(8));
  for (let i = 9; i < 15; i++) m.fixed(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) m.fixed(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) m.fixed(8, n - 15 + i, bit(i));
  m.fixed(8, n - 8, true);
}

function drawFunctionPatterns(m: Matrix, version: number) {
  const n = m.size;
  for (let i = 0; i < n; i++) {
    m.fixed(6, i, i % 2 === 0);
    m.fixed(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n)
          m.fixed(x, y, dist !== 2 && dist !== 4);
      }
  const align = alignmentPositions(version, n);
  const last = align.length - 1;
  align.forEach((cx, i) =>
    align.forEach((cy, j) => {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      )
        return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          m.fixed(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  drawFormat(m, 0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      m.fixed(a, b, dark);
      m.fixed(b, a, dark);
    }
  }
}

function drawData(m: Matrix, data: number[]) {
  const n = m.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < n; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? n - 1 - vert : vert;
        if (!m.reserved[y][x] && i < data.length * 8) {
          m.dark[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }
}

function applyMask(m: Matrix, mask: number) {
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++)
      if (!m.reserved[y][x] && MASKS[mask](x, y)) m.dark[y][x] = !m.dark[y][x];
}

/** ISO penalty: long runs, 2×2 blocks, finder-like patterns and dark/light balance. */
function penalty(dark: boolean[][]) {
  const n = dark.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let i = 0; i < n; i++) {
    lines.push(dark[i]);
    lines.push(dark.map((row) => row[i]));
  }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    const text = line.map((d) => (d ? "1" : "0")).join("");
    for (const pattern of ["10111010000", "00001011101"])
      for (
        let at = text.indexOf(pattern);
        at >= 0;
        at = text.indexOf(pattern, at + 1)
      )
        score += 40;
  }
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = dark[y][x];
      if (
        c === dark[y][x + 1] &&
        c === dark[y + 1][x] &&
        c === dark[y + 1][x + 1]
      )
        score += 3;
    }
  const total = n * n;
  const darkCount = dark.reduce((s, row) => s + row.filter(Boolean).length, 0);
  score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Modules of the QR code for `text` (UTF-8), row by row, true = dark; without quiet zone.
 * `mask` forces one of the eight masks (tests); by default the one with the lowest penalty.
 */
export function qrModules(text: string, mask?: number): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (
    version <= 10 &&
    4 + (version < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8
  )
    version++;
  if (version > 10) throw new Error("Texto demasiado largo para el QR");
  const data = codewords(bytes, version);
  const build = (k: number) => {
    const m = new Matrix(version * 4 + 17);
    drawFunctionPatterns(m, version);
    drawData(m, data);
    applyMask(m, k);
    drawFormat(m, k);
    return m.dark;
  };
  if (mask !== undefined) return build(mask);
  let best: boolean[][] = [];
  let bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    const candidate = build(k);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** SVG path ("M x y h1v1h-1z" per dark module) with a 4-module quiet zone, and its viewBox side. */
export function qrPath(text: string) {
  const modules = qrModules(text);
  let d = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    }),
  );
  return { d, size: modules.length + 8 };
}
