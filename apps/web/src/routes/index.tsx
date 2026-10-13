import { createFileRoute, Link } from "@tanstack/react-router"

import { matchWhen } from "~/official/clock"
import { freshnessNote, StaleNotice } from "~/official/freshness"
import {
  alliancesOf,
  matchesOf,
  parseMatches,
  type OfficialMatch,
} from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { AllianceCard } from "~/match/alliance-card"
import { useTeamFacts, type TeamFacts } from "~/match/facts"
import { TitleWithNote } from "~/ui/title-with-note"

export const Route = createFileRoute("/")({ component: NextMatch })

// TODO: 自チームはサーバの OUR_TEAM が正。設定を返すルートを足したら消す。
const OUR_TEAM = "Japan"

// 注記は文字列で持つ。JSX の中で日本語を改行すると、その改行が空白になって
// 「載って から出す」のように語の途中で切れる。
const NEXT_MATCH_NOTE =
  `公式のマッチスケジュールから、${OUR_TEAM} の次の1試合を出す。` +
  "各チームの推定貢献は、公式データに試合が載ってから出す。"

function MatchView({
  match,
  factsOf,
}: {
  match: OfficialMatch
  factsOf: (team: string) => TeamFacts
}) {
  const { red, blue } = alliancesOf(match)
  return (
    <>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="text-[26px] leading-tight font-extrabold">
          {match.name}
        </span>
        {/* いつ・どこか。試合名だけでは動けない。 */}
        {matchWhen(match.scheduledTime, match.field) === "" ? null : (
          <span className="rounded-tag bg-brand-surface px-2.5 py-1 text-[13px] font-extrabold text-brand-hover tabular-nums">
            {matchWhen(match.scheduledTime, match.field)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <AllianceCard
          teams={red}
          tone="red"
          ourTeam={OUR_TEAM}
          factsOf={factsOf}
        />
        <AllianceCard
          teams={blue}
          tone="blue"
          ourTeam={OUR_TEAM}
          factsOf={factsOf}
        />
      </div>

      {/* **「この試合で効くこと」は置かない。**得点式から導ける話ではあるが、
          どの試合でも同じ3行なので、試合ごとに読むものではなかった
          (→ 要件定義書 F5-3)。この画面は次の1試合の相手を見る場所に絞る。

          TODO: 各チームの推定貢献はまだ出していない。公式データに試合が
          載り、details のキーが判明した時点で F4 を実装する。
          それまでの断りは「？」の中に置く(→ NextMatch の note)。 */}
    </>
  )
}

function NextMatch() {
  const snapshot = useSnapshot()
  const factsOf = useTeamFacts()

  if (snapshot.isPending) {
    return <Shell>公式データを読み込んでいます。</Shell>
  }

  if (snapshot.isError) {
    const unauthenticated = snapshot.error.message === "unauthenticated"
    return (
      <Shell>
        {unauthenticated ? (
          <p>
            共有パスワードで入り直してください。
            <Link to="/login" className="ml-2 font-bold text-brand-hover">
              ログイン
            </Link>
          </p>
        ) : (
          <p>
            公式データを取得できませんでした（{snapshot.error.message}）。
            回線が戻ったら自動で読み直します。
          </p>
        )}
      </Shell>
    )
  }

  const matches = parseMatches(snapshot.data.data)
  const mine = matchesOf(matches, OUR_TEAM)
  const next = mine[0]

  return (
    <Shell>
      <TitleWithNote
        title="次の試合"
        note={
          NEXT_MATCH_NOTE +
          freshnessNote(snapshot.data.fetchedAt, snapshot.data.stale)
        }
      />

      <StaleNotice
        fetchedAt={snapshot.data.fetchedAt}
        stale={snapshot.data.stale}
      />

      {next === undefined ? (
        <p className="mt-2 text-secondary-ink">
          {matches.length === 0
            ? "公式サイトにまだ試合が載っていません。大会が始まると自動で表示されます。"
            : `${OUR_TEAM} の試合はまだ公開されていません。`}
        </p>
      ) : (
        <MatchView match={next} factsOf={factsOf} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl p-4">{children}</div>
}
