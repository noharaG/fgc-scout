/**
 * The single allow table (method, path prefix, required role).
 *
 * 権限の強制はこの表を読む前段ミドルウェア1箇所だけで行う。画面側の
 * 出し分けは表示の都合であって認可ではない(→ AGENTS.md の Invariants)。
 * 権限は viewer と admin の2区分だけで、3つ目を作らない。
 */

export type Role = "viewer" | "admin"
export type Requirement = Role | "public"

type Rule = {
  readonly method: string
  readonly prefix: string
  readonly requirement: Requirement
}

/**
 * Longest prefix wins, so a more specific admin rule can sit above a
 * viewer rule on the same path.
 */
const RULES: readonly Rule[] = [
  { method: "GET", prefix: "/api/health", requirement: "public" },
  { method: "POST", prefix: "/api/session", requirement: "public" },
  { method: "GET", prefix: "/api/session", requirement: "viewer" },
  { method: "DELETE", prefix: "/api/session", requirement: "viewer" },

  { method: "GET", prefix: "/api/official", requirement: "viewer" },

  { method: "GET", prefix: "/api/questions", requirement: "viewer" },
  { method: "POST", prefix: "/api/questions", requirement: "admin" },
  { method: "PATCH", prefix: "/api/questions", requirement: "admin" },
  { method: "DELETE", prefix: "/api/questions", requirement: "admin" },

  // グループの一覧は質問の応答に同梱するので、GET は持たない。
  { method: "POST", prefix: "/api/groups", requirement: "admin" },
  { method: "PATCH", prefix: "/api/groups", requirement: "admin" },
  { method: "DELETE", prefix: "/api/groups", requirement: "admin" },

  { method: "GET", prefix: "/api/pit", requirement: "viewer" },
  { method: "POST", prefix: "/api/pit", requirement: "viewer" },
  // 書き直しは生徒に開く。**誰の記録でも直せる。**共有パスワード1つで入り、
  // 記録者の名前は自己申告なので(→ 要件定義書 F1-2)、所有の判定は錠として
  // 働かない。名前を打ち替えれば誰にでもなれる。錠の代わりに、直した人と
  // 時刻を記録へ押す(→ 0006_pit_record_edited.sql)。
  { method: "PATCH", prefix: "/api/pit", requirement: "viewer" },
  // 記録を消せるのはコーチだけ。生徒が自分の書いたものを消せると、
  // 消えた理由が誰にも分からなくなる。
  { method: "DELETE", prefix: "/api/pit", requirement: "admin" },
  // 写真の1枚消しは書き直しの一部なので生徒に開く。記録ごと消すのとは
  // 別の操作で、こちらは残りの記録が手元に残る。**上の DELETE /api/pit より
  // 長い前置きなので、こちらが勝つ**(→ requiredRole)。
  { method: "DELETE", prefix: "/api/pit/photos", requirement: "viewer" },
]

/**
 * Returns null for unknown paths so the caller answers 404 rather than 403.
 * 存在しないパスと権限不足を利用者から区別できる状態に保つ。
 */
export function requiredRole(method: string, path: string): Requirement | null {
  let best: Rule | null = null
  for (const rule of RULES) {
    if (rule.method !== method) continue
    if (!path.startsWith(rule.prefix)) continue
    if (best === null || rule.prefix.length > best.prefix.length) best = rule
  }
  return best === null ? null : best.requirement
}

export function satisfies(actual: Role | null, required: Requirement): boolean {
  if (required === "public") return true
  if (actual === null) return false
  if (required === "viewer") return true
  return actual === "admin"
}
