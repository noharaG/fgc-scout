import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useRef, useState } from "react"

import { api } from "~/client/api"
import { parseRankings } from "~/official/parse"
import { useSnapshot } from "~/official/snapshot"
import { usePitRecords } from "~/pit/records"
import { answerText } from "~/question/answer"
import { groupLabel, useQuestions } from "~/question/list"
import { useCurrentSession } from "~/session/current"
import { PhotoViewer } from "~/ui/photo-viewer"
import { TitleWithNote } from "~/ui/title-with-note"
import { formatWhen } from "~/ui/when"

export const Route = createFileRoute("/teams/$team")({
  /**
   * **どこから開いたかを受け取る。**試合詳細から来たときに「← チーム一覧」へ
   * 戻すと、6チームを順に見る手が毎回止まる。`from` に試合名が入っていれば
   * その試合へ戻す。
   */
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search["from"] === "string" ? search["from"] : undefined,
  }),
  component: TeamDetail,
})

/**
 * 1チームを1画面にまとめる。
 *
 * **公式の実績・推定・ピットでの申告を混ぜない。**混ぜると「登れると言って
 * いた」ことと「登れた」ことの区別が消え、作戦の判断を誤る
 * (→ AGENTS.md の Invariants、prototype/fgc-scout/team-detail.html)。
 */

const CARD = "mt-2 rounded-card border border-line bg-white px-3.5 py-1"
const ROW =
  "flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0"

// 注記は文字列で持つ。JSX の中で日本語を改行すると、その改行が空白になる。
const PIT_NOTE =
  "公式の数字と突き合わせて読む。同じチームを何人が記録してもよく、" +
  "古い記録も残る。中身はここから直せて、直した人の名前が残る。"

function TeamDetail() {
  const { team } = Route.useParams()
  const { from } = Route.useSearch()
  const snapshot = useSnapshot()
  const records = usePitRecords()
  const questions = useQuestions()
  const session = useCurrentSession()
  const queryClient = useQueryClient()

  // 消す前に1度確かめる。取り消せないので、押し間違いで記録が消えると
  // 聞き直しにもう一度ピットへ行くことになる。
  const [confirming, setConfirming] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 開いている写真。**チーム詳細に出ている写真だけを行き来する。**
  // 隣の国へは続かない(→ ui/photo-viewer.tsx)。
  const [viewing, setViewing] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  // コーチにだけ出す。**これは認可ではない。**強制はサーバの許可表で
  // 済んでいて、ここは押しても 403 になる導線を見せないためだけ
  // (→ AGENTS.md の Invariants)。
  const isAdmin = session.data?.role === "admin"

  const removeRecord = async (id: string): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const response = await api.api.pit[":recordId"].$delete({
        param: { recordId: id },
      })
      if (!response.ok) {
        setFailure(
          `記録を削除できませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度押してください。",
        )
        return
      }
      setConfirming(null)
      await queryClient.invalidateQueries({ queryKey: ["pit", "records"] })
    } catch {
      setFailure(
        "記録を削除できませんでした。回線を確認して、もう一度押してください。",
      )
    } finally {
      setBusy(false)
    }
  }

  if (snapshot.isPending || records.isPending || questions.isPending) {
    return <div className="p-4 text-secondary-ink">読み込んでいます。</div>
  }

  if (snapshot.isError || records.isError || questions.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <h1 className="ui-section-heading">{team}</h1>
        <p className="mt-2 text-sm text-secondary-ink">
          読み込めませんでした。回線が戻ったら自動で読み直します。
        </p>
      </div>
    )
  }

  const official = parseRankings(snapshot.data.data).find(
    (row) => row.team === team,
  )

  // 同じチームを複数人が記録することを許している。新しい順に全部出し、
  // どれが最新かを示す。上書きしないので、前に聞いた内容も残る。
  const mine = records.data
    .filter((record) => record.team === team)
    .toSorted((a, b) => b.recordedAt - a.recordedAt)

  // このチームの写真を、画面に並んでいる順のまま1本にする。横に送ると
  // 記録をまたいで次の写真へ進み、**この束の端で止まる。**
  const gallery = mine.flatMap((record) =>
    record.photos.map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      label: `${record.scoutName} が撮った ${team} の機体写真`,
    })),
  )

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <p className="text-xs text-muted-ink">
        {from === undefined ? (
          <Link to="/teams" className="text-brand-hover">
            ← チーム一覧
          </Link>
        ) : (
          <Link
            to="/matches/$match"
            params={{ match: from }}
            className="text-brand-hover"
          >
            ← {from}
          </Link>
        )}
      </p>
      <h1 className="ui-section-heading mt-1">{team}</h1>

      <h2 className="ui-card-title mt-5">公式の実績</h2>
      {official === undefined ? (
        <p className="mt-1 text-xs text-muted-ink">
          このチームはまだ公式の順位表にありません。大会が始まると出ます
        </p>
      ) : (
        <div className={CARD}>
          {(
            [
              ["順位", official.rank],
              ["Ranking Score", official.rankingScore],
              ["最高スコア", official.highestScore],
              ["Climb Points", official.climbPoints],
              ["消化した試合", official.played],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className={ROW}>
              <span className="min-w-0 flex-1 text-[13px] text-secondary-ink">
                {label}
              </span>
              <span className="text-[15px] font-extrabold tabular-nums">
                {value ?? "—"}
              </span>
              <span className="ui-source-tag" data-source="official">
                公式
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <TitleWithNote
          as="h2"
          className="ui-card-title"
          title="ピットで聞いたこと"
          note={
            <>
              <strong className="font-extrabold">
                申告であって実績ではない。
              </strong>
              {PIT_NOTE}
              {questions.data.groups.length === 0
                ? ""
                : `聞き取りの束は ${questions.data.groups
                    .map((group) =>
                      groupLabel(questions.data.groups, group.key),
                    )
                    .join(" / ")}。`}
            </>
          }
        />
      </div>

      {failure === null ? null : (
        <p
          role="alert"
          className="mt-2 rounded-card border border-error bg-surface-soft px-3.5 py-2.5 text-xs text-secondary-ink"
        >
          {failure}
        </p>
      )}

      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-secondary-ink">
          このチームのピット記録はまだありません
        </p>
      ) : (
        mine.map((record, index) => (
          <section key={record.id} className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs font-bold text-secondary-ink">
                {record.scoutName} · {formatWhen(record.recordedAt)}
                {/* 直した人が書いた人と違うときだけ出す。同じなら、自分で
                    書き足しただけなので情報にならない。 */}
                {record.editedBy === null ||
                record.editedAt === null ||
                record.editedBy === record.scoutName ? null : (
                  <span className="ml-1.5 font-normal">
                    （{record.editedBy} が {formatWhen(record.editedAt)} に
                    直した）
                  </span>
                )}
                {index === 0 && mine.length > 1 ? (
                  <span className="ml-2 rounded-tag border border-brand bg-brand-surface px-[5px] py-px text-[10px] text-brand-hover">
                    最新
                  </span>
                ) : null}
              </p>

              {/* **誰の記録でも直せる。**間違いに気づく人と書いた人は
                  たいてい別。直した人は記録に残る(→ api の PATCH /api/pit)。 */}
              <Link
                to="/pit/$team"
                params={{ team }}
                search={{ record: record.id }}
                className="h-8 shrink-0 rounded-control border-[1.5px] border-brand bg-white px-2.5 text-[11.5px] leading-[1.7rem] font-bold text-brand-hover no-underline"
              >
                直す
              </Link>

              {!isAdmin ? null : confirming === record.id ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="h-8 shrink-0 rounded-control bg-error px-2.5 text-[11.5px] font-bold text-white disabled:opacity-50"
                    onClick={() => {
                      void removeRecord(record.id)
                    }}
                  >
                    削除する（戻せません）
                  </button>
                  <button
                    type="button"
                    className="h-8 shrink-0 rounded-control border-[1.5px] border-line bg-white px-2.5 text-[11.5px] font-bold text-secondary-ink"
                    onClick={() => {
                      setConfirming(null)
                    }}
                  >
                    やめる
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${record.scoutName} の記録を削除する`}
                  className="h-8 shrink-0 rounded-control border-[1.5px] border-error bg-white px-2.5 text-[11.5px] font-bold text-error disabled:opacity-50"
                  onClick={() => {
                    setConfirming(record.id)
                    setFailure(null)
                  }}
                >
                  この記録を削除
                </button>
              )}
            </div>
            {record.photos.length === 0 ? null : (
              <div className="mt-2 flex flex-wrap gap-2">
                {record.photos.map((photo) => (
                  // 画像は一覧の応答に混ぜず1枚ずつ取る。混ぜると記録の
                  // 一覧が写真の枚数ぶん重くなる(→ store.ts の listPhotos)。
                  //
                  // **別のタブへ飛ばさない。**戻るのにブラウザのタブ操作が
                  // 要る。その場で開いて、閉じたら元の位置に戻る。
                  <button
                    key={photo.id}
                    type="button"
                    aria-label={`${record.scoutName} が撮った機体写真を開く`}
                    onClick={(event) => {
                      // 閉じたときの戻り先。ライブラリは知りえないので
                      // 自分で持つ(→ O-20)。
                      opener.current = event.currentTarget
                      setViewing(photo.id)
                    }}
                  >
                    <img
                      src={`/api/pit/photos/${photo.id}`}
                      alt={`${record.scoutName} が撮った機体写真`}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      className="size-28 rounded-control border border-line object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className={CARD}>
              {record.answers.length === 0 && record.photos.length === 0 ? (
                <div className={ROW}>
                  <span className="text-[13px] text-muted-ink">
                    記録に中身がありません
                  </span>
                </div>
              ) : (
                record.answers.map((answer) => {
                  const shown = answerText(questions.data, answer)
                  return (
                    <div key={answer.questionId} className={ROW}>
                      <span className="min-w-0 flex-1 text-[13px] text-secondary-ink">
                        {shown.label}
                      </span>
                      <span className="text-[15px] font-bold">
                        {shown.value}
                      </span>
                      <span className="ui-source-tag" data-source="declared">
                        申告
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        ))
      )}

      {/* 直すのと足すのは別の操作。いま入っている答えを直すなら上の「直す」、
          あらためて聞き直して別の記録として残すならこちら。 */}
      <Link
        to="/pit/$team"
        params={{ team }}
        search={{ record: undefined }}
        className="mt-4 flex h-12 items-center justify-center rounded-control bg-brand text-sm font-extrabold text-white no-underline"
      >
        {mine.length === 0 ? "このチームを記録する" : "もう一度記録する"}
      </Link>

      {/* 閉じているあいだは中身を DOM に残さない(→ O-23)。 */}
      {viewing === null ? null : (
        <PhotoViewer
          photos={gallery}
          startId={viewing}
          onClose={() => {
            setViewing(null)
            // 閉じたら押した写真へフォーカスを返す(→ O-20、O-25)。
            opener.current?.focus()
          }}
        />
      )}
    </div>
  )
}
