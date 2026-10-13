import { createFileRoute, Link } from "@tanstack/react-router"

import { AllianceCard } from "~/match/alliance-card"
import { useTeamFacts } from "~/match/facts"
import { SpecTable } from "~/match/spec-table"
import { matchWhen } from "~/official/clock"
import { freshnessNote, StaleNotice } from "~/official/freshness"
import { alliancesOf, parseMatches } from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { usePitRecords } from "~/pit/records"
import { useQuestions } from "~/question/list"
import { TitleWithNote } from "~/ui/title-with-note"

export const Route = createFileRoute("/matches/$match")({
  component: MatchDetail,
})

// TODO: 自チームはサーバの OUR_TEAM が正。設定を返すルートを足したら消す。
const OUR_TEAM = "Japan"

// 注記は文字列で持つ。JSX の中で日本語を改行すると、その改行が空白になる。
const SPEC_NOTE =
  "6チームのピット記録を1枚で見比べる。列がチーム、行が聞き取りの項目。" +
  "**申告であって実績ではない。**答えが無い欄は「—」。" +
  "チーム名を押すと、その記録の全文へ入る（戻るとこの試合へ戻る）。"

const DETAIL_NOTE =
  "この試合に出る6チームを、公式の順位と点つきで並べる。" +
  "国を押すと、そのチームのピット記録へ入る。"

function MatchDetail() {
  const { match: name } = Route.useParams()
  const snapshot = useSnapshot()
  const factsOf = useTeamFacts()
  const questions = useQuestions()
  const records = usePitRecords()

  if (snapshot.isPending) {
    return <div className="p-4 text-secondary-ink">読み込んでいます。</div>
  }

  if (snapshot.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4">
        <h1 className="ui-section-heading">{name}</h1>
        <p className="mt-2 text-sm text-secondary-ink">
          読み込めませんでした。回線が戻ったら自動で読み直します。
        </p>
      </div>
    )
  }

  const match = parseMatches(snapshot.data.data).find(
    (item) => item.name === name,
  )

  // 試合が見つからないのは、公式が並べ替えた後に古いリンクを開いたとき。
  // 黙って一覧へ戻さず、何が起きたかを出す(→ W-04)。
  if (match === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4">
        <p className="text-xs text-muted-ink">
          <Link to="/matches" className="text-brand-hover">
            ← 試合一覧
          </Link>
        </p>
        <h1 className="ui-section-heading mt-1">{name}</h1>
        <p className="mt-2 text-sm text-secondary-ink">
          この試合は公式データにありません。名前が変わったか、消えています。
        </p>
      </div>
    )
  }

  const { red, blue } = alliancesOf(match)
  const ours = match.teams.includes(OUR_TEAM)

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <p className="text-xs text-muted-ink">
        <Link to="/matches" className="text-brand-hover">
          ← 試合一覧
        </Link>
      </p>

      <TitleWithNote
        title={match.name}
        note={
          DETAIL_NOTE +
          freshnessNote(snapshot.data.fetchedAt, snapshot.data.stale)
        }
      />

      <StaleNotice
        fetchedAt={snapshot.data.fetchedAt}
        stale={snapshot.data.stale}
      />

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        {match.played ? (
          <span className="text-[26px] leading-tight font-extrabold tabular-nums">
            <span className="text-alliance-red">{match.redScore ?? "—"}</span>
            <span className="mx-1.5 text-muted-ink">/</span>
            <span className="text-alliance-blue">{match.blueScore ?? "—"}</span>
          </span>
        ) : (
          <span className="text-[15px] font-bold text-muted-ink">
            まだ行われていない
          </span>
        )}
        {match.played ? (
          <span className="ui-source-tag" data-source="official">
            公式
          </span>
        ) : null}
        {matchWhen(match.scheduledTime, match.field) === "" ? null : (
          <span className="text-[13px] font-bold text-secondary-ink tabular-nums">
            {matchWhen(match.scheduledTime, match.field)}
          </span>
        )}
        {ours ? null : (
          <span className="text-xs text-secondary-ink">
            {OUR_TEAM} は出ない
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <AllianceCard
          teams={red}
          tone="red"
          ourTeam={OUR_TEAM}
          from={match.name}
          factsOf={factsOf}
        />
        <AllianceCard
          teams={blue}
          tone="blue"
          ourTeam={OUR_TEAM}
          from={match.name}
          factsOf={factsOf}
        />
      </div>

      {/* **横長の画面でだけ出す。**6列は狭い画面に入らず、入れるとどの列も
          読めない幅になる。カードは残すので、狭い画面でも中身は読める。 */}
      <section className="mt-6 hidden lg:block">
        <TitleWithNote
          as="h2"
          className="ui-card-title"
          title="6チームの記録"
          note={SPEC_NOTE}
        />
        {questions.isPending || records.isPending ? (
          <p className="mt-2 text-sm text-secondary-ink">
            記録を読み込んでいます。
          </p>
        ) : questions.isError || records.isError ? (
          <p className="mt-2 text-sm text-secondary-ink">
            記録を読み込めませんでした。回線が戻ったら自動で読み直します。
          </p>
        ) : (
          <SpecTable
            teams={match.teams}
            ourTeam={OUR_TEAM}
            matchName={match.name}
            questions={questions.data}
            records={records.data}
            factsOf={factsOf}
          />
        )}
      </section>
    </div>
  )
}
