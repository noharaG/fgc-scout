/**
 * 試合の予定時刻の読み方。
 *
 * 公式は `"2026-10-08T11:15:00.900+09:00"` の形で返す。**末尾の時差まで
 * 含めて会場の時刻**なので、`Date` へ通して端末の時間帯で組み直さない。
 * 通すと、端末の設定が会場と違う人だけ別の時刻を見ることになる。会場
 * （仁川）と日本はどちらも +09:00 なので普段は一致するが、一致するから
 * 正しいのではなく、**文字列をそのまま読むから正しい**。
 *
 * 形が違えば null を返す。呼び出し側は時刻を出さないだけで、試合は出す
 * (→ AGENTS.md の Invariants)。
 */

const AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u

export type MatchClock = {
  /** `"10/8"`。日付をまたぐ一覧で、いつの試合かを示す。 */
  readonly day: string
  /** `"11:15"`。 */
  readonly time: string
}

export function matchClock(scheduledTime: string | null): MatchClock | null {
  if (scheduledTime === null) return null
  const found = AT.exec(scheduledTime)
  if (found === null) return null

  const [, , month, day, hour, minute] = found
  if (month === undefined || day === undefined) return null
  if (hour === undefined || minute === undefined) return null

  // 月日の先頭の 0 は落とす。日本語の表記では `10/8` と書く。
  return {
    day: `${String(Number(month))}/${String(Number(day))}`,
    time: `${hour}:${minute}`,
  }
}

/**
 * 一覧用の短い形。`"10/8 11:15 · F3"`。
 *
 * **試合名を切らせないための短縮。**一覧のカードは1行に試合名とこれを並べる
 * ので、`フィールド` と書くと `Ranking Match 324` のほうが切れる。試合番号は
 * その試合の識別そのものなので、切ってよいのはこちら側。
 * 読む場所が1つに絞られる画面（次の試合・試合詳細）では `matchWhen` を使う。
 */
export function matchWhenShort(
  scheduledTime: string | null,
  field: string | null,
): string {
  const clock = matchClock(scheduledTime)
  const when = clock === null ? "" : `${clock.day} ${clock.time}`
  const where = field === null ? "" : `F${field}`
  return [when, where].filter((part) => part !== "").join(" · ")
}

/** 一覧に出す1行ぶん。`"10/8 11:15 · フィールド 3"`。 */
export function matchWhen(
  scheduledTime: string | null,
  field: string | null,
): string {
  const clock = matchClock(scheduledTime)
  const when = clock === null ? "" : `${clock.day} ${clock.time}`
  const where = field === null ? "" : `フィールド ${field}`
  // どちらも無いときは空。空の中黒だけを置かない(→ W-22 の趣旨)。
  return [when, where].filter((part) => part !== "").join(" · ")
}
