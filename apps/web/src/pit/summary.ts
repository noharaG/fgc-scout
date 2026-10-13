/**
 * チームごとの記録の要約。チーム一覧が表とカードの両方で使う。
 *
 * **現地か事前かは、記録を新しく作った時刻だけで決める。**10/5 までに取った
 * 記録を会場で「直す」で更新しても事前のまま。直した時刻を数えると、誤字を
 * 直しただけの記録まで現地に見え、会場で回り漏れが出る（2026-10-06 決定）。
 * 会場で聞き直したら「もう一度記録する」で新しく残す。
 */

/** 会場での記録が始まる時刻。仁川（UTC+9）の 2026-10-06 0:00。 */
export const ON_SITE_FROM = Date.parse("2026-10-06T00:00:00+09:00")

export type RecordStage = "onsite" | "before" | "none"

type Timed = { readonly team: string; readonly recordedAt: number }

/** 記録のあるチームだけを持つ。無いチームは引いた側で "none" にする。 */
export function stagesByTeam(
  records: readonly Timed[],
): ReadonlyMap<string, RecordStage> {
  const stages = new Map<string, RecordStage>()
  for (const record of records) {
    if (record.recordedAt >= ON_SITE_FROM) {
      stages.set(record.team, "onsite")
    } else if (!stages.has(record.team)) {
      stages.set(record.team, "before")
    }
  }
  return stages
}

/**
 * チームごとの最新の記録。**新しく作った時刻で比べる**（チーム詳細の
 * 「最新」と同じ）。直した時刻で比べると、古い記録を直しただけで
 * 会場で聞いた記録より上に来る。
 */
export function latestByTeam<T extends Timed>(
  records: readonly T[],
): ReadonlyMap<string, T> {
  const latest = new Map<string, T>()
  for (const record of records) {
    const current = latest.get(record.team)
    if (current === undefined || record.recordedAt > current.recordedAt) {
      latest.set(record.team, record)
    }
  }
  return latest
}
