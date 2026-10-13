/**
 * Narrowing helpers for values that arrive as `unknown`: request bodies,
 * parsed cookies, and the official site's response.
 *
 * 型アサーションではなく型述語で絞る。境界で絞るのが規約の求める形で、
 * `as` で通すと検査が「安全でないアサーション」として弾く(→ A-44)。
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

export function stringField(value: unknown, key: string): string | null {
  const found = field(value, key)
  return typeof found === "string" ? found : null
}

export function boolField(value: unknown, key: string): boolean | undefined {
  const found = field(value, key)
  return typeof found === "boolean" ? found : undefined
}

export function numberField(value: unknown, key: string): number | undefined {
  const found = field(value, key)
  return typeof found === "number" && Number.isFinite(found) ? found : undefined
}

export function stringArrayField(
  value: unknown,
  key: string,
): readonly string[] | undefined {
  const found = field(value, key)
  if (!Array.isArray(found)) return undefined
  return found.filter((item): item is string => typeof item === "string")
}
