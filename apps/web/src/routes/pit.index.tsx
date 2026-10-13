import { createFileRoute, Link } from "@tanstack/react-router"
import { freshnessNote, StaleNotice } from "~/official/freshness"
import { parseMatches } from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { usePitRecords } from "~/pit/records"
import { stagesByTeam } from "~/pit/summary"
import { rosterVisitList, visitList } from "~/pit/visits"
import { flagOf, matchesQuery, ROSTER_2026 } from "~/team/roster"
import { useRememberedText } from "~/ui/remembered"
import { TitleWithNote } from "~/ui/title-with-note"

export const Route = createFileRoute("/pit/")({ component: PitVisits })

// TODO: 自チームはサーバの OUR_TEAM が正。設定を返すルートを足したら消す。
const OUR_TEAM = "Japan"

// 状態で変わる色は排他の定数に分ける。基底に bg-white を置いて条件で
// bg-surface-soft を足すと、生成順で bg-white が勝ち、行の状態が
// 見分けられなくなる。
//
// 色は3段。まだ回っていない（白）・記録した（緑の枠）・試合が済んだ（沈める）。
// **記録しても位置は動かさない。**下へ送るのは試合が終わったときだけ
// (→ pit/visits.ts)。
const ROW = "flex items-center gap-2.5 rounded-card border px-3.5 py-3"
const ROW_TODO = "border-line bg-white"
const ROW_RECORDED = "border-rank-high bg-white"
// 事前調べだけの行。現地と同じ色にすると会場で回り漏れる(→ pit/summary.ts)。
const ROW_BEFORE = "border-rank-mid bg-white"
const ROW_PLAYED = "border-line bg-surface-soft text-muted-ink"
const STATE_TAG = "rounded-tag px-[7px] py-0.5 text-[11px] font-bold text-white"

// localStorage のキーは <アプリ名>_<用途> の小文字スネークケース(→ login.tsx)。
const SEARCH_KEY = "fgc_pit_search"

// 注記は文字列で持つ。JSX の中で日本語を改行すると、その改行が空白になる。
const VISIT_NOTE =
  "公式のマッチスケジュールから、まだ記録が無いチームを上に出す。" +
  "190チームは回れないので順番で決まる。" +
  "記録すると緑になり、試合が済むと下へ送られる。"
const BEFORE_EVENT_NOTE =
  "いまは公式サイトにまだ試合が載っていないので、参加確定国を全部並べている。" +
  "国名は2025大会の公式表記に合わせてある。試合が載ると、当たる順に並び替わる。"

function PitVisits() {
  const snapshot = useSnapshot()
  const records = usePitRecords()
  const [query, setQuery] = useRememberedText(SEARCH_KEY)

  if (snapshot.isPending || records.isPending) {
    return <div className="p-4 text-secondary-ink">読み込んでいます。</div>
  }

  if (snapshot.isError || records.isError) {
    return (
      <div className="p-4">
        <h1 className="ui-section-heading">ピット記録</h1>
        <p className="mt-2 text-sm text-secondary-ink">
          読み込めませんでした。回線が戻ったら自動で読み直します。
        </p>
      </div>
    )
  }

  const matches = parseMatches(snapshot.data.data)
  const stages = stagesByTeam(records.data)

  // 公式にマッチスケジュールが載るまでは誰と当たるか分からない。大会前に
  // 記録を始められるよう、参加確定国をそのまま並べる。載ったらそちらが正。
  const scheduled = visitList(matches, OUR_TEAM, stages)
  const beforeEvent = scheduled.length === 0
  const entries = beforeEvent
    ? rosterVisitList(
        ROSTER_2026.map((entry) => entry.name).filter(
          (team) => team !== OUR_TEAM,
        ),
        stages,
      )
    : scheduled
  // これから当たる相手のうち、まだ回っていない数。済んだ試合の相手は今から
  // 回っても次の作戦に効かず、当たる予定のない相手は急がない。どちらも
  // 数えない。件数は絞り込みの前で数える。
  const remaining = entries.filter(
    (entry) =>
      entry.side !== "unknown" && !entry.played && entry.stage !== "onsite",
  ).length

  // 名前でも IOC の3文字コードでも引ける。190件を上から探すのは現実的でない。
  const shown = entries.filter((entry) => matchesQuery(entry.team, query))

  // 3段に分けて出す。**並びだけで段を示さない。**190行あるので、境目が
  // 見えないと「ここから先は急がない」が読み取れない(→ pit/visits.ts)。
  const sections = [
    {
      key: "upcoming",
      label: beforeEvent ? "参加チーム" : "これから当たる",
      rows: shown.filter((entry) => !entry.played && entry.side !== "unknown"),
    },
    {
      key: "unscheduled",
      label: "当たる予定はない",
      rows: shown.filter((entry) => !entry.played && entry.side === "unknown"),
    },
    {
      key: "played",
      label: "試合が済んだ",
      rows: shown.filter((entry) => entry.played),
    },
  ].filter((section) => section.rows.length > 0)

  return (
    <div className="p-4">
      {/* 大会前の断りも「？」の中へ入れる。並びが変わる理由は一度読めば済み、
          毎回いちばん上で3行を取ると、探す作業がその分だけ下がる。 */}
      <TitleWithNote
        title="これから当たるチーム"
        note={
          VISIT_NOTE +
          (beforeEvent ? BEFORE_EVENT_NOTE : "") +
          freshnessNote(snapshot.data.fetchedAt, snapshot.data.stale)
        }
      />

      <StaleNotice
        fetchedAt={snapshot.data.fetchedAt}
        stale={snapshot.data.stale}
      />

      <div className="mt-3">
        <input
          type="search"
          className="h-10 w-full rounded-control border-[1.5px] border-line bg-white px-3 font-normal"
          placeholder="国名か3文字コードで探す（例 JPN）"
          aria-label="訪問リストを国名か3文字コードで絞り込む"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      </div>

      {entries.length > 0 && shown.length === 0 ? (
        <p className="mt-4 text-sm text-secondary-ink">
          「{query}」に当たるチームがありません
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-secondary-ink">
          {matches.length === 0
            ? "公式サイトにまだ試合が載っていません。載ると、当たる順に並びます。"
            : `${OUR_TEAM} のこれからの試合がまだ公開されていません。`}
        </p>
      ) : (
        sections.map((section, index) => (
          <section key={section.key}>
            {/* **段の変わり目は大きく空ける。**190行を指で送ると、行と同じ
                間隔の見出しは目に留まらず通り過ぎる。上に罫線を引き、
                1行ぶんより広い空きを置いて、送っている途中でも切れ目が
                見えるようにする。先頭の段だけは上に何も無いので詰める。 */}
            <h2
              className={`mb-3 text-sm font-extrabold text-secondary-ink ${
                index === 0 ? "mt-5" : "mt-10 border-t border-line pt-7"
              }`}
            >
              {section.label}
              <span className="ml-2 text-xs font-bold text-muted-ink">
                {section.rows.length}
              </span>
            </h2>
            <ul className="flex flex-col gap-2">
              {section.rows.map((entry) => (
                <li
                  key={entry.team}
                  className={`${ROW} ${
                    entry.played
                      ? ROW_PLAYED
                      : entry.stage === "onsite"
                        ? ROW_RECORDED
                        : entry.stage === "before"
                          ? ROW_BEFORE
                          : ROW_TODO
                  }`}
                >
                  <span
                    className={`${STATE_TAG} ${
                      entry.played
                        ? "bg-muted-ink"
                        : entry.stage === "onsite"
                          ? "bg-rank-high"
                          : entry.stage === "before"
                            ? "bg-rank-mid"
                            : "bg-brand"
                    }`}
                  >
                    {entry.stage === "onsite"
                      ? "現地"
                      : entry.stage === "before"
                        ? "事前"
                        : "未"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold">
                      {/* 国旗は飾りで、名前が本体。読み上げからは外す。 */}
                      <span aria-hidden="true" className="ui-flag mr-1.5">
                        {flagOf(entry.team)}
                      </span>
                      {entry.team}
                    </span>
                    <span className="block text-xs text-secondary-ink">
                      {entry.side === "unknown"
                        ? beforeEvent
                          ? "対戦はまだ分からない"
                          : "この先の試合では当たらない"
                        : `${entry.matchName} で${
                            entry.side === "ally" ? "味方" : "対戦"
                          }${entry.played ? "（試合は済み）" : ""}${
                            // いつ当たるかが分かると、回る順を決められる。
                            entry.when === "" ? "" : ` · ${entry.when}`
                          }`}
                    </span>
                  </span>
                  {/* 記録済みでも入口を残す。書いた内容を見たり、もう一度
                      聞き直したりできないと、間違えたときに直しようがない。 */}
                  <Link
                    to={
                      entry.stage === "onsite" ? "/teams/$team" : "/pit/$team"
                    }
                    params={{ team: entry.team }}
                    search={{ record: undefined }}
                    className={`h-10 shrink-0 rounded-control px-3.5 text-sm leading-10 font-bold no-underline ${
                      entry.stage === "onsite"
                        ? "border-[1.5px] border-brand bg-white text-brand-hover"
                        : "bg-brand text-white"
                    }`}
                  >
                    {entry.stage === "onsite" ? "見る" : "記録"}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="mt-4 rounded-card bg-brand-surface px-3.5 py-3 text-xs text-secondary-ink">
        記録済み{" "}
        <strong className="font-extrabold">{records.data.length}</strong> 件
        {/* 試合が載る前は「0チームのうち0チーム」になって読めないので、
            当たる相手が分かってから出す。 */}
        {entries.length === 0 ? null : (
          <>
            。これから当たる
            <strong className="font-extrabold">
              {entries.filter((entry) => !entry.played).length}
            </strong>{" "}
            チームのうち
            <strong className="font-extrabold">{remaining}</strong>{" "}
            チームが未記録
          </>
        )}
      </div>
    </div>
  )
}
