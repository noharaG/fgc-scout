import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { matchWhenShort } from "~/official/clock"
import { freshnessNote, StaleNotice } from "~/official/freshness"
import { alliancesOf, parseMatches, type OfficialMatch } from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { TitleWithNote } from "~/ui/title-with-note"

// `matches.tsx` のままだと親レイアウトとして扱われ、`/matches/$match` が
// 一覧に食われて子が描画されない（`teams.tsx` でも同じ罠を踏んだ）。
export const Route = createFileRoute("/matches/")({ component: Matches })

// TODO: 自チームはサーバの OUR_TEAM が正。設定を返すルートを足したら消す。
const OUR_TEAM = "Japan"

// 状態で変わる色は、基底に片方を書いて条件でもう片方を足す形にしない。
// 同じプロパティのユーティリティは生成順で勝ち負けが決まるので、足した側が
// 黙って負ける。両方の状態を排他の定数に分ける。
const ROW = "rounded-card border px-3 py-2.5"
const ROW_PLAIN = "border-line bg-white"
const ROW_MINE = "border-brand bg-brand-surface"
const ALLIANCE_TAG =
  "w-6 shrink-0 rounded-tag py-0.5 text-center text-[11px] font-bold text-white"

/** アライアンス1つぶんの行。自分たちの側だけ地を敷いて太くする。 */
function AllianceLine({
  tone,
  teams,
  ours,
}: {
  tone: "red" | "blue"
  teams: readonly string[]
  ours: boolean
}) {
  return (
    <div
      className={`mt-1 flex items-center gap-2 rounded-control px-1.5 py-1 ${
        ours ? "bg-white" : ""
      }`}
    >
      <span
        className={`${ALLIANCE_TAG} ${
          tone === "red" ? "bg-alliance-red" : "bg-alliance-blue"
        }`}
      >
        {tone === "red" ? "赤" : "青"}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] ${
          ours ? "font-bold text-ink" : "text-secondary-ink"
        }`}
      >
        {/* 自分たちの名前だけ太くする。6つ並ぶ中から目で拾えるようにする。 */}
        {teams.map((team, index) => (
          <span key={team}>
            {index === 0 ? "" : " · "}
            <span className={team === OUR_TEAM ? "font-extrabold" : ""}>
              {team}
            </span>
          </span>
        ))}
      </span>
      {ours ? (
        <span className="shrink-0 rounded-tag bg-brand px-[7px] py-0.5 text-[10.5px] font-bold text-white">
          自分たち
        </span>
      ) : null}
    </div>
  )
}

/**
 * 1試合ぶんのカード。**試合名とアライアンスを上下に分ける。**
 *
 * 横に並べると、`Ranking Match 199` のような長い名前が細い桁で3行に折れて、
 * 隣のチーム名と混ざって読めなくなる（実データで起きた）。名前は1行に伸ばし、
 * アライアンスはその下に1段ずつ置く。
 */
function MatchRow({ match }: { match: OfficialMatch }) {
  const { red, blue } = alliancesOf(match)
  const mine = match.teams.includes(OUR_TEAM)
  const ourTone = red.includes(OUR_TEAM) ? "red" : "blue"

  return (
    <li>
      {/* カードごと入口にする。行の中に小さなリンクを置くと、試合名の
          文字幅ぶんしか的が無い(→ 10-若者向けアプリ.md の Y-13)。 */}
      <Link
        to="/matches/$match"
        params={{ match: match.name }}
        className={`block no-underline ${ROW} ${mine ? ROW_MINE : ROW_PLAIN}`}
      >
        <div className="flex items-baseline gap-2.5">
          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
            {match.name}
          </span>
          {/* いつ・どこか。会場では試合名より先にこれを見る。 */}
          <span className="shrink-0 text-[11.5px] font-bold text-secondary-ink tabular-nums">
            {matchWhenShort(match.scheduledTime, match.field)}
          </span>
          {match.played ? (
            <span className="shrink-0 text-[15px] font-extrabold tabular-nums">
              <span className="text-alliance-red">{match.redScore ?? "—"}</span>
              <span className="mx-1 text-muted-ink">/</span>
              <span className="text-alliance-blue">
                {match.blueScore ?? "—"}
              </span>
            </span>
          ) : (
            <span className="shrink-0 text-xs font-bold text-muted-ink">
              予定
            </span>
          )}
        </div>

        <AllianceLine tone="red" teams={red} ours={mine && ourTone === "red"} />
        <AllianceLine
          tone="blue"
          teams={blue}
          ours={mine && ourTone === "blue"}
        />
      </Link>
    </li>
  )
}

function Matches() {
  const snapshot = useSnapshot()
  const [onlyMine, setOnlyMine] = useState(true)

  if (snapshot.isPending) {
    return <div className="p-4 text-secondary-ink">読み込んでいます。</div>
  }

  if (snapshot.isError) {
    return (
      <div className="p-4">
        <h1 className="ui-section-heading">試合一覧</h1>
        <p className="mt-2 text-sm text-secondary-ink">
          公式データを取得できませんでした。回線が戻ったら自動で読み直します。
        </p>
      </div>
    )
  }

  const all = parseMatches(snapshot.data.data)
  const mine = all.filter((match) => match.teams.includes(OUR_TEAM))
  const shown = onlyMine ? mine : all
  const finished = mine.filter((match) => match.played).length

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <TitleWithNote
        title="試合一覧"
        note={
          <>
            公式のマッチスケジュールをそのまま並べる。順位は
            <strong className="font-extrabold">
              最低スコアの1試合を除いた平均
            </strong>
            で決まるので、残り試合のほうが効く。
            {freshnessNote(snapshot.data.fetchedAt, snapshot.data.stale)}
          </>
        }
      />

      <StaleNotice
        fetchedAt={snapshot.data.fetchedAt}
        stale={snapshot.data.stale}
      />

      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          aria-pressed={onlyMine}
          className="ui-segment h-9"
          onClick={() => {
            setOnlyMine(true)
          }}
        >
          自分の試合
        </button>
        <button
          type="button"
          aria-pressed={!onlyMine}
          className="ui-segment h-9"
          onClick={() => {
            setOnlyMine(false)
          }}
        >
          すべて
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-secondary-ink">
          公式サイトにまだ試合が載っていません。大会が始まると自動で表示されます。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shown.map((match) => (
            <MatchRow key={match.name} match={match} />
          ))}
        </ul>
      )}

      {/* 数字は残し、その読み方は「？」へ移した。 */}
      {mine.length === 0 ? null : (
        <div className="mt-4 rounded-card bg-brand-surface px-3.5 py-3 text-xs text-secondary-ink">
          {OUR_TEAM} は <strong className="font-extrabold">{finished}</strong>{" "}
          試合済み・
          <strong className="font-extrabold">
            {mine.length - finished}
          </strong>{" "}
          試合が残り
        </div>
      )}
    </div>
  )
}
