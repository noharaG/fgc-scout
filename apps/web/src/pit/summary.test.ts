import { describe, expect, test } from "vite-plus/test"

import { latestByTeam, ON_SITE_FROM, stagesByTeam } from "./summary"

const HOUR = 60 * 60 * 1000

describe("ON_SITE_FROM", () => {
  test("会場（UTC+9）の 10/6 0:00。UTC では前日の 15:00", () => {
    expect(new Date(ON_SITE_FROM).toISOString()).toBe(
      "2026-10-05T15:00:00.000Z",
    )
  })
})

describe("stagesByTeam", () => {
  test("10/6 0:00 ちょうどからが現地、その直前までは事前", () => {
    const stages = stagesByTeam([
      { team: "Kenya", recordedAt: ON_SITE_FROM },
      { team: "Chile", recordedAt: ON_SITE_FROM - 1 },
    ])
    expect(stages.get("Kenya")).toBe("onsite")
    expect(stages.get("Chile")).toBe("before")
  })

  test("事前と現地の両方があれば現地。並び順に左右されない", () => {
    const before = { team: "Nepal", recordedAt: ON_SITE_FROM - 24 * HOUR }
    const onsite = { team: "Nepal", recordedAt: ON_SITE_FROM + HOUR }
    expect(stagesByTeam([before, onsite]).get("Nepal")).toBe("onsite")
    expect(stagesByTeam([onsite, before]).get("Nepal")).toBe("onsite")
  })

  test("記録の無いチームは持たない。引いた側で未記録にする", () => {
    expect(stagesByTeam([]).has("Japan")).toBe(false)
  })
})

describe("latestByTeam", () => {
  test("チームごとに、新しく作った時刻がいちばん後の記録を返す", () => {
    const old = { id: "a", team: "Malta", recordedAt: ON_SITE_FROM - HOUR }
    const fresh = { id: "b", team: "Malta", recordedAt: ON_SITE_FROM + HOUR }
    const other = { id: "c", team: "Fiji", recordedAt: ON_SITE_FROM }
    const latest = latestByTeam([fresh, old, other])
    expect(latest.get("Malta")?.id).toBe("b")
    expect(latest.get("Fiji")?.id).toBe("c")
  })
})
