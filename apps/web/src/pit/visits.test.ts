import { describe, expect, test } from "vite-plus/test"

import { parseMatches } from "~/official/parse"

import { visitList } from "./visits"

const matches = parseMatches({
  matches: [
    {
      // 済んだ試合。ここの相手は今さら回らない。
      name: "Q6",
      participants: [
        { country: "Japan" },
        { country: "Ghana" },
        { country: "Chile" },
        { country: "India" },
        { country: "Serbia" },
        { country: "Oman" },
      ],
      redScore: 176,
      blueScore: 150,
    },
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
    {
      // Japan が出ない試合。
      name: "Q33",
      participants: [{ country: "Brazil" }, { country: "Iceland" }],
    },
    {
      name: "Q44",
      participants: [
        { country: "Morocco" },
        { country: "Japan" },
        { country: "Iceland" },
        { country: "Brazil" },
        { country: "India" },
        { country: "Ghana" },
      ],
    },
    {
      // Japan と当たらないまま終わるチーム。プレーオフで組むことはある。
      name: "Q50",
      participants: [{ country: "Tunisia" }, { country: "Latvia" }],
    },
  ],
})

describe("visitList", () => {
  test("自チームを外し、味方も相手も同じように挙げる", () => {
    const teams = visitList(matches, "Japan", new Map()).map(
      (entry) => entry.team,
    )
    expect(teams).not.toContain("Japan")
    expect(teams).toContain("Poland")
    expect(teams).toContain("Morocco")
  })

  test("済んだ試合の相手は消さずに下へ送る", () => {
    const entries = visitList(matches, "Japan", new Map())
    const teams = entries.map((entry) => entry.team)

    // Q6 は消化済み。Chile はその試合だけに出る。
    expect(teams).toContain("Chile")
    expect(entries.find((entry) => entry.team === "Chile")?.played).toBe(true)

    const lastUpcoming = entries.map((e) => e.played).lastIndexOf(false)
    const firstPlayed = entries.findIndex((entry) => entry.played)
    expect(lastUpcoming).toBeLessThan(firstPlayed)
  })

  test("これからの試合がある相手は、済んだ試合にも出ていても上に残す", () => {
    // Ghana は済んだ Q6 と、これからの Q44 の両方に出る。
    const entries = visitList(matches, "Japan", new Map())
    expect(entries.find((entry) => entry.team === "Ghana")?.played).toBe(false)
  })

  test("1試合から挙がるのは5台。味方2・相手3で、自分は入らない", () => {
    // 味方3台のうち1台は必ず自チームなので、回る相手は味方2と相手3になる。
    const q31 = visitList(matches, "Japan", new Map()).filter(
      (entry) => entry.matchName === "Q31",
    )
    expect(q31.length).toBe(5)
    expect(q31.filter((entry) => entry.side === "ally").length).toBe(2)
    expect(q31.filter((entry) => entry.side === "opponent").length).toBe(3)
    expect(q31.map((entry) => entry.team)).not.toContain("Japan")
  })

  test("味方と相手を並び順から判定する", () => {
    const entries = visitList(matches, "Japan", new Map())
    const kenya = entries.find((entry) => entry.team === "Kenya")
    const poland = entries.find((entry) => entry.team === "Poland")
    expect(kenya?.side).toBe("ally")
    expect(poland?.side).toBe("opponent")
  })

  test("記録しても位置は動かさない。並ぶ順は試合が済んだかだけで決まる", () => {
    const before = visitList(matches, "Japan", new Map()).map((e) => e.team)
    const after = visitList(
      matches,
      "Japan",
      new Map([
        ["Kenya", "onsite" as const],
        ["Poland", "onsite" as const],
      ]),
    ).map((e) => e.team)

    // 記録の有無で並びが変わらない。変わると、まだ当たっていない相手が
    // 記録した途端に底へ沈み、試合直前に探すことになる。
    expect(after).toEqual(before)
  })

  /**
   * **事前調べしか無いチームを現地と同じに扱わない。**同じに扱うと会場で
   * 回り漏れる(→ pit/summary.ts)。訪問リストは3段で色と札を分ける。
   */
  test("事前の記録だけのチームは現地と区別する", () => {
    const entries = visitList(
      matches,
      "Japan",
      new Map([
        ["Kenya", "onsite" as const],
        ["Poland", "before" as const],
      ]),
    )
    expect(entries.find((e) => e.team === "Kenya")?.stage).toBe("onsite")
    expect(entries.find((e) => e.team === "Poland")?.stage).toBe("before")
    expect(entries.find((e) => e.team === "Egypt")?.stage).toBe("none")
  })

  test("同じチームが複数の試合に出ても1回だけ挙げる", () => {
    const teams = visitList(matches, "Japan", new Map()).map((e) => e.team)
    expect(teams.filter((team) => team === "Ghana").length).toBeLessThanOrEqual(
      1,
    )
  })

  test("当たる予定のないチームも挙げる。ただし当たる相手より下", () => {
    const entries = visitList(matches, "Japan", new Map())
    const teams = entries.map((entry) => entry.team)

    // Latvia と Tunisia は Japan と当たらない。それでも回れるようにする。
    expect(teams).toContain("Latvia")
    expect(teams).toContain("Tunisia")

    const latvia = entries.find((entry) => entry.team === "Latvia")
    expect(latvia?.side).toBe("unknown")
    expect(latvia?.matchName).toBe("")

    // これから当たる相手より後ろ。急ぐのはそちらなので上を譲らない。
    const scheduled = entries.findIndex(
      (entry) => !entry.played && entry.side !== "unknown",
    )
    expect(scheduled).toBeLessThan(teams.indexOf("Latvia"))
  })

  test("当たる予定のないチームは名前順。当たる順という手がかりが無い", () => {
    const entries = visitList(matches, "Japan", new Map())
    const others = entries
      .filter((entry) => !entry.played && entry.side === "unknown")
      .map((entry) => entry.team)
    expect(others).toStrictEqual(
      [...others].toSorted((a, b) => a.localeCompare(b)),
    )
  })

  test("試合が無ければ空を返す", () => {
    expect(visitList([], "Japan", new Map())).toEqual([])
  })
})
