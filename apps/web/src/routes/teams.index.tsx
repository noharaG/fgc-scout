import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { freshnessNote, StaleNotice } from "~/official/freshness"
import { parseRankings } from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { recordedTeams, usePitRecords } from "~/pit/records"
import { latestByTeam, stagesByTeam, type RecordStage } from "~/pit/summary"
import { answerText } from "~/question/answer"
import { groupQuestions, useQuestions } from "~/question/list"
import {
  flagOf,
  matchesQuery,
  ROSTER_2026,
  unmatchedNames,
} from "~/team/roster"
import { useRememberedText } from "~/ui/remembered"
import { TitleWithNote } from "~/ui/title-with-note"
import { formatWhen } from "~/ui/when"

export const Route = createFileRoute("/teams/")({ component: Teams })

// TODO: 自チームはサーバの OUR_TEAM が正。設定を返すルートを足したら消す。
const OUR_TEAM = "Japan"

// 状態で変わる色は排他の定数に分ける。基底に片方を書いて条件でもう片方を
// 足すと、生成順で負けたほうが黙って消える（白地に白文字になったことがある）。
const ROW = "flex items-center gap-3 rounded-card border px-3.5 py-3"
const ROW_PLAIN = "border-line bg-white"
const ROW_MINE = "border-brand bg-brand-surface"
// **文字色を基底に書かない。**基底に text-white を置いて条件で
// text-secondary-ink を足すと、生成順で text-white が勝ち、薄い地の札が
// 白地に白文字になる。
// 3状態とも地と文字を対で持つ。
const STATE_TAG = "shrink-0 rounded-tag px-[7px] py-0.5 text-[11px] font-bold"
const TAG_MINE = "bg-brand text-white"
// 現地は済み、事前は会場でもう一度回る相手、未はまだ誰も聞いていない相手。
// 事前を現地と同じ色にすると、会場で回り漏れる。
const STAGE_TAGS: Readonly<
  Record<RecordStage, { readonly label: string; readonly tone: string }>
> = {
  onsite: { label: "現地", tone: "bg-rank-high text-white" },
  before: { label: "事前", tone: "bg-rank-mid text-white" },
  none: {
    label: "未",
    tone: "border border-line bg-surface-soft text-secondary-ink",
  },
}

// 表の見た目は視覚の正本の table.data を写したもの
// (→ prototype/fgc-scout/tokens.css、teams.html の PC)。
// 申告の列が増えても横に送るのは表の枠の中だけ(→ D-46)。
const TABLE_WRAP =
  "teams-table-wrap mt-3 overflow-x-auto rounded-control border border-line bg-white"
// 寄せと折り返しは基底に書かず、列の種類ごとに片方だけを持たせる。
// 同じプロパティを足し合わせると生成順で負けたほうが黙って消える。
const TH_BASE =
  "bg-surface-soft px-4 py-3 text-xs font-extrabold text-secondary-ink"
const TH = `${TH_BASE} text-left whitespace-nowrap`
const TH_NUM = `${TH_BASE} text-right whitespace-nowrap`
const TH_SPEC = `${TH_BASE} text-left align-bottom`
const TD_BASE = "border-b border-line px-4 py-3"
const TD = `${TD_BASE} whitespace-nowrap`
const TD_NUM = `${TD} text-right tabular-nums`
// 表のセルには max-width が効かないので、幅は中の箱で抑える。
// 項目名も自由記述の答えも長いことがあり、抑えないと1列で画面を食う。
// 答えは2行で切り、全文はチーム詳細で読む。
const SPEC_LABEL = "block min-w-20 max-w-40"
const SPEC_VALUE = "line-clamp-2 min-w-20 max-w-56"
// **国名の列は横に送っても残す。**申告の列を読んでいる最中にどの国の行か
// 分からなくなる。透けると下の列と重なるので地を敷く。見出しは見出しの地、
// 本文は行の地（自分の行は色が違う）を `bg-inherit` で受ける。
const STICKY = "sticky left-0"

// 注記は文字列で持つ。JSX の中で日本語を改行すると、その改行が空白になる。
const TEAMS_NOTE =
  "公式の順位表に、ピット記録の有無を足したもの。" +
  "記録の札は、10/6 以降に新しく取った記録があれば「現地」、10/5 までの記録だけなら「事前」。" +
  "事前の記録を会場で直しても現地にはならないので、会場で聞いたら「もう一度記録する」で残す。" +
  "広い画面では表になり、最新の記録で聞いたことを横に並べる（申告であって実績ではない）。" +
  "抑制ユニットへの貢献の推定は、公式データに試合が載ってから出す。" +
  "公式にまだ載っていない参加国も、数字を空にして並べてある（記録は先に取れる）。" +
  "並べ替えは覚えていて、次に開いてもそのまま。"

/**
 * 並べ替えの軸。**既定は順位。**大会中に真っ先に見るのが順位で、そこから
 * 「最高スコアだけ高い相手」のような読み方へ移る。
 *
 * 向きは軸ごとに変える。順位は小さいほうが上、点数は大きいほうが上。
 * どちらも「強い順」が最初に来る。押すたびに向きが入れ替わる。
 */
type SortKey = "rank" | "team" | "highestScore" | "climbPoints" | "played"

const COLUMNS: readonly {
  readonly key: SortKey
  readonly label: string
  readonly align: "left" | "right"
  /** 押したとき最初に来る向き。 */
  readonly first: "asc" | "desc"
}[] = [
  // **RS の軸は置かない。**順位は RS の順そのものなので、押しても順位と
  // 同じ並びにしかならない。軸が1つ増えるぶん、どれを押すかの判断だけが増える。
  // RS の数字自体はカードに出したままにしてある。
  { key: "rank", label: "順位", align: "right", first: "asc" },
  { key: "team", label: "チーム名", align: "left", first: "asc" },
  { key: "highestScore", label: "最高", align: "right", first: "desc" },
  { key: "climbPoints", label: "Climb", align: "right", first: "desc" },
  { key: "played", label: "試合", align: "right", first: "desc" },
]

/**
 * 記録の有無は並べ替えではなく**絞り込み**で扱う。
 *
 * 3値しかないので、並べ替えても塊ができるだけで、探しているほうへ
 * 辿り着くには結局スクロールする。絞れば見たいほうだけが残る。
 * 会場では「事前のみ」と「未記録」が回る先になる。
 */
type RecordFilter = "all" | RecordStage

const FILTERS: readonly {
  readonly key: RecordFilter
  readonly label: string
}[] = [
  { key: "all", label: "すべて" },
  { key: "onsite", label: "現地" },
  { key: "before", label: "事前のみ" },
  { key: "none", label: "未記録" },
]

/**
 * 並べ替えに使う値。**引けない値は必ず最後へ送る。**0 として扱うと
 * 「まだ数字が無い」が「いちばん弱い」に化ける(→ W-01)。
 */
function sortValue(
  row: {
    readonly team: string
    readonly rank: number | null
    readonly highestScore: number | null
    readonly climbPoints: number | null
    readonly played: number | null
  },
  key: SortKey,
): number | string | null {
  if (key === "team") return row.team
  return row[key]
}

// localStorage のキーは <アプリ名>_<用途> の小文字スネークケースにする
// (→ login.tsx)。接頭辞が無いと、同じオリジンの別の物と衝突したときに
// 名前から読めない。
const SORT_KEY = "fgc_teams_sort"
const FILTER_KEY = "fgc_teams_filter"
const SEARCH_KEY = "fgc_teams_search"

/**
 * 並べ替えを覚えておく。**画面を移って戻っても元に戻さない。**
 * 会場では「RS の高い順」で見続けたいことがあり、そのたびに押し直すのは
 * 作業の邪魔になる。
 *
 * 読めない・書けないことがある（プライベートウィンドウなど）ので、失敗は
 * 握りつぶして既定へ落とす。並び順が戻るだけで、他には何も起きない。
 */
function readStoredSort(): { key: SortKey; direction: "asc" | "desc" } {
  const fallback = { key: "rank" as SortKey, direction: "asc" as const }
  try {
    const raw = globalThis.localStorage.getItem(SORT_KEY)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    const key = stringOf(parsed, "key")
    const direction = stringOf(parsed, "direction")
    // 保存した後に軸を消したり名前を変えたりすることがある。知らない値は
    // 既定へ落とす。落とさないと、どの軸でも並ばない一覧が出る。
    const column = COLUMNS.find((item) => item.key === key)
    if (column === undefined) return fallback
    if (direction !== "asc" && direction !== "desc") return fallback
    return { key: column.key, direction }
  } catch {
    return fallback
  }
}

function stringOf(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null
  const found: unknown = Reflect.get(value, key)
  return typeof found === "string" ? found : null
}

function storeSort(sort: { key: SortKey; direction: "asc" | "desc" }): void {
  try {
    globalThis.localStorage.setItem(SORT_KEY, JSON.stringify(sort))
  } catch {
    // 覚えられなくても並べ替え自体は効く。次に開くと既定へ戻るだけ。
  }
}

/**
 * 絞り込みも覚える。**並べ替えと同じ理由。**記録を埋めている最中は
 * 「記録なし」で見続けることになり、チームを開いて戻るたびに押し直すのは
 * 作業の邪魔になる。
 */
function readStoredFilter(): RecordFilter {
  try {
    const raw = globalThis.localStorage.getItem(FILTER_KEY)
    // 知らない値は既定へ落とす。落とさないと、どれにも当たらない一覧が出る。
    // 絞り込みの一覧から拾い直すことで、キャストせずに型が決まる。
    return FILTERS.find((item) => item.key === raw)?.key ?? "all"
  } catch {
    return "all"
  }
}

function storeFilter(filter: RecordFilter): void {
  try {
    globalThis.localStorage.setItem(FILTER_KEY, filter)
  } catch {
    // 覚えられなくても絞り込み自体は効く。
  }
}

/** 公式の数字がまだ無いチームの1行。空欄は 0 で埋めない(→ W-01)。 */
function blank(team: string) {
  return {
    team,
    rank: null,
    rankingScore: null,
    highestScore: null,
    climbPoints: null,
    played: null,
  }
}

/** 大会前だけ足す断り。件数を読むので関数にする。 */
function beforeEventNote(): string {
  const unknown = ROSTER_2026.filter((entry) => entry.code === null).length
  return (
    `いまは公式サイトにまだ順位が載っていないので、参加確定国 ${String(ROSTER_2026.length)} を並べている。` +
    "国名は2025大会の公式表記に合わせてあるが、" +
    `2025に出ていなかった ${String(unknown)} か国だけは参加国マップの表記のままなので、本番で食い違うことがある。`
  )
}

function Teams() {
  const snapshot = useSnapshot()
  const records = usePitRecords()
  const questions = useQuestions()
  const [query, setQuery] = useRememberedText(SEARCH_KEY)
  const [recordFilter, setRecordFilterState] =
    useState<RecordFilter>(readStoredFilter)

  const setRecordFilter = (next: RecordFilter): void => {
    setRecordFilterState(next)
    storeFilter(next)
  }
  const [sort, setSortState] = useState<{
    readonly key: SortKey
    readonly direction: "asc" | "desc"
  }>(readStoredSort)

  const setSort = (next: { key: SortKey; direction: "asc" | "desc" }): void => {
    setSortState(next)
    storeSort(next)
  }

  if (snapshot.isPending || records.isPending || questions.isPending) {
    return <div className="p-4 text-secondary-ink">読み込んでいます。</div>
  }

  if (snapshot.isError || records.isError || questions.isError) {
    return (
      <div className="p-4">
        <h1 className="ui-section-heading">チーム一覧</h1>
        <p className="mt-2 text-sm text-secondary-ink">
          読み込めませんでした。回線が戻ったら自動で読み直します。
        </p>
      </div>
    )
  }

  const done = recordedTeams(records.data)
  const stages = stagesByTeam(records.data)
  const stageOf = (team: string): RecordStage => stages.get(team) ?? "none"
  const latest = latestByTeam(records.data)
  const official = parseRankings(snapshot.data.data)
  const beforeEvent = official.length === 0

  // 表の申告の列。聞き取りの画面と同じ並び（束の順→束の中の順）にする。
  // 写真の項目は字にならないので外す。無効化した項目は管理者にだけ返って
  // くるが、いま聞いていない項目なので列にしない。
  const specColumns = groupQuestions(questions.data)
    .flatMap((group) => group.items)
    .filter((question) => question.enabled && question.inputType !== "photo")

  // 公式に順位が載るまでは参加確定国を並べる。順位の欄は空にする。
  // 推定できていない数字を 0 で埋めない(→ W-01)。
  // **公式に載っていない参加国も一覧へ足す。**2026から出る国（Belgium など
  // 13か国）は去年の順位表に居ないので、公式データが載った時点で一覧から
  // 消えてしまい、ピット記録を始められなかった。数字は空のまま並べる。
  const missing = ROSTER_2026.filter(
    (entry) => !official.some((row) => row.team === entry.name),
  ).map((entry) => blank(entry.name))

  const all = beforeEvent
    ? ROSTER_2026.map((entry) => blank(entry.name))
    : [...official, ...missing]

  // 名前でも IOC の3文字コードでも引ける。会場では「JPN」と言うことがある。
  // 記録の有無はここで絞る。並べ替えの軸にはしない(→ FILTERS の注記)。
  const found = all.filter(
    (row) =>
      matchesQuery(row.team, query) &&
      (recordFilter === "all" || recordFilter === stageOf(row.team)),
  )

  // 並べ替えは取得済みのデータの上で行う(→ 05 の層の分担)。取り直さない。
  const rankings = found.toSorted((a, b) => {
    const left = sortValue(a, sort.key)
    const right = sortValue(b, sort.key)
    // 値の無い行は向きに関わらず最後。上に来ると、空欄が並んで表が読めない。
    if (left === null && right === null) return a.team.localeCompare(b.team)
    if (left === null) return 1
    if (right === null) return -1

    const order =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right)
    // 同じ値のときは名前順にする。押すたびに並びが変わると追えなくなる。
    if (order === 0) return a.team.localeCompare(b.team)
    return sort.direction === "asc" ? order : -order
  })

  // 公式が載った後、こちらの名前が公式に無ければ記録が結びつかない。
  // 黙って落とさず数を出す(→ AGENTS.md の Invariants)。
  const officialNames = official.map((row) => row.team)
  const strayRecords = beforeEvent
    ? []
    : unmatchedNames(officialNames, [...done])

  return (
    // 広い画面では表が横に伸びる。申告の列が多いので、本文の幅で切らない。
    <div className="mx-auto w-full max-w-[1600px] p-4">
      {/* 操作は読みやすい幅に留める。広げると押す場所が画面の端まで散る。 */}
      <div className="max-w-3xl">
        <TitleWithNote
          title="チーム一覧"
          note={
            TEAMS_NOTE +
            (beforeEvent ? beforeEventNote() : "") +
            freshnessNote(snapshot.data.fetchedAt, snapshot.data.stale)
          }
        />

        <StaleNotice
          fetchedAt={snapshot.data.fetchedAt}
          stale={snapshot.data.stale}
        />

        <div className="mt-3 flex gap-2">
          <input
            type="search"
            className="h-9 min-w-0 flex-1 rounded-control border-[1.5px] border-line bg-white px-3 font-normal"
            placeholder="国名か3文字コードで探す（例 JPN）"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </div>

        {/* 記録の有無で絞る。**並べ替えの軸にはしない。**3値しかないので、
          並べ替えても塊ができるだけで、探すにはスクロールが要る。 */}
        <div
          role="group"
          aria-label="記録の有無で絞る"
          className="mt-3 flex gap-1.5"
        >
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={recordFilter === item.key}
              className="ui-segment h-9 flex-1 text-[13px] whitespace-nowrap"
              onClick={() => {
                setRecordFilter(item.key)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 並べ替えの軸。**表の見出しではなくボタンで持つ。**スマホでは列が
          画面に収まらず、見出しを押す形だと軸そのものが見えなくなる
          (390px で7列を出すと国名が10文字で切れた)。 */}
        <div
          role="group"
          aria-label="並べ替え"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {COLUMNS.map((item) => {
            const active = sort.key === item.key
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                // 状態は名前にも入れる。矢印は絵なので読み上げから外してある。
                aria-label={
                  active
                    ? `${item.label}で並べ替える（${
                        sort.direction === "asc" ? "昇順" : "降順"
                      }）`
                    : `${item.label}で並べ替える`
                }
                className="ui-segment h-9 px-3 text-[13px] whitespace-nowrap"
                onClick={() => {
                  setSort(
                    active
                      ? {
                          key: item.key,
                          direction: sort.direction === "asc" ? "desc" : "asc",
                        }
                      : { key: item.key, direction: item.first },
                  )
                }}
              >
                {item.label}
                {active ? (
                  <span aria-hidden="true" className="ml-1">
                    {sort.direction === "asc" ? "▲" : "▼"}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {rankings.length === 0 ? (
        <p className="mt-4 text-sm text-secondary-ink">
          {query === ""
            ? "公式サイトにまだ順位が載っていません。ランキングマッチが始まると自動で表示されます。"
            : `「${query}」に当たるチームがありません。`}
        </p>
      ) : (
        // **同じ一覧を表とカードの2つの形で描き、どちらを見せるかは CSS が
        // 一覧自身の幅で選ぶ**(→ globals.css の 6、D-48、D-53)。
        // スクリプトで幅を見て片方だけ描くと、回転したときに描き直しになる。
        <div className="teams-board">
          {/* **広い枠では表。**開かずに横でスペックを読み比べたい、という
              会場の要望(2026-10-06)。PC の姿は視覚の正本も表。 */}
          <div className={TABLE_WRAP}>
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                {/* 出典は列の束ごとに札で示す。公式の実績とピットでの申告を
                    混ぜない(→ AGENTS.md の Invariants)。 */}
                <tr>
                  <th colSpan={2} className={TH} />
                  <th colSpan={4} className={TH}>
                    <span className="ui-source-tag" data-source="official">
                      公式
                    </span>
                  </th>
                  <th className={TH}>ピット</th>
                  {specColumns.length === 0 ? null : (
                    <th colSpan={specColumns.length} className={TH}>
                      <span className="ui-source-tag" data-source="declared">
                        申告
                      </span>
                      <span className="ml-1.5">最新の記録で聞いたこと</span>
                    </th>
                  )}
                </tr>
                <tr>
                  <th className={TH_NUM}>順位</th>
                  <th className={`${TH} ${STICKY}`}>チーム</th>
                  <th className={TH_NUM}>RS</th>
                  <th className={TH_NUM}>最高</th>
                  <th className={TH_NUM}>Climb</th>
                  <th className={TH_NUM}>試合</th>
                  <th className={TH}>記録</th>
                  {specColumns.map((question) => (
                    <th key={question.id} className={TH_SPEC}>
                      <span className={SPEC_LABEL}>{question.labelJa}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {rankings.map((row) => {
                  const mine = row.team === OUR_TEAM
                  const stage = STAGE_TAGS[stageOf(row.team)]
                  const record = latest.get(row.team)
                  return (
                    <tr
                      key={row.team}
                      className={mine ? "bg-brand-surface" : "bg-white"}
                    >
                      <td className={`${TD_NUM} font-extrabold`}>
                        {row.rank ?? "—"}
                      </td>
                      <td className={`${TD} ${STICKY} bg-inherit`}>
                        <Link
                          to="/teams/$team"
                          params={{ team: row.team }}
                          search={{ from: undefined }}
                          className="font-extrabold text-ink no-underline"
                        >
                          <span aria-hidden="true" className="ui-flag mr-1.5">
                            {flagOf(row.team)}
                          </span>
                          {row.team}
                        </Link>
                      </td>
                      <td className={TD_NUM}>{row.rankingScore ?? "—"}</td>
                      <td className={TD_NUM}>{row.highestScore ?? "—"}</td>
                      <td className={TD_NUM}>{row.climbPoints ?? "—"}</td>
                      <td className={TD_NUM}>{row.played ?? "—"}</td>
                      <td className={TD}>
                        <span
                          className={`${STATE_TAG} ${mine ? TAG_MINE : stage.tone}`}
                        >
                          {mine ? "自分" : stage.label}
                        </span>
                        {/* いつの記録かを添える。事前なら何日前に聞いた話か、
                            現地なら今日のいつかが読める。 */}
                        {record === undefined ? null : (
                          <span className="ml-2 text-xs text-secondary-ink tabular-nums">
                            {formatWhen(record.recordedAt)}
                          </span>
                        )}
                      </td>
                      {specColumns.map((question) => {
                        const answer = record?.answers.find(
                          (item) => item.questionId === question.id,
                        )
                        // 聞いていない項目は記号を置く。空欄だと「無い」と
                        // 「描けなかった」を区別できない(→ W-22)。
                        const value =
                          answer === undefined
                            ? "—"
                            : answerText(questions.data, answer).value
                        return (
                          <td key={question.id} className={TD_BASE}>
                            <span className={SPEC_VALUE} title={value}>
                              {value}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* **狭い枠ではカード。**7列は 390px の画面に入らず、詰めても
            国名が10文字で切れる。1行ぶんを名前に使えば切らずに済む。
            訪問リストと試合一覧も同じ形なので、画面ごとに読み方を変えずに済む。 */}
          <ul className="teams-cards mt-3 flex flex-col gap-2">
            {rankings.map((row) => {
              const mine = row.team === OUR_TEAM
              const stage = STAGE_TAGS[stageOf(row.team)]
              return (
                <li
                  key={row.team}
                  className={`${ROW} ${mine ? ROW_MINE : ROW_PLAIN}`}
                >
                  <span className="w-10 shrink-0 text-right text-[19px] leading-none font-extrabold tabular-nums">
                    {/* 数字が無いときは記号を置く。空欄だと「無い」と
                      「描けなかった」を区別できない(→ W-22)。 */}
                    {row.rank ?? "—"}
                  </span>

                  <Link
                    to="/teams/$team"
                    params={{ team: row.team }}
                    search={{ from: undefined }}
                    className="min-w-0 flex-1 no-underline"
                  >
                    {/* **名前は折り返す。**切ると国の区別が付かなくなる。
                      スカウティングでは国名がそのままチームの識別になる。 */}
                    <span className="block font-extrabold text-ink">
                      {/* 国旗は飾りで、名前が本体。読み上げからは外す。 */}
                      <span aria-hidden="true" className="ui-flag mr-1.5">
                        {flagOf(row.team)}
                      </span>
                      {row.team}
                    </span>
                    <span className="mt-0.5 block text-xs text-secondary-ink tabular-nums">
                      RS {row.rankingScore ?? "—"} · 最高{" "}
                      {row.highestScore ?? "—"} · Climb {row.climbPoints ?? "—"}{" "}
                      · {row.played ?? "—"} 試合
                    </span>
                  </Link>

                  <span
                    className={`${STATE_TAG} ${mine ? TAG_MINE : stage.tone}`}
                  >
                    {mine ? "自分" : stage.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {strayRecords.length === 0 ? null : (
        <p
          role="alert"
          className="mt-3 rounded-card border border-error bg-surface-soft px-3.5 py-2.5 text-xs text-secondary-ink"
        >
          <strong className="font-extrabold">
            ピット記録 {strayRecords.length}{" "}
            件の国名が公式データに見つかりません。
          </strong>
          公式が違う表記を使っているか、綴りが違います。このままだと記録が
          順位表と結びつきません：{strayRecords.join("、")}
        </p>
      )}
    </div>
  )
}
