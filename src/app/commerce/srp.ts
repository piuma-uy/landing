// Cognito USER_SRP_AUTH (T61): SRP-6a over the 3072-bit group of RFC 5054, with the same
// derivations as AWS's AuthenticationHelper (amazon-cognito-identity-js), written with BigInt and
// WebCrypto instead of adding a library. The password never leaves the device: Cognito only gets
// A and a signature that proves the password matched its verifier.
// Framework-free so it can be unit tested with `node --test` (see tests/srp.test.ts).

export const N_HEX =
  "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF";
const N = BigInt("0x" + N_HEX);
const G = 2n;
const INFO = "Caldera Derived Key";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

/** Hex of a positive number as Cognito hashes it: even length, and a leading 00 when the top bit is set. */
export function padHex(n: bigint): string {
  const hex = n.toString(16);
  if (hex.length % 2) return "0" + hex;
  return "89abcdef".includes(hex[0]!) ? "00" + hex : hex;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

const big = (hex: string) => BigInt("0x" + hex);

async function sha256Hex(crypto: Crypto, data: Uint8Array<ArrayBuffer>) {
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

const hexHash = (crypto: Crypto, hex: string) =>
  sha256Hex(crypto, hexToBytes(hex));

/** "Tue Oct 6 09:05:03 UTC 2026": the TIMESTAMP Cognito signs (day without padding). */
export function srpTimestamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())} UTC ${date.getUTCFullYear()}`;
}

export interface SrpClient {
  /** Secret exponent; stays in memory for the one attempt. */
  a: bigint;
  /** SRP_A sent to InitiateAuth, in hex. */
  A: string;
}

/** a from 128 random bytes and A = g^a mod N (never 0 mod N). */
export function srpClient(crypto: Crypto, a?: bigint): SrpClient {
  for (;;) {
    const small =
      a ?? big(toHex(crypto.getRandomValues(new Uint8Array(128)).buffer)) % N;
    const A = modPow(G, small, N);
    if (A % N !== 0n) return { a: small, A: A.toString(16) };
    if (a !== undefined) throw new Error("SRP a inválido");
  }
}

export interface PasswordVerifier {
  /** `<region>_<poolName>` → poolName. */
  poolName: string;
  /** USER_ID_FOR_SRP of the challenge. */
  userId: string;
  password: string;
  /** SALT, SRP_B and SECRET_BLOCK of the PASSWORD_VERIFIER challenge. */
  salt: string;
  srpB: string;
  secretBlock: string;
  timestamp: string;
}

/** PASSWORD_CLAIM_SIGNATURE for Cognito's PASSWORD_VERIFIER challenge. */
export async function passwordSignature(
  crypto: Crypto,
  client: SrpClient,
  v: PasswordVerifier,
): Promise<string> {
  const B = big(v.srpB);
  if (B % N === 0n) throw new Error("SRP B inválido");
  const k = big(await hexHash(crypto, padHex(N) + padHex(G)));
  const u = big(await hexHash(crypto, padHex(big(client.A)) + padHex(B)));
  if (u === 0n) throw new Error("SRP u inválido");
  const identity = await sha256Hex(
    crypto,
    new TextEncoder().encode(`${v.poolName}${v.userId}:${v.password}`),
  );
  const x = big(await hexHash(crypto, padHex(big(v.salt)) + identity));
  const base = (((B - k * modPow(G, x, N)) % N) + N) % N;
  const S = modPow(base, client.a + u * x, N);
  // HKDF-SHA256(ikm = S, salt = u, info = "Caldera Derived Key"), 16 bytes.
  const ikm = await crypto.subtle.importKey(
    "raw",
    hexToBytes(padHex(S)),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const key = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hexToBytes(padHex(u)),
      info: new TextEncoder().encode(INFO),
    },
    ikm,
    128,
  );
  const hmac = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const text = new TextEncoder();
  const block = Uint8Array.from(atob(v.secretBlock), (c) => c.charCodeAt(0));
  const parts = [
    text.encode(v.poolName),
    text.encode(v.userId),
    block,
    text.encode(v.timestamp),
  ];
  const message = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    message.set(p, offset);
    offset += p.length;
  }
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmac, message),
  );
  let s = "";
  for (const b of signature) s += String.fromCharCode(b);
  return btoa(s);
}
