import { describe, expect, test } from "vite-plus/test"

import { alliancesOf, matchesOf, parseMatches, parseRankings } from "./parse"

/**
 * キー名が確定していないので、当たったときに読めることと、
 * 当たらなかったときに落ちないことの両方を固定する。
 */

describe("parseMatches", () => {
  const data = {
    matches: [
      {
        name: "Q31",
        participants: [
          { country: "Japan" },
          { country: "Kenya" },
          { country: "Peru" },
          { country: "Poland" },
          { country: "Egypt" },
          { country: "Nepal" },
        ],
        redScore: 251,
        blueScore: 204,
        field: "2",
        played: true,
      },
    ],
  }

  test("既知の形を読む", () => {
    const [match] = parseMatches(data)
    expect(match?.name).toBe("Q31")
    expect(match?.teams.length).toBe(6)
    expect(match?.redScore).toBe(251)
    expect(match?.played).toBe(true)
  })

  test("played が無くても、両方のスコアが入っていれば消化済みとみなす", () => {
    const [match] = parseMatches({
      matches: [{ name: "Q1", redScore: 10, blueScore: 20 }],
    })
    expect(match?.played).toBe(true)
  })

  test("スコアが無ければ未消化として扱う", () => {
    const [match] = parseMatches({ matches: [{ name: "Q1" }] })
    expect(match?.played).toBe(false)
    expect(match?.redScore).toBe(null)
  })

  test("数値が文字列で返っても読む", () => {
    const [match] = parseMatches({
      matches: [{ name: "Q1", redScore: "120", blueScore: "98" }],
    })
    expect(match?.redScore).toBe(120)
  })

  test("名前の無い要素は落として、残りを読む", () => {
    const parsed = parseMatches({
      matches: [{ redScore: 1 }, { name: "Q2" }],
    })
    expect(parsed.length).toBe(1)
    expect(parsed[0]?.name).toBe("Q2")
  })

  test("知らないキーが増えていても落ちない", () => {
    const [match] = parseMatches({
      matches: [
        {
          name: "Q1",
          details: { neverSeenBefore: { nested: [1, 2] } },
          somethingNew: true,
        },
      ],
    })
    expect(match?.name).toBe("Q1")
    expect(match?.teams).toEqual([])
  })

  test("形が違っても例外を投げず空を返す", () => {
    expect(parseMatches(undefined)).toEqual([])
    expect(parseMatches(null)).toEqual([])
    expect(parseMatches({})).toEqual([])
    expect(parseMatches({ matches: "not an array" })).toEqual([])
    expect(parseMatches([1, 2, 3])).toEqual([])
  })
})

describe("parseRankings", () => {
  test("キャメルケースとスネークケースのどちらでも読む", () => {
    const camel = parseRankings({
      rankings: [
        {
          team: "Japan",
          rank: 12,
          rankingScore: 205,
          highestPoints: 241,
          climbPoints: 1.85,
          played: 3,
        },
      ],
    })
    const snake = parseRankings({
      rankings: [
        {
          country: "Japan",
          rank: 12,
          ranking_score: 205,
          highest_points: 241,
          climb_points: 1.85,
          played: 3,
        },
      ],
    })
    expect(camel[0]).toEqual(snake[0])
  })

  test("読めない項目は null になり、行そのものは残る", () => {
    const [row] = parseRankings({ rankings: [{ team: "Japan" }] })
    expect(row?.team).toBe("Japan")
    expect(row?.rank).toBe(null)
    expect(row?.climbPoints).toBe(null)
  })
})

describe("matchesOf", () => {
  const matches = parseMatches({
    matches: [
      {
        name: "Q6",
        participants: [{ country: "Japan" }, { country: "Ghana" }],
        redScore: 176,
        blueScore: 150,
      },
      {
        name: "Q31",
        participants: [{ country: "Japan" }, { country: "Poland" }],
      },
      {
        name: "Q40",
        participants: [{ country: "Kenya" }, { country: "Poland" }],
      },
    ],
  })

  test("自チームが出る試合だけを、未消化が先に来る順で返す", () => {
    const mine = matchesOf(matches, "Japan")
    expect(mine.map((match) => match.name)).toEqual(["Q31", "Q6"])
  })

  test("出ていないチームには空を返す", () => {
    expect(matchesOf(matches, "Iceland")).toEqual([])
  })
})

describe("alliancesOf", () => {
  test("前半が赤、後半が青になる", () => {
    const [match] = parseMatches({
      matches: [
        {
          name: "Q31",
          participants: [
            { country: "Japan" },
            { country: "Kenya" },
            { country: "Peru" },
            { country: "Poland" },
            { country: "Egypt" },
            { country: "Nepal" },
          ],
        },
      ],
    })
    if (match === undefined) throw new Error("match is missing")

    const { red, blue } = alliancesOf(match)
    expect(red).toEqual(["Japan", "Kenya", "Peru"])
    expect(blue).toEqual(["Poland", "Egypt", "Nepal"])
  })
})

/**
 * 2025 大会の実データ（web.archive.org に残っていたもの）から写した形。
 *
 * **想像で書いた形ではなく、実際に返ってきた形である。**去年これで動いて
 * いたので、同じシステムを使う今年も同じ形で来る見込みが高い。
 * 重要なのは2点:
 *   1. `rankings[].team` は文字列ではなくオブジェクトで、名前とコードを持つ
 *   2. `matches[].participants[]` は **国コードしか持たない**。名前は無い
 */
describe("2025 の実データの形", () => {
  const real = {
    rankings: [
      {
        rank: 1,
        played: 12,
        rankingScore: 39.18,
        highestScore: 79,
        team: { teamKey: 88, country: "JPN", countryCode: "jp", name: "Japan" },
      },
      {
        rank: 2,
        played: 12,
        team: {
          teamKey: 97,
          country: "KOR",
          countryCode: "kr",
          name: "Republic of Korea",
        },
      },
    ],
    matches: [
      {
        name: "Ranking Match 1",
        redScore: 12,
        blueScore: 16,
        played: true,
        field: "1",
        participants: [
          { station: 23, teamKey: 97, country: "KOR", countryCode: "kr" },
          { station: 11, teamKey: 88, country: "JPN", countryCode: "jp" },
          { station: 12, teamKey: 70, country: "GRN", countryCode: "gd" },
          { station: 13, teamKey: 20, country: "BHU", countryCode: "bt" },
          { station: 21, teamKey: 64, country: "GAM", countryCode: "gm" },
          { station: 22, teamKey: 18, country: "BEN", countryCode: "bj" },
        ],
      },
    ],
  }

  test("順位表の team がオブジェクトでも名前とコードを読む", () => {
    const rows = parseRankings(real)
    expect(rows.length).toBe(2)
    expect(rows[0]?.team).toBe("Japan")
    expect(rows[0]?.code).toBe("JPN")
    expect(rows[1]?.team).toBe("Republic of Korea")
  })

  test("試合の国コードを順位表の表示名へ寄せる", () => {
    const [match] = parseMatches(real)
    // コードのままだと画面に "JPN" と出て、自チーム "Japan" とも一致しない。
    expect(match?.teams).toContain("Japan")
    expect(match?.teams).toContain("Republic of Korea")
    expect(match?.teams).not.toContain("JPN")
  })

  test("station の順でアライアンスを分ける", () => {
    const [match] = parseMatches(real)
    if (match === undefined) throw new Error("match が無い")
    const { red, blue } = alliancesOf(match)
    // 応答では station 23 が先頭に来ているが、赤は 11/12/13 の3つになる。
    expect(red).toEqual(["Japan", "Grenada", "Bhutan"])
    expect(blue).toEqual(["Gambia", "Benin", "Republic of Korea"])
  })

  /**
   * **順位表は1試合も消化していない間は空。**2026 はその状態でマッチ
   * スケジュールだけが先に出た。受け皿が無いと全チームがコードで並び、
   * 自チームもどの試合にも一致しない(→ team/roster.ts の nameOfCode)。
   */
  test("順位表が空でも参加国名簿から名前を引く", () => {
    const [match] = parseMatches({ ...real, rankings: [] })
    expect(match?.teams).toContain("Japan")
    expect(match?.teams).not.toContain("JPN")
  })

  /**
   * **2026 は順位表が出た時点で `Team Japan` になった**（185件すべて）。
   * そのままだと自チームがどの試合にも当たらず、ピット記録の鍵（国名）とも
   * ずれる。接頭辞があるときだけ剥がす。
   */
  test("公式の `Team ` 接頭辞を剥がして、これまでの名前にそろえる", () => {
    const withPrefix = {
      rankings: [
        {
          rank: 10,
          rankingScore: 261,
          team: { country: "JPN", countryCode: "jp", name: "Team Japan" },
        },
      ],
      matches: [
        {
          name: "Ranking Match 3",
          participants: [{ station: 11, country: "JPN" }],
        },
      ],
    }
    expect(parseRankings(withPrefix)[0]?.team).toBe("Japan")
    expect(parseMatches(withPrefix)[0]?.teams).toStrictEqual(["Japan"])
  })

  test("接頭辞が無ければ何もしない。公式が付けるのをやめても動く", () => {
    expect(parseRankings(real)[0]?.team).toBe("Japan")
  })

  test("`Team` だけの名前は剥がさない。剥がすと何も残らない", () => {
    const only = {
      rankings: [{ team: { country: "ZZZ", name: "Team" } }],
      matches: [],
    }
    expect(parseRankings(only)[0]?.team).toBe("Team")
  })

  test("どちらでも引けないコードはコードのまま出す。落とさない", () => {
    const [match] = parseMatches({
      rankings: [],
      matches: [
        {
          name: "Ranking Match 1",
          participants: [{ station: 11, country: "ZZZ" }],
        },
      ],
    })
    expect(match?.teams).toEqual(["ZZZ"])
  })
})
