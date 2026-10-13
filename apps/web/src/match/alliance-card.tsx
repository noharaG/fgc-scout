import { Link } from "@tanstack/react-router"

import { flagOf } from "~/team/roster"

import { averageScore, type TeamFacts } from "./facts"

/**
 * アライアンス1つぶんのカード。「次の試合」と「試合詳細」で使う(→ S-10)。
 *
 * 名前だけでは相手の強さが分からないので、公式の順位と点を添える。
 * **国を押すとそのチームの記録へ入る。**行ごと入口にしてあるのは、名前だけを
 * 的にすると指では狙いにくいため(→ 10-若者向けアプリ.md の Y-13)。
 */

const CARD = "rounded-card border border-line bg-white shadow-card"
const TEAM_ROW =
  "flex items-center gap-2 border-b border-line py-2 last:border-b-0"
const ALLIANCE_TAG = "rounded-tag px-2 py-0.5 text-xs font-bold text-white"
// 事前の札。現地（申告の札）より弱く見せる。地と文字を対で持つ。
const BEFORE_TAG =
  "rounded-tag border border-line bg-surface-soft px-[5px] py-px text-[10px] font-bold text-secondary-ink"

export function AllianceCard({
  teams,
  tone,
  ourTeam,
  from,
  factsOf,
}: {
  readonly teams: readonly string[]
  readonly tone: "red" | "blue"
  /** 自チーム名。この行に「自分」の札を出し、どちら側かの判定にも使う。 */
  readonly ourTeam: string
  /**
   * どの試合から開くか。チーム画面の「戻る」をここへ向ける。渡さなければ
   * チーム一覧へ戻る（「次の試合」から開いたときは試合名を持たせない）。
   */
  readonly from?: string
  readonly factsOf: (team: string) => TeamFacts
}) {
  const ours = teams.includes(ourTeam)
  const average = averageScore(teams, factsOf)

  return (
    <div className={`${CARD} min-w-0 flex-1 basis-64 p-4`}>
      <p className="flex items-center gap-2 text-xs font-bold text-secondary-ink">
        <span
          className={`${ALLIANCE_TAG} ${
            tone === "red" ? "bg-alliance-red" : "bg-alliance-blue"
          }`}
        >
          {tone === "red" ? "赤" : "青"}
        </span>
        <span className="min-w-0 flex-1">{ours ? "自分たち" : "相手"}</span>
        {/* 3台ぶんの平均。強さの目安が無いと、どちらに寄せるか決められない。 */}
        {average === null ? null : (
          <>
            <span className="tabular-nums">平均 RS {average.toFixed(1)}</span>
            <span className="ui-source-tag" data-source="official">
              公式
            </span>
          </>
        )}
      </p>
      <ul className="mt-2">
        {teams.map((team) => {
          const facts = factsOf(team)
          return (
            <li key={team} className={TEAM_ROW}>
              <Link
                to="/teams/$team"
                params={{ team }}
                search={{ from }}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">
                    {/* 国旗は飾りで、名前が本体。読み上げからは外す。 */}
                    <span aria-hidden="true" className="ui-flag mr-1.5">
                      {flagOf(team)}
                    </span>
                    {team}
                  </span>
                  <span className="block text-xs text-secondary-ink tabular-nums">
                    {facts.rank === null
                      ? "順位はまだ出ていない"
                      : `${String(facts.rank)}位`}
                    {facts.rankingScore === null
                      ? ""
                      : ` · RS ${facts.rankingScore.toFixed(2)}`}
                    {facts.highestScore === null
                      ? ""
                      : ` · 最高 ${String(facts.highestScore)}`}
                  </span>
                </span>
              </Link>
              {/* **「ピット」とだけ出さない。**事前調べしか無いチームが
                  会場で聞いた扱いに見え、回り漏れる(→ pit/summary.ts)。
                  チーム一覧と同じ語彙（現地 / 事前）にそろえる。 */}
              {team === ourTeam ? (
                <span className="ui-source-tag" data-source="official">
                  自分
                </span>
              ) : facts.stage === "onsite" ? (
                <span className="ui-source-tag" data-source="declared">
                  現地
                </span>
              ) : facts.stage === "before" ? (
                <span className={BEFORE_TAG}>事前</span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
