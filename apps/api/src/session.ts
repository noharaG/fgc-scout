/**
 * Shared-password login and signed session cookies.
 *
 * 依存を足さずに Web Crypto だけで書いている。署名と鍵導出は「送ってみたら
 * 通った」で済ませず、外から確かめられる性質をテストで固定する(→ A-09)。
 * PBKDF2 は RFC 6070、HMAC-SHA256 は RFC 4231 の公開テストベクタで検証する。
 */

import type { Role } from "./access"
import { isRecord } from "./json"

export const SESSION_COOKIE = "fgc_scout_session"

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
const PBKDF2_PREFIX = "pbkdf2-sha256"

/**
 * Cloudflare Workers の Web Crypto が受け付ける PBKDF2 の反復回数の上限。
 *
 * これを超える値でハッシュを作ると、ローカル(workerd の local モード)では
 * 通るのに本番だけ `NotSupportedError` で 500 になる。実際にそれで詰まった。
 * ハッシュを作る側(`scripts/hash-password.ts` の `ITERATIONS`)も同じ値を持つ。
 * **片方を変えたらもう片方も変える。**
 */
const MAX_PBKDF2_ITERATIONS = 100_000

export type Session = {
  readonly role: Role
  readonly scoutName: string
  readonly exp: number
}

/* -------------------------------------------------------------------------
 * base64url
 * ---------------------------------------------------------------------- */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

// 戻り値を Uint8Array<ArrayBuffer> に固定する。Web Crypto の BufferSource は
// SharedArrayBuffer 上のビューを受け付けないため、既定の Uint8Array
// (ArrayBufferLike) のままだと渡せない。
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Constant-time comparison. A length mismatch still returns false. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/* -------------------------------------------------------------------------
 * Password verification
 * ---------------------------------------------------------------------- */

export async function derivePbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    lengthBytes * 8,
  )
  return new Uint8Array(bits)
}

/**
 * Stored form: `pbkdf2-sha256$<iterations>$<salt-b64url>$<hash-b64url>`.
 * Generate one with `pnpm -C apps/api run hash-password`.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 4) return false
  const [scheme, iterationsText, saltText, hashText] = parts
  if (scheme !== PBKDF2_PREFIX) return false

  const iterations = Number(iterationsText)
  if (!Number.isInteger(iterations) || iterations < 1) return false
  if (iterations > MAX_PBKDF2_ITERATIONS) {
    // 設定が壊れている。利用者には「合わない」として返し、原因はログへ出す。
    // ここで例外を投げると 500 になり、パスワード違いと区別が付かなくなる。
    console.error(
      `stored hash uses ${String(iterations)} iterations, but this runtime supports at most ${String(MAX_PBKDF2_ITERATIONS)}`,
    )
    return false
  }

  const salt = fromBase64Url(saltText ?? "")
  const expected = fromBase64Url(hashText ?? "")
  const actual = await derivePbkdf2(password, salt, iterations, expected.length)
  return timingSafeEqual(actual, expected)
}

/* -------------------------------------------------------------------------
 * Signed cookie
 * ---------------------------------------------------------------------- */

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  )
  return new Uint8Array(signature)
}

export async function signSession(
  session: Session,
  secret: string,
): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(session)))
  const signature = toBase64Url(await hmac(secret, payload))
  return `${payload}.${signature}`
}

/** Returns null for a bad signature, malformed payload, or expired session. */
export async function readSession(
  token: string,
  secret: string,
  nowSeconds: number,
): Promise<Session | null> {
  const dot = token.indexOf(".")
  if (dot < 1) return null
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = await hmac(secret, payload)
  if (!timingSafeEqual(fromBase64Url(signature), expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const role = parsed["role"]
  const scoutName = parsed["scoutName"]
  const exp = parsed["exp"]

  if (role !== "viewer" && role !== "admin") return null
  if (typeof scoutName !== "string") return null
  if (typeof exp !== "number" || exp <= nowSeconds) return null

  return { role, scoutName, exp }
}

export function newSession(
  role: Role,
  scoutName: string,
  nowSeconds: number,
): Session {
  return { role, scoutName, exp: nowSeconds + SESSION_TTL_SECONDS }
}

/**
 * `secure` はリクエストが https で来たかで決める。
 *
 * 本番(workers.dev もカスタムドメインも https)では必ず付き、ローカル開発の
 * http://127.0.0.1 でだけ落ちる。付けたままにすると開発時に Cookie が
 * 保存されず、ログインは成功するのに以降のすべてが 401 になる。
 */
export function cookieHeader(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ")
}

export function clearCookieHeader(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ")
}

/** https で来たリクエストにだけ Secure を付けるための判定。 */
export function isSecureRequest(url: string): boolean {
  try {
    return new URL(url).protocol === "https:"
  } catch {
    return true
  }
}
