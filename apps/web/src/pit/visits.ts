import { matchWhenShort } from "~/official/clock"
import type { RecordStage } from "./summary"
import { alliancesOf, type OfficialMatch } from "~/official/parse"

export type VisitEntry = {
  readonly team: string
  /** 対戦が分かっていないときは空。大会前は当たる試合がまだ無い。 */
  readonly matchName: string
  /** その試合がいつ・どこか。回る順を決めるのに使う。無ければ空。 */
  readonly when: string
  readonly side: "ally" | "opponent" | "unknown"
  /**
   * 記録の段階。**「記録があるか」では足りない。**10/5 までの事前調べしか
   * 無いチームを会場で回った扱いにすると、回り漏れる(→ pit/summary.ts)。
   */
  readonly stage: RecordStage
  /** そのチームとの試合が済んだか。並び順はこれで決まる。 */
  readonly played: boolean
}

/**
 * 訪問リストを作る。**3段に分ける。**
 *
 *   1. これから当たるチーム（当たる順）
 *   2. 当たる予定のないチーム（名前順）
 *   3. 試合が済んだチーム
 *
 * **下へ送る基準は「記録したか」ではなく「その試合が済んだか」。**記録した
 * 途端に下へ動くと、まだ当たっていない相手が一覧の底へ沈み、直前に見返したい
 * ときに探すことになる。記録の有無は色で示し、位置は動かさない。
 *
 * **当たる予定のないチームも消さない。**プレーオフで誰と組むかは事前に
 * 決まらないので、手が空いたときに回る先が要る。ただし優先はしないので
 * 下へ固める。
 *
 * 済んだ試合の相手はいちばん下。消しはしない。記録を見返したり、書き足したり
 * することがある。
 *
 * 味方と相手を区別せず、どちらも同じ重みで挙げる。順位は平均スコアで決まり、
 * 6チーム全員の合計を上げるのが目的なので、相手の能力も同じだけ要る
 * (→ 要件定義書 2.3)。
 */
export function visitList(
  matches: readonly OfficialMatch[],
  ourTeam: string,
  stages: ReadonlyMap<string, RecordStage>,
): readonly VisitEntry[] {
  type Seen = {
    readonly matchName: string
    readonly when: string
    readonly side: "ally" | "opponent"
  }

  // まだ当たっていない試合を優先する。同じ相手と2度当たることがあり、
  // 先に済んだ試合で拾うと、これからの試合があるのに下へ送ってしまう。
  const upcoming = new Map<string, Seen>()
  const finished = new Map<string, Seen>()

  for (const match of matches) {
    if (!match.teams.includes(ourTeam)) continue

    const { red, blue } = alliancesOf(match)
    const ourSide = red.includes(ourTeam) ? red : blue
    const into = match.played ? finished : upcoming

    for (const team of match.teams) {
      if (team === ourTeam) continue
      if (into.has(team)) continue
      into.set(team, {
        matchName: match.name,
        when: matchWhenShort(match.scheduledTime, match.field),
        side: ourSide.includes(team) ? "ally" : "opponent",
      })
    }
  }

  const entry = (team: string, seen: Seen, played: boolean): VisitEntry => ({
    team,
    matchName: seen.matchName,
    when: seen.when,
    side: seen.side,
    stage: stages.get(team) ?? "none",
    played,
  })

  // 当たる予定のないチーム。**出場している全チームから引く。**参加国の表から
  // 作ると、公式と綴りが違う名前が混ざって同じ国が2行になる(→ team/roster.ts)。
  const others = new Set<string>()
  for (const match of matches) {
    for (const team of match.teams) {
      if (team === ourTeam) continue
      if (upcoming.has(team) || finished.has(team)) continue
      others.add(team)
    }
  }

  return [
    ...[...upcoming].map(([team, seen]) => entry(team, seen, false)),
    // 当たる順という手がかりが無いので名前順にする。探すのが唯一の使い方。
    ...[...others]
      .toSorted((a, b) => a.localeCompare(b))
      .map((team) => ({
        team,
        matchName: "",
        when: "",
        side: "unknown" as const,
        stage: stages.get(team) ?? "none",
        played: false,
      })),
    ...[...finished]
      .filter(([team]) => !upcoming.has(team))
      .map(([team, seen]) => entry(team, seen, true)),
  ]
}

/**
 * 大会前の訪問リスト。公式にマッチスケジュールが載るまでは誰と当たるか
 * 分からないので、参加国をそのまま並べる。まだ当たる試合が無いので、
 * 記録しても下へは送らない。色だけが変わる。
 *
 * ここで使う名前は公式の表記ではない(→ team/roster.ts)。公式データが載ったら
 * この関数は使わず、`visitList` がスケジュールから作る。
 */
export function rosterVisitList(
  roster: readonly string[],
  stages: ReadonlyMap<string, RecordStage>,
): readonly VisitEntry[] {
  return roster.map((team) => ({
    team,
    matchName: "",
    when: "",
    side: "unknown" as const,
    stage: stages.get(team) ?? "none",
    played: false,
  }))
}
