import { describe, expect, test } from "vite-plus/test"

import { matchClock, matchWhen, matchWhenShort } from "./clock"

describe("matchClock", () => {
  /**
   * **末尾の時差まで含めて会場の時刻。**`Date` へ通して端末の時間帯で
   * 組み直すと、設定が会場と違う人だけ別の時刻を見る。文字列をそのまま読む。
   */
  test("公式の形から会場の日付と時刻を読む", () => {
    expect(matchClock("2026-10-08T11:15:00.900+09:00")).toStrictEqual({
      day: "10/8",
      time: "11:15",
    })
  })

  test("時差が違っても、書いてある時刻をそのまま読む", () => {
    // 同じ瞬間を別の時差で書いたもの。`Date` 経由だと 11:15 に化ける。
    expect(matchClock("2026-10-08T02:15:00.000+00:00")?.time).toBe("02:15")
  })

  test("月日の先頭の 0 は落とす", () => {
    expect(matchClock("2026-01-02T09:05:00+09:00")?.day).toBe("1/2")
  })

  test("時刻の先頭の 0 は落とさない。桁が揺れると縦に並ばない", () => {
    expect(matchClock("2026-10-08T09:05:00+09:00")?.time).toBe("09:05")
  })

  test("無いときと形が違うときは null。試合そのものは出す", () => {
    expect(matchClock(null)).toBe(null)
    expect(matchClock("")).toBe(null)
    expect(matchClock("2026/10/08 11:15")).toBe(null)
  })
})

describe("matchWhen", () => {
  test("時刻とフィールドを中黒でつなぐ", () => {
    expect(matchWhen("2026-10-08T11:15:00+09:00", "3")).toBe(
      "10/8 11:15 · フィールド 3",
    )
  })

  /** 片方しか無いときに、中黒だけが浮かないようにする。 */
  test("片方が無ければ、ある側だけを出す", () => {
    expect(matchWhen("2026-10-08T11:15:00+09:00", null)).toBe("10/8 11:15")
    expect(matchWhen(null, "5")).toBe("フィールド 5")
  })

  test("どちらも無ければ空。呼び出し側は何も出さない", () => {
    expect(matchWhen(null, null)).toBe("")
  })
})

describe("matchWhenShort", () => {
  /**
   * 一覧のカードは1行に試合名とこれを並べる。`フィールド` と書くと
   * `Ranking Match 324` のほうが切れる（実際に切れた）。試合番号はその試合の
   * 識別そのものなので、短くしてよいのはこちら側。
   */
  test("フィールドを F に縮める", () => {
    expect(matchWhenShort("2026-10-08T11:15:00+09:00", "3")).toBe(
      "10/8 11:15 · F3",
    )
  })

  test("長い形より短い", () => {
    const at = "2026-10-08T11:15:00+09:00"
    expect(matchWhenShort(at, "3").length).toBeLessThan(
      matchWhen(at, "3").length,
    )
  })

  test("片方が無ければ、ある側だけを出す", () => {
    expect(matchWhenShort(null, "5")).toBe("F5")
    expect(matchWhenShort(null, null)).toBe("")
  })
})
