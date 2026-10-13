import { describe, expect, test } from "vite-plus/test"

import {
  clearCookieHeader,
  cookieHeader,
  derivePbkdf2,
  isSecureRequest,
  newSession,
  readSession,
  SESSION_COOKIE,
  signSession,
  verifyPassword,
} from "./session"

/**
 * 署名と鍵導出は「送ってみたら通った」で済ませず、外から確かめられる性質を
 * 固定する(→ A-09)。
 *
 * ただし公開テストベクタとの突き合わせはしていない。PBKDF2-HMAC-SHA256 の
 * 広く引かれるベクタを手元で検証する手段が無く、記憶で書いた期待値を
 * テストに置かないためである。代わりに、決定性・入力依存・改竄検出という
 * 実装が満たすべき性質を確かめる。公開ベクタを引ける環境が用意できた時点で
 * このテストへ1本足す。
 */

const ITERATIONS = 1000
const HASH_BYTES = 32

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function makeStored(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePbkdf2(password, salt, ITERATIONS, HASH_BYTES)
  return [
    "pbkdf2-sha256",
    String(ITERATIONS),
    toBase64Url(salt),
    toBase64Url(hash),
  ].join("$")
}

const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

describe("derivePbkdf2", () => {
  test("同じ入力からは同じ鍵が出る", async () => {
    const a = await derivePbkdf2("hunter2", SALT, ITERATIONS, HASH_BYTES)
    const b = await derivePbkdf2("hunter2", SALT, ITERATIONS, HASH_BYTES)
    expect([...a]).toEqual([...b])
  })

  test("要求した長さの鍵が出る", async () => {
    expect((await derivePbkdf2("x", SALT, ITERATIONS, 16)).length).toBe(16)
    expect((await derivePbkdf2("x", SALT, ITERATIONS, 64)).length).toBe(64)
  })

  test("パスワード・salt・反復回数のどれが変わっても鍵が変わる", async () => {
    const base = await derivePbkdf2("hunter2", SALT, ITERATIONS, HASH_BYTES)

    const otherPassword = await derivePbkdf2(
      "hunter3",
      SALT,
      ITERATIONS,
      HASH_BYTES,
    )
    const otherSalt = await derivePbkdf2(
      "hunter2",
      new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]),
      ITERATIONS,
      HASH_BYTES,
    )
    const otherIterations = await derivePbkdf2(
      "hunter2",
      SALT,
      ITERATIONS + 1,
      HASH_BYTES,
    )

    expect([...otherPassword]).not.toEqual([...base])
    expect([...otherSalt]).not.toEqual([...base])
    expect([...otherIterations]).not.toEqual([...base])
  })
})

describe("verifyPassword", () => {
  test("正しいパスワードだけを通す", async () => {
    const stored = await makeStored("correct horse")
    expect(await verifyPassword("correct horse", stored)).toBe(true)
    expect(await verifyPassword("correct hors", stored)).toBe(false)
    expect(await verifyPassword("Correct horse", stored)).toBe(false)
    expect(await verifyPassword("", stored)).toBe(false)
  })

  /**
   * 実行環境が受け付けない反復回数で保存されていた場合、例外を投げると
   * 500 になり、パスワード違いと区別が付かなくなる。実際に本番だけ 500 に
   * なる形で詰まったので固定しておく。
   */
  test("実行環境の上限を超える反復回数は、例外ではなく false を返す", async () => {
    expect(await verifyPassword("x", "pbkdf2-sha256$210000$aaaa$bbbb")).toBe(
      false,
    )
  })

  test("形式が壊れていれば例外ではなく false を返す", async () => {
    expect(await verifyPassword("x", "")).toBe(false)
    expect(await verifyPassword("x", "not$a$valid")).toBe(false)
    expect(await verifyPassword("x", "sha256$1000$aaaa$bbbb")).toBe(false)
    expect(await verifyPassword("x", "pbkdf2-sha256$zero$aaaa$bbbb")).toBe(
      false,
    )
    expect(await verifyPassword("x", "pbkdf2-sha256$0$aaaa$bbbb")).toBe(false)
  })
})

describe("signSession / readSession", () => {
  const secret = "test-secret-value-not-used-anywhere-else"
  const now = 1_760_000_000

  test("署名して読み戻すと同じ内容になる", async () => {
    const session = newSession("viewer", "たなか", now)
    const token = await signSession(session, secret)
    expect(await readSession(token, secret, now)).toEqual(session)
  })

  test("署名を差し替えたトークンは通らない", async () => {
    const token = await signSession(
      newSession("admin", "こばやし", now),
      secret,
    )
    const [payload] = token.split(".")
    const forged = `${payload ?? ""}.YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh`
    expect(await readSession(forged, secret, now)).toBe(null)
  })

  test("権限を書き換えた payload は署名が合わず通らない", async () => {
    // viewer のセッションを admin へ書き換えても、署名が合わなければ落ちる。
    const forgedPayload = toBase64Url(
      new TextEncoder().encode(
        JSON.stringify({ role: "admin", scoutName: "x", exp: now + 100 }),
      ),
    )
    const token = await signSession(newSession("viewer", "x", now), secret)
    const signature = token.slice(token.indexOf(".") + 1)
    expect(
      await readSession(`${forgedPayload}.${signature}`, secret, now),
    ).toBe(null)
  })

  test("別の鍵で署名されたトークンは通らない", async () => {
    const token = await signSession(newSession("viewer", "x", now), "other-key")
    expect(await readSession(token, secret, now)).toBe(null)
  })

  test("期限を過ぎたトークンは通らない", async () => {
    const session = newSession("viewer", "x", now)
    const token = await signSession(session, secret)
    expect(await readSession(token, secret, session.exp + 1)).toBe(null)
  })

  test("形の壊れたトークンは例外ではなく null を返す", async () => {
    expect(await readSession("", secret, now)).toBe(null)
    expect(await readSession(".", secret, now)).toBe(null)
    expect(await readSession("no-dot", secret, now)).toBe(null)
  })
})

describe("cookie headers", () => {
  test("Cookie は HttpOnly / Secure / SameSite を落とさない", () => {
    const header = cookieHeader("token-value", true)
    expect(header.startsWith(`${SESSION_COOKIE}=token-value`)).toBe(true)
    expect(header).toContain("HttpOnly")
    expect(header).toContain("Secure")
    expect(header).toContain("SameSite=Lax")
  })

  /**
   * ローカル開発は http://127.0.0.1 で動く。Secure を付けたままにすると
   * Cookie が保存されず、ログインは成功するのに以降のすべてが 401 になる。
   * 実際にそれで詰まったので、両方向を固定しておく。
   */
  test("http のときだけ Secure を落とし、HttpOnly は落とさない", () => {
    const header = cookieHeader("token-value", false)
    expect(header).not.toContain("Secure")
    expect(header).toContain("HttpOnly")
    expect(header).toContain("SameSite=Lax")
  })

  test("破棄用のヘッダは Max-Age を 0 にし、同じ条件で Secure を付ける", () => {
    expect(clearCookieHeader(true)).toContain("Max-Age=0")
    expect(clearCookieHeader(true)).toContain("Secure")
    expect(clearCookieHeader(false)).not.toContain("Secure")
  })
})

describe("isSecureRequest", () => {
  test("https のときだけ true", () => {
    expect(isSecureRequest("https://fgc-scout.workers.dev/api/session")).toBe(
      true,
    )
    expect(isSecureRequest("http://127.0.0.1:8787/api/session")).toBe(false)
    expect(isSecureRequest("http://localhost:5173/api/session")).toBe(false)
  })

  test("URL として読めないものは安全側に倒して true", () => {
    expect(isSecureRequest("not a url")).toBe(true)
  })
})
