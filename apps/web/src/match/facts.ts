import { parseRankings } from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { usePitRecords } from "~/pit/records"
import { stagesByTeam, type RecordStage } from "~/pit/summary"

/**
 * 1チームぶんの手がかり。**公式の数字と、ピット記録があるかどうかを混ぜない。**
 * 数字は公式、記録の有無は申告側の話で、画面では別の札を付けて出す
 * (→ AGENTS.md の Invariants)。
 */
export type TeamFacts = {
  readonly rank: number | null
  readonly rankingScore: number | null
  readonly highestScore: number | null
  /**
   * 記録の段階。**「記録があるか」では足りない。**10/5 までの事前調べしか
   * 無いチームを会場で回った扱いにすると、回り漏れる(→ pit/summary.ts)。
   */
  readonly stage: RecordStage
}

/**
 * 「次の試合」と「試合詳細」の2画面で使うのでここに置く(→ S-10)。
 *
 * 読み込み中や失敗のときは、値が無いものとして返す。**0 で埋めない。**
 * 埋めると「まだ数字が無い」が「いちばん弱い」に化ける(→ W-01)。
 */
export function useTeamFacts(): (team: string) => TeamFacts {
  const snapshot = useSnapshot()
  const records = usePitRecords()

  const ranked = new Map(
    snapshot.data === undefined
      ? []
      : parseRankings(snapshot.data.data).map((row) => [row.team, row]),
  )
  const stages =
    records.data === undefined
      ? new Map<string, RecordStage>()
      : stagesByTeam(records.data)

  return (team: string): TeamFacts => {
    const row = ranked.get(team)
    return {
      rank: row?.rank ?? null,
      rankingScore: row?.rankingScore ?? null,
      highestScore: row?.highestScore ?? null,
      stage: stages.get(team) ?? "none",
    }
  }
}

/** 平均 RS。**引けないチームは数に入れない。**0 で埋めると弱く見える(→ W-01)。 */
export function averageScore(
  teams: readonly string[],
  factsOf: (team: string) => TeamFacts,
): number | null {
  const scores = teams
    .map((team) => factsOf(team).rankingScore)
    .filter((score): score is number => score !== null)
  if (scores.length === 0) return null
  return scores.reduce((total, score) => total + score, 0) / scores.length
}
