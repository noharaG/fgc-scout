import { Link } from "@tanstack/react-router"

import { latestByTeam, type RecordStage } from "~/pit/summary"
import { answerText } from "~/question/answer"
import { groupLabel, groupQuestions, type QuestionSet } from "~/question/list"
import { flagOf } from "~/team/roster"

import type { TeamFacts } from "./facts"

/**
 * 1試合の6チームを1枚の表で見比べる。**横長の画面でだけ出す。**
 *
 * 試合前に知りたいのは「誰が何をできるか」の差で、カードを縦に6枚読んでも
 * 比べられない。列をチーム、行を聞き取り項目にすれば、同じ行を横に見るだけで
 * 差が出る。
 *
 * 狭い画面には出さない。6列は入らず、入れるとどの列も読めない幅になる
 * (→ チーム一覧で表をやめた経緯)。
 *
 * **行方向にも見出しがある2次元の表**なので `scope` を明示する(→ O-33)。
 */

const TH =
  "sticky left-0 z-10 bg-surface-soft px-3 py-2 text-left text-xs font-extrabold whitespace-nowrap text-secondary-ink"
const TD = "border-b border-line px-3 py-2 align-top text-[13px]"

type Record_ = {
  readonly team: string
  readonly recordedAt: number
  readonly answers: readonly {
    readonly questionId: string
    readonly valueNumber: number | null
    readonly valueText: string | null
    readonly valueChoices: readonly string[]
  }[]
  readonly photos: readonly { readonly questionId: string }[]
}

export function SpecTable({
  teams,
  ourTeam,
  matchName,
  questions,
  records,
  factsOf,
}: {
  readonly teams: readonly string[]
  readonly ourTeam: string
  readonly matchName: string
  readonly questions: QuestionSet
  readonly records: readonly Record_[]
  readonly factsOf: (team: string) => TeamFacts
}) {
  // 各チームの最新の記録。チーム詳細の「最新」と同じ決め方にそろえる。
  const latest = latestByTeam(records)
  const groups = groupQuestions(questions).filter(
    (group) => group.items.length > 0,
  )

  /** 1マス。答えが無ければ記号を置く。空欄だと欠測と区別が付かない(→ W-22)。 */
  const cell = (team: string, questionId: string, photo: boolean): string => {
    const record = latest.get(team)
    if (record === undefined) return "—"
    if (photo) {
      const count = record.photos.filter(
        (item) => item.questionId === questionId,
      ).length
      return count === 0 ? "—" : `${String(count)} 枚`
    }
    const answer = record.answers.find((item) => item.questionId === questionId)
    return answer === undefined ? "—" : answerText(questions, answer).value
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-control border border-line bg-white">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              項目
            </th>
            {teams.map((team, index) => {
              const stage: RecordStage = factsOf(team).stage
              return (
                <th
                  key={team}
                  scope="col"
                  className={`bg-surface-soft px-3 py-2 text-left align-bottom text-xs whitespace-nowrap ${
                    // 前半3つが赤、後半が青。どちら側かが分からないと読めない。
                    index < teams.length / 2
                      ? "border-t-[3px] border-alliance-red"
                      : "border-t-[3px] border-alliance-blue"
                  }`}
                >
                  <Link
                    to="/teams/$team"
                    params={{ team }}
                    search={{ from: matchName }}
                    className="font-extrabold text-ink no-underline"
                  >
                    <span aria-hidden="true" className="ui-flag mr-1">
                      {flagOf(team)}
                    </span>
                    {team}
                  </Link>
                  <span className="mt-0.5 block font-bold text-secondary-ink">
                    {team === ourTeam
                      ? "自分"
                      : stage === "onsite"
                        ? "現地"
                        : stage === "before"
                          ? "事前のみ"
                          : "未記録"}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <>
              <tr key={group.key}>
                <th
                  scope="col"
                  colSpan={teams.length + 1}
                  className="bg-brand-surface px-3 py-1.5 text-left text-[11px] font-extrabold text-brand-hover"
                >
                  {groupLabel(questions.groups, group.key)}
                </th>
              </tr>
              {group.items.map((question) => (
                <tr key={question.id}>
                  <th scope="row" className={TH}>
                    {question.labelJa}
                  </th>
                  {teams.map((team) => (
                    <td
                      key={team}
                      className={`${TD} ${
                        team === ourTeam ? "bg-brand-surface font-bold" : ""
                      }`}
                    >
                      {cell(team, question.id, question.inputType === "photo")}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
