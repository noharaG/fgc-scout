/**
 * Prints a stored password hash for .dev.vars / `wrangler secret put`.
 *
 *   pnpm -C apps/api run hash-password -- "<password>"
 *
 * 出力の形は `pbkdf2-sha256$<iterations>$<salt>$<hash>` で、検証側は
 * src/session.ts の verifyPassword が読む。両者が同じ形を前提にしているので、
 * 片方を変えたらもう片方も変える。
 */

/**
 * `src/session.ts` の `MAX_PBKDF2_ITERATIONS` と同じ値にする。
 * **片方を変えたらもう片方も変える。**
 *
 * import で1箇所にまとめていないのは、このスクリプトを Node が直接実行する
 * 一方、`src` 側は拡張子なしの import で書かれていて ESM の解決が通らない
 * ため。上限そのものは Cloudflare Workers 側の制約で、超えると本番だけ
 * `NotSupportedError` になる。
 */
const ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BYTES = 32

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function main(): Promise<void> {
  const password = process.argv[2]

  if (password === undefined || password === "") {
    console.error('usage: pnpm -C apps/api run hash-password -- "<password>"')
    process.exitCode = 1
    return
  }

  const salt = crypto.getRandomValues(
    new Uint8Array(new ArrayBuffer(SALT_BYTES)),
  )
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    HASH_BYTES * 8,
  )

  const stored = [
    "pbkdf2-sha256",
    String(ITERATIONS),
    toBase64Url(salt),
    toBase64Url(new Uint8Array(bits)),
  ].join("$")

  console.log(stored)
}

await main()
