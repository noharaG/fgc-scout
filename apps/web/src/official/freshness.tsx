import { fetchedAgo } from "./snapshot"

/**
 * 公式データの鮮度の出し方。4画面で同じ扱いにする(→ S-10)。
 *
 * **うまく取れているときは畳み、失敗しているときだけ画面に出す。**
 * 「3分前に取得」は毎回読む情報ではないが、**古い内容を最新として見せるのは
 * 別の話**で、これは畳んではいけない(→ W-04、AGENTS.md の Invariants)。
 * 取れなかった事実は、細かい字ではなく枠付きで出す。
 */

/** 「？」の中に入れる1行。読み方の注記の末尾に足す。 */
export function freshnessNote(fetchedAt: number, stale: boolean): string {
  return `公式データは ${fetchedAgo(fetchedAt, stale)}。`
}

/** 取得に失敗して前回の内容を見せている間だけ出る。 */
export function StaleNotice({
  fetchedAt,
  stale,
}: {
  readonly fetchedAt: number
  readonly stale: boolean
}) {
  if (!stale) return null
  return (
    <p
      role="alert"
      className="mt-3 rounded-card border border-rank-mid bg-surface-soft px-3.5 py-2.5 text-xs text-secondary-ink"
    >
      <strong className="font-extrabold">
        公式データを取り直せませんでした。
      </strong>
      いま出ているのは {fetchedAgo(fetchedAt, false)} の内容です。回線が戻ると
      自動で読み直します
    </p>
  )
}
