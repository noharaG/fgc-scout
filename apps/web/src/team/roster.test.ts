import { describe, expect, test } from "vite-plus/test"

import { isLigated } from "./flag-font"
import { flagOf, matchesQuery, ROSTER_2026 } from "./roster"

/** 国旗の絵文字は地域表示記号2つでできている。A が U+1F1E6、Z が U+1F1FF。 */
const FIRST = 0x1f1e6
const LAST = 0x1f1ff

describe("ROSTER_2026", () => {
  /**
   * **国旗は「2文字とも英字」からしか作れない。**公式データの `countryCode`
   * は必ずしも ISO の2文字ではなく、Chinese Taipei には `"15"` が入っている。
   * 機械的に変換すると `🆶🆺` のような無関係な記号になる（実際になった）。
   */
  test("国旗は空か、地域表示記号ちょうど2つ", () => {
    const broken = ROSTER_2026.filter((team) => {
      if (team.flag === "") return false
      // 文字列は広げずに `u` 付きの正規表現で1文字ずつ拾う。広げると
      // 絵文字を壊す書き方として lint に止められる。
      const points = (team.flag.match(/./gu) ?? []).map(
        (mark) => mark.codePointAt(0) ?? 0,
      )
      return (
        points.length !== 2 ||
        !points.every((point) => point >= FIRST && point <= LAST)
      )
    })
    expect(broken.map((team) => team.name)).toStrictEqual([])
  })

  test("名前は重複しない。重なると同じ国が2行になる", () => {
    const names = ROSTER_2026.map((team) => team.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("IOC コードは3文字。ISO3 と取り違えていないかの歯止め", () => {
    const codes = ROSTER_2026.map((team) => team.code).filter(
      (code): code is string => code !== null,
    )
    expect(codes.every((code) => /^[A-Z]{3}$/u.test(code))).toBe(true)
    // 取り違えると Algeria が DZA になる。IOC では ALG。
    expect(ROSTER_2026.find((team) => team.name === "Algeria")?.code).toBe(
      "ALG",
    )
  })

  /**
   * **地図の緑だけから作ると8チーム漏れる**（実際に漏れ、大会前の一覧から
   * Hong Kong が消えていた）。小さな島・地域は2026のチームページがあるのに
   * 緑の設定が無く、難民チームは地図に載らない(→ roster.ts の注記)。
   */
  test("地図で緑になっていない参加チームも入っている", () => {
    const names = new Set(ROSTER_2026.map((team) => team.name))
    const missed = [
      "American Samoa",
      "Cook Islands",
      "Federated States of Micronesia",
      "Hong Kong (China)",
      "Hope (Refugees)",
      "Kiribati",
      "Marshall Islands",
      "Tonga",
    ].filter((name) => !names.has(name))
    expect(missed).toStrictEqual([])
  })
})

describe("flagOf", () => {
  test("知らない名前は空を返す。落とさず、記号も作らない", () => {
    expect(flagOf("Atlantis")).toBe("")
  })

  test("2025 に出ていた国は旗を持つ", () => {
    expect(flagOf("Japan")).toBe("🇯🇵")
  })
})

describe("matchesQuery", () => {
  test("空の問い合わせは全部通す", () => {
    expect(matchesQuery("Japan", "")).toBe(true)
  })

  test("名前でも IOC コードでも引ける。大文字小文字は問わない", () => {
    expect(matchesQuery("Islamic Republic of Iran", "iri")).toBe(true)
    expect(matchesQuery("Islamic Republic of Iran", "iran")).toBe(true)
    // ISO3 では引けない。公式データが IOC だから(→ roster.ts の注記)。
    expect(matchesQuery("Islamic Republic of Iran", "irn")).toBe(false)
  })
})

describe("isLigated", () => {
  /**
   * 旗が描ける環境では2つの地域表示記号が合字になり、別々に測った幅の合計
   * より狭くなる。描けない環境では箱が2つ並ぶだけで、幅は合計と一致する。
   */
  test("合字になっていれば描ける", () => {
    expect(isLigated(32, 64)).toBe(true)
  })

  test("幅が合計と同じなら描けていない", () => {
    expect(isLigated(64, 64)).toBe(false)
  })

  test("1px の差は丸めとみなし、描けているとは判定しない", () => {
    expect(isLigated(63.5, 64)).toBe(false)
  })
})
