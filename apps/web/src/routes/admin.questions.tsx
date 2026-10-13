import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

import { api } from "~/client/api"
import {
  groupLabel,
  groupQuestions,
  useQuestions,
  type Group,
  type Question,
  type QuestionSet,
} from "~/question/list"
import { NoteButton, TitleWithNote } from "~/ui/title-with-note"

export const Route = createFileRoute("/admin/questions")({
  component: AdminQuestions,
})

const INPUT_TYPES: readonly {
  readonly value: string
  readonly label: string
}[] = [
  { value: "number", label: "数値" },
  { value: "single", label: "単一選択" },
  { value: "multi", label: "複数選択" },
  { value: "text", label: "自由文" },
  { value: "photo", label: "写真" },
]

// 注記は文字列で持つ。JSX の中で日本語を改行すると、その改行が空白になる。
const ADMIN_NOTE =
  "ピット記録の聞き取り項目。カードを押すとその場で直せる。" +
  "直したものは入力が止まった時点で自動で送る。" +
  "回答が付くまでは削除でき、付いた後に消すと過去の記録が読めなくなるので無効にして残す。" +
  "「推定が使用」の付いた項目だけは、推定が読んでいるので削除も無効化もできない。"

/** 選択肢を持つ形式。これ以外では選択肢の欄を出さない。 */
const WITH_CHOICES = new Set(["single", "multi"])

/**
 * 入力が止まってから送るまでの待ち。短いと1文字ごとに送ることになり、
 * 長いと直した直後に画面を閉じた分が失われる。
 */
const SAVE_DELAY_MS = 600

type SaveState = "idle" | "saving" | "saved" | "error"

/**
 * 選択肢を1つ入れ替える。並び順はサーバが配列の順で採り直すので、
 * ここでは配列を並べ替えて送るだけでよい(→ store.ts の upsertChoices)。
 */
function swapChoices(
  choices: readonly ChoiceDraft[],
  from: number,
  to: number,
): readonly ChoiceDraft[] {
  const moved = [...choices]
  const item = moved[from]
  const other = moved[to]
  if (item === undefined || other === undefined) return choices
  moved[from] = other
  moved[to] = item
  return moved
}

/** 新しい行はサーバが識別子を決めるまで id を持たない。画面の鍵だけ先に配る。 */
type ChoiceDraft = {
  readonly key: string
  readonly id: string
  readonly labelJa: string
  readonly enabled: boolean
}

type PatchBody = {
  readonly labelJa?: string
  readonly askEn?: string
  readonly inputType?: string
  readonly groupKey?: string
  readonly sortOrder?: number
  readonly enabled?: boolean
  readonly choices?: readonly {
    readonly id: string
    readonly labelJa: string
    readonly enabled: boolean
  }[]
  readonly removeChoiceIds?: readonly string[]
}

const SAVE_LABEL: Readonly<Record<SaveState, string>> = {
  idle: "",
  // 待機は「〜中…」で書き、幅を変えない(→ W-51)。
  saving: "保存中…",
  saved: "保存しました",
  error: "保存できませんでした",
}

function inputTypeLabel(value: string): string {
  return INPUT_TYPES.find((type) => type.value === value)?.label ?? value
}

/* -------------------------------------------------------------------------
 * 自由入力の欄
 * ---------------------------------------------------------------------- */

/**
 * 確定値と別に下書きを持ち、表示は `下書き ?? 確定値` にする(→ W-52)。
 * 1文字打つごとに確定値へ書くと、打っている途中の文字列がそのまま保存される。
 *
 * 確定は blur と Enter に加えて、入力が止まった時点でも行う。保存ボタンを
 * 置かない画面なので、欄を離れないまま閉じた分を落とさないため。どの経路でも
 * 変換中は確定しない。変換の確定に使う Enter と入力の確定を区別しないと、
 * 変換途中の文字列が値になる(→ W-53 とその例外)。
 */
function TextField({
  value,
  ariaLabel,
  muted = false,
  onCommit,
  onDirty,
}: {
  value: string
  ariaLabel: string
  muted?: boolean
  onCommit: (next: string) => void
  onDirty: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const composing = useRef(false)

  // 最後にサーバへ送った値。下書きを畳んでよいかの判断に使う。
  const sent = useRef<string | null>(null)

  // 送る関数は毎描画で作り直されるので、待ち時間の計り直しを避けるために
  // 参照で持つ。依存に入れると、打っている間ずっと待ちが延びる。
  const commit = useRef(onCommit)
  commit.current = onCommit

  // 入力が止まったら送る。**送った時点で下書きを捨てない。**捨てると、
  // サーバの返事が届くまでの間だけ欄が確定値（まだ古い）に戻り、その隙に
  // 打った文字が古い値の上に乗って文字列が混ざる。打ち続けている最中に
  // 保存が走るので、この隙間は必ず踏む。
  useEffect(() => {
    if (draft === null || draft === value) return undefined
    const timer = setTimeout(() => {
      if (composing.current) return
      sent.current = draft
      commit.current(draft)
    }, SAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [draft, value])

  // 送った値がそのまま確定値として返ってきて、その間に打ち足していなければ
  // 下書きを畳む。同じ文字列なので欄の表示は動かず、カーソルも飛ばない。
  // 失敗したときは下書きが残るので、打った文字を失わない。
  useEffect(() => {
    if (draft !== null && sent.current === draft && value === draft) {
      sent.current = null
      setDraft(null)
    }
  }, [value, draft])

  const settle = (): void => {
    if (draft === null || draft === value) return
    sent.current = draft
    onCommit(draft)
  }

  return (
    <input
      type="text"
      className={`h-9 w-full rounded-control border-[1.5px] border-line px-3 font-normal ${
        muted
          ? "bg-surface-soft text-muted-ink line-through"
          : "bg-white text-ink"
      }`}
      aria-label={ariaLabel}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value)
        // 打った時点で「保存中…」へ戻す。前の保存の「保存しました」が
        // 残っていると、まだ送っていない編集があるのに保存済みに見える。
        // それを見て画面を閉じると、最後に打った分が消える(→ W-04)。
        if (event.target.value !== value) onDirty()
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          settle()
        }
        if (event.key === "Escape") {
          // 打ちかけをやめる操作。捨てれば必ず既知の値へ戻れる(→ W-54)。
          setDraft(null)
        }
      }}
    />
  )
}

/**
 * 1項目ぶんの欄。**補足は畳む。**11px の灰色をラベルの下に常時置くと、
 * カードを開いた時点で読む字が2倍になり、本題の入力欄が下へ押される。
 */
function FormRow({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3.5">
      <div className="flex items-center gap-1.5">
        <div className="text-[12.5px] font-extrabold">{label}</div>
        {help === undefined ? null : (
          <NoteButton
            title={label}
            open={open}
            onToggle={() => {
              setOpen(!open)
            }}
          />
        )}
      </div>
      {help === undefined || !open ? null : (
        <div className="mt-0.5 text-[11px] text-muted-ink">{help}</div>
      )}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * 1項目のカード
 * ---------------------------------------------------------------------- */

function QuestionCard({
  question,
  groups,
  open,
  saveState,
  busy,
  onOpen,
  onMove,
  onPatch,
  onDelete,
  onDirty,
}: {
  question: Question
  groups: readonly Group[]
  open: boolean
  saveState: SaveState
  busy: boolean
  onOpen: () => void
  onMove: (direction: 1 | -1) => void
  onPatch: (body: PatchBody) => void
  onDelete: () => void
  onDirty: () => void
}) {
  const [choices, setChoices] = useState<readonly ChoiceDraft[]>([])
  const [confirming, setConfirming] = useState(false)
  const [showLock, setShowLock] = useState(false)
  const added = useRef(0)

  // カードを閉じたら確かめ待ちを解く。開き直したときに削除の一歩手前から
  // 始まっていると、次に押すつもりだった操作を取り違える。
  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  // サーバの選択肢を写す。新しい行に識別子が付くのは保存された後なので、
  // 保存のたびに写し直さないと、同じ行をもう一度足してしまう。
  useEffect(() => {
    setChoices(
      question.choices.map((choice) => ({
        key: choice.id,
        id: choice.id,
        labelJa: choice.labelJa,
        enabled: choice.enabled,
      })),
    )
  }, [question.choices])

  const sendChoices = (
    next: readonly ChoiceDraft[],
    removed: readonly string[] = [],
  ): void => {
    setChoices(next)
    onPatch({
      choices: next.map((choice) => ({
        id: choice.id,
        labelJa: choice.labelJa,
        enabled: choice.enabled,
      })),
      // 消すものは明示して送る。配列から消えたものをサーバ側で暗黙に削除
      // させると、別の端末が同時に足した選択肢まで巻き込む。
      ...(removed.length === 0 ? {} : { removeChoiceIds: removed }),
    })
  }

  const locked = question.roleKey !== null

  return (
    <li
      className={`rounded-control border ${
        open ? "border-brand shadow-card" : "border-line"
      } ${question.enabled ? "bg-white" : "bg-surface-soft"}`}
    >
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 ${
          open ? "border-b border-line" : ""
        }`}
      >
        <span className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            aria-label={`${question.labelJa}を上へ移す`}
            disabled={busy}
            className="h-[15px] w-8 rounded border border-line bg-white text-[10px] leading-none text-secondary-ink"
            onClick={() => {
              onMove(-1)
            }}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label={`${question.labelJa}を下へ移す`}
            disabled={busy}
            className="h-[15px] w-8 rounded border border-line bg-white text-[10px] leading-none text-secondary-ink"
            onClick={() => {
              onMove(1)
            }}
          >
            ▼
          </button>
        </span>

        <button
          type="button"
          aria-expanded={open}
          aria-label={`${question.labelJa}を${open ? "閉じる" : "開く"}`}
          className="min-w-0 flex-1 text-left"
          onClick={onOpen}
        >
          <span
            className={`block text-[14.5px] font-bold ${
              question.enabled ? "" : "text-muted-ink"
            }`}
          >
            {question.labelJa}
          </span>
          <span className="block truncate text-[11.5px] text-muted-ink italic">
            {question.askEn}
          </span>
        </button>

        {saveState === "idle" ? (
          <>
            <span className="shrink-0 rounded-tag border border-line bg-surface-soft px-[7px] py-0.5 text-[10.5px] font-bold text-secondary-ink">
              {inputTypeLabel(question.inputType)}
            </span>
            {locked ? (
              <span className="shrink-0 rounded-tag border border-rank-mid bg-rank-mid px-[7px] py-0.5 text-[10.5px] font-bold text-white">
                推定が使用
              </span>
            ) : null}
            {question.enabled ? null : (
              <span className="shrink-0 rounded-tag border border-line bg-surface-soft px-[7px] py-0.5 text-[10.5px] font-bold text-secondary-ink">
                無効
              </span>
            )}
          </>
        ) : (
          <span
            aria-busy={saveState === "saving"}
            className={`shrink-0 text-[11px] font-bold ${
              saveState === "saved"
                ? "text-rank-high"
                : saveState === "error"
                  ? "text-error"
                  : "text-secondary-ink"
            }`}
          >
            {SAVE_LABEL[saveState]}
          </span>
        )}
      </div>

      {open ? (
        <div className="px-3 pb-3">
          <FormRow label="日本語のラベル">
            <TextField
              value={question.labelJa}
              ariaLabel="日本語のラベルを直す"
              onDirty={onDirty}
              onCommit={(next) => {
                onPatch({ labelJa: next })
              }}
            />
          </FormRow>

          <FormRow
            label="英語の質問文"
            help="生徒がそのまま読み上げる。長いと読まれない"
          >
            <TextField
              value={question.askEn}
              ariaLabel="英語の質問文を直す"
              onDirty={onDirty}
              onCommit={(next) => {
                onPatch({ askEn: next })
              }}
            />
          </FormRow>

          <FormRow label="入力形式">
            <div className="flex flex-wrap gap-1.5">
              {INPUT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  aria-pressed={question.inputType === type.value}
                  disabled={locked || busy}
                  className="ui-segment h-10 min-w-[84px] text-[13px] disabled:opacity-50"
                  onClick={() => {
                    onPatch({ inputType: type.value })
                  }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </FormRow>

          {WITH_CHOICES.has(question.inputType) ? (
            <FormRow
              label="選択肢"
              help="左の識別子が回答に保存される。ラベルを直しても過去の回答は壊れない"
            >
              <div className="flex flex-col gap-1.5">
                {choices.map((choice, index) => (
                  <div key={choice.key} className="flex items-center gap-2">
                    {/* 並べ替え。選択肢の順はそのまま聞き取りの画面へ出るので、
                        よく出る答えを上へ寄せられないと現場で探すことになる。 */}
                    <span className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label={`選択肢「${choice.labelJa}」を上へ移す`}
                        disabled={busy || index === 0}
                        className="h-[15px] w-7 rounded border border-line bg-white text-[10px] leading-none text-secondary-ink disabled:opacity-40"
                        onClick={() => {
                          sendChoices(swapChoices(choices, index, index - 1))
                        }}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`選択肢「${choice.labelJa}」を下へ移す`}
                        disabled={busy || index === choices.length - 1}
                        className="h-[15px] w-7 rounded border border-line bg-white text-[10px] leading-none text-secondary-ink disabled:opacity-40"
                        onClick={() => {
                          sendChoices(swapChoices(choices, index, index + 1))
                        }}
                      >
                        ▼
                      </button>
                    </span>
                    <span className="w-[92px] shrink-0 font-mono text-[11px] text-muted-ink">
                      {choice.id === "" ? "（保存すると付く）" : choice.id}
                    </span>
                    <span className="min-w-0 flex-1">
                      <TextField
                        value={choice.labelJa}
                        ariaLabel={`${String(index + 1)}番目の選択肢を直す`}
                        muted={!choice.enabled}
                        onDirty={onDirty}
                        onCommit={(next) => {
                          sendChoices(
                            choices.map((item) =>
                              item.key === choice.key
                                ? { ...item, labelJa: next }
                                : item,
                            ),
                          )
                        }}
                      />
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`選択肢「${choice.labelJa}」を削除する`}
                      className="h-8 w-8 shrink-0 rounded-control border-[1.5px] border-line bg-white text-sm text-error"
                      onClick={() => {
                        sendChoices(
                          choices.filter((item) => item.key !== choice.key),
                          // まだ保存されていない行はサーバに無いので送らない。
                          choice.id === "" ? [] : [choice.id],
                        )
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={busy}
                className="mt-2 h-9 rounded-control border-[1.5px] border-brand bg-brand-surface px-3.5 text-[12.5px] font-extrabold text-brand-hover"
                onClick={() => {
                  added.current += 1
                  setChoices([
                    ...choices,
                    {
                      key: `new_${String(added.current)}`,
                      id: "",
                      labelJa: "",
                      enabled: true,
                    },
                  ])
                }}
              >
                ＋ 選択肢を足す
              </button>
            </FormRow>
          ) : null}

          {groups.length > 1 ? (
            <FormRow label="グループ（ページの分かれ目）">
              <div className="flex flex-wrap gap-1.5">
                {groups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    aria-pressed={question.groupKey === group.key}
                    disabled={busy}
                    className="ui-segment h-10 text-[13px]"
                    onClick={() => {
                      onPatch({ groupKey: group.key })
                    }}
                  >
                    {group.labelJa}
                  </button>
                ))}
              </div>
            </FormRow>
          ) : null}

          <div className="mt-3.5 flex flex-wrap gap-2 border-t border-line pt-3">
            {/* 状態を示す押しボタンではなく、次に起きることを書いた操作にする。
                「無効にする」を押した状態で置くと、いま有効なのか無効なのかを
                読み手が押し込みの見た目から判断することになる。 */}
            <button
              type="button"
              disabled={locked || busy}
              className={`h-9 rounded-control border-[1.5px] px-3 text-[12.5px] font-bold disabled:opacity-50 ${
                question.enabled
                  ? "border-line bg-white text-secondary-ink"
                  : "border-rank-high bg-rank-high text-white"
              }`}
              onClick={() => {
                onPatch({ enabled: !question.enabled })
              }}
            >
              {question.enabled
                ? "この項目を無効にする"
                : "この項目を有効にする"}
            </button>

            {/* 削除は取り消せないので、1度目は確かめる操作に変える。
                押し間違いで項目が消えると、書いた文面がまとめて失われる。 */}
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="h-9 rounded-control bg-error px-3 text-[12.5px] font-bold text-white disabled:opacity-50"
                  onClick={onDelete}
                >
                  削除する（戻せません）
                </button>
                <button
                  type="button"
                  className="h-9 rounded-control border-[1.5px] border-line bg-white px-3 text-[12.5px] font-bold text-secondary-ink"
                  onClick={() => {
                    setConfirming(false)
                  }}
                >
                  やめる
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={locked || busy}
                className="h-9 rounded-control border-[1.5px] border-error bg-white px-3 text-[12.5px] font-bold text-error disabled:opacity-50"
                onClick={() => {
                  setConfirming(true)
                }}
              >
                この項目を削除する
              </button>
            )}
          </div>

          {question.enabled ? null : (
            <p className="mt-2.5 rounded-tag bg-surface-soft px-3 py-2.5 text-xs text-secondary-ink">
              この項目はピット記録の画面に出ていません。書き終えてから
              「この項目を有効にする」を押してください。
            </p>
          )}

          {/* できないことは出したまま。**理由だけ畳む。**何ができないかは
              押す前に要るが、なぜかは一度分かれば毎回は要らない。 */}
          {locked ? (
            <div className="mt-2.5 rounded-tag border-l-[3px] border-rank-mid bg-surface-soft px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 text-xs text-secondary-ink">
                  <strong className="font-extrabold">
                    無効化・削除・入力形式の変更はできません。
                  </strong>
                  ラベルと選択肢は直せます
                </span>
                <NoteButton
                  title="この制限"
                  open={showLock}
                  onToggle={() => {
                    setShowLock(!showLock)
                  }}
                />
              </div>
              {showLock ? (
                <p className="mt-1.5 text-xs text-secondary-ink">
                  抑制ユニットへの貢献とクライム乗数の推定が、この項目を
                  <code className="mx-1 font-mono">{question.roleKey}</code>
                  として読んでいるためです。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/* -------------------------------------------------------------------------
 * 画面
 * ---------------------------------------------------------------------- */

function AdminQuestions() {
  const questions = useQuestions()
  const queryClient = useQueryClient()

  const [openId, setOpenId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [groupSaveState, setGroupSaveState] = useState<
    Record<string, SaveState>
  >({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mark = (id: string, state: SaveState): void => {
    setSaveState((prev) => ({ ...prev, [id]: state }))
  }

  /**
   * 保存できた後の取り込み方。
   *
   * 並び順・グループ・選択肢はサーバが並べ替えたり識別子を決めたりするので
   * 取り直す。それ以外は手元のキャッシュへ書き戻すだけにする。1文字ごとの
   * 保存で一覧を取り直すと、全カードが描き直され、打っている最中の欄まで
   * 作り直されてカーソルが飛ぶ。
   */
  const settleCache = async (id: string, body: PatchBody): Promise<void> => {
    const needsServerOrder =
      body.choices !== undefined ||
      body.removeChoiceIds !== undefined ||
      body.sortOrder !== undefined ||
      body.groupKey !== undefined

    if (needsServerOrder) {
      await queryClient.invalidateQueries({ queryKey: ["questions"] })
      return
    }

    queryClient.setQueryData<QuestionSet>(["questions"], (prev) =>
      prev === undefined
        ? prev
        : {
            ...prev,
            questions: prev.questions.map((question) =>
              question.id === id
                ? {
                    ...question,
                    ...(body.labelJa === undefined
                      ? {}
                      : { labelJa: body.labelJa }),
                    ...(body.askEn === undefined ? {} : { askEn: body.askEn }),
                    ...(body.inputType === undefined
                      ? {}
                      : { inputType: body.inputType }),
                    ...(body.enabled === undefined
                      ? {}
                      : { enabled: body.enabled }),
                  }
                : question,
            ),
          },
    )
  }

  const patch = async (id: string, body: PatchBody): Promise<void> => {
    mark(id, "saving")
    setFailure(null)
    try {
      const response = await api.api.questions[":id"].$patch({
        param: { id },
        json: body,
      })

      if (response.status === 409) {
        const detail = await response.json()
        mark(id, "error")
        // 文言は画面が持つ。サーバは何が使っているかだけを返す。
        setFailure(
          `この項目は変えられませんでした。推定が ${
            "roleKey" in detail ? detail.roleKey : ""
          } として読んでいます。ラベルと選択肢は直せます。`,
        )
        return
      }

      if (!response.ok) {
        mark(id, "error")
        setFailure(
          `保存できませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度直してください。",
        )
        return
      }

      mark(id, "saved")

      // 消せなかった選択肢は黙って残さない。画面から消えたように見えるのに
      // 定義が残っていると、次に開いたときに戻っていて理由が分からない。
      const detail = await response.json()
      const kept =
        "keptChoiceIds" in detail && Array.isArray(detail.keptChoiceIds)
          ? detail.keptChoiceIds.length
          : 0
      if (kept > 0) {
        setFailure(
          `選択肢を ${String(kept)} 件は削除できませんでした。` +
            "すでにその選択肢で答えた記録があるためです。" +
            "聞き取りの画面には出ないようにしました。",
        )
      }

      await settleCache(id, body)
    } catch {
      mark(id, "error")
      setFailure(
        "保存できませんでした。回線を確認して、もう一度直してください。",
      )
    }
  }

  const removeQuestion = async (id: string): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const response = await api.api.questions[":id"].$delete({
        param: { id },
      })

      if (response.status === 409) {
        const detail = await response.json()
        if ("answers" in detail) {
          setFailure(
            `この項目は削除できませんでした。すでに ${String(detail.answers)} 件の` +
              "回答が付いています。消すとその記録が何の答えか読めなくなります。" +
              "聞き取りから外すなら「この項目を無効にする」を押してください。",
          )
          return
        }
        setFailure(
          "この項目は削除できませんでした。推定が読んでいる項目です。" +
            "聞き取りから外すこともできません。",
        )
        return
      }

      if (!response.ok) {
        setFailure(
          `削除できませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度押してください。",
        )
        return
      }

      setOpenId(null)
      await queryClient.invalidateQueries({ queryKey: ["questions"] })
    } catch {
      setFailure(
        "削除できませんでした。回線を確認して、もう一度押してください。",
      )
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------------------------------------------
   * グループ
   * ------------------------------------------------------------------ */

  const markGroup = (key: string, state: SaveState): void => {
    setGroupSaveState((prev) => ({ ...prev, [key]: state }))
  }

  const patchGroup = async (
    key: string,
    body: { readonly labelJa?: string; readonly sortOrder?: number },
  ): Promise<void> => {
    markGroup(key, "saving")
    setFailure(null)
    try {
      const response = await api.api.groups[":key"].$patch({
        param: { key },
        json: body,
      })
      if (!response.ok) {
        markGroup(key, "error")
        setFailure(
          `グループを保存できませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度直してください。",
        )
        return
      }
      markGroup(key, "saved")

      // 名前だけなら手元へ書き戻す。並び順はサーバの順で取り直す。
      if (body.sortOrder !== undefined) {
        await queryClient.invalidateQueries({ queryKey: ["questions"] })
        return
      }
      queryClient.setQueryData<QuestionSet>(["questions"], (prev) =>
        prev === undefined
          ? prev
          : {
              ...prev,
              groups: prev.groups.map((group) =>
                group.key === key && body.labelJa !== undefined
                  ? { ...group, labelJa: body.labelJa }
                  : group,
              ),
            },
      )
    } catch {
      markGroup(key, "error")
      setFailure(
        "グループを保存できませんでした。回線を確認して、もう一度直してください。",
      )
    }
  }

  /** グループの並べ替えも2件の書き換えで成り立つので、順に送る(→ W-67)。 */
  const swapGroups = async (
    key: string,
    otherKey: string | undefined,
  ): Promise<void> => {
    if (otherKey === undefined) return
    const here = groupRecords.find((group) => group.key === key)
    const there = groupRecords.find((group) => group.key === otherKey)
    if (here === undefined || there === undefined) return

    setBusy(true)
    await patchGroup(key, { sortOrder: there.sortOrder })
    await patchGroup(otherKey, { sortOrder: here.sortOrder })
    setBusy(false)
  }

  const addGroup = async (): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const response = await api.api.groups.$post({
        json: { labelJa: "新しいグループ" },
      })
      if (!response.ok) {
        setFailure(
          `グループを足せませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度押してください。",
        )
        return
      }
      await queryClient.invalidateQueries({ queryKey: ["questions"] })
    } catch {
      setFailure(
        "グループを足せませんでした。回線を確認して、もう一度押してください。",
      )
    } finally {
      setBusy(false)
    }
  }

  const removeGroup = async (key: string): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const response = await api.api.groups[":key"].$delete({ param: { key } })

      if (response.status === 409) {
        const detail = await response.json()
        setFailure(
          `このグループは削除できませんでした。項目が ${
            "questions" in detail ? String(detail.questions) : ""
          } 件残っています。先に他のグループへ移すか、項目を削除してください。`,
        )
        return
      }

      if (!response.ok) {
        setFailure(
          `グループを削除できませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度押してください。",
        )
        return
      }

      await queryClient.invalidateQueries({ queryKey: ["questions"] })
    } catch {
      setFailure(
        "グループを削除できませんでした。回線を確認して、もう一度押してください。",
      )
    } finally {
      setBusy(false)
    }
  }

  /** 並べ替えは2件の書き換えで成り立つので、順に送る(→ W-67)。 */
  const swap = async (a: Question, b: Question): Promise<void> => {
    setBusy(true)
    await patch(a.id, { sortOrder: b.sortOrder })
    await patch(b.id, { sortOrder: a.sortOrder })
    setBusy(false)
  }

  const addQuestion = async (groupKey: string): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const response = await api.api.questions.$post({ json: { groupKey } })
      if (!response.ok) {
        setFailure(
          `項目を足せませんでした（${String(response.status)}）。` +
            "回線を確認して、もう一度押してください。",
        )
        return
      }
      const created = await response.json()
      await queryClient.invalidateQueries({ queryKey: ["questions"] })
      // 足した項目をそのまま開く。名前が空のままでは一覧で見分けられない。
      setOpenId(created.id)
    } catch {
      setFailure(
        "項目を足せませんでした。回線を確認して、もう一度押してください。",
      )
    } finally {
      setBusy(false)
    }
  }

  if (questions.isPending) {
    return <div className="p-4 text-secondary-ink">読み込んでいます。</div>
  }

  if (questions.isError) {
    return (
      <div className="p-4 text-secondary-ink">
        読み込めませんでした。管理者として入り直してください。
      </div>
    )
  }

  const groups = groupQuestions(questions.data)
  const groupRecords = questions.data.groups

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <TitleWithNote title="質問の管理" note={ADMIN_NOTE} />

      {failure === null ? null : (
        <p
          role="alert"
          className="mt-3 rounded-card border border-rank-mid bg-surface-soft px-3.5 py-2.5 text-xs text-secondary-ink"
        >
          {failure}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-secondary-ink">
          聞き取り項目はありません
        </p>
      ) : null}

      {groups.map((group, groupIndex) => (
        <section key={group.key}>
          <div className="mt-4.5 flex items-center gap-2">
            <span className="shrink-0 text-xs font-extrabold text-secondary-ink">
              グループ
            </span>
            <span className="min-w-0 max-w-64 flex-1">
              <TextField
                value={groupLabel(groupRecords, group.key)}
                ariaLabel={`グループ「${groupLabel(groupRecords, group.key)}」の名前を直す`}
                onDirty={() => {
                  markGroup(group.key, "saving")
                }}
                onCommit={(next) => {
                  void patchGroup(group.key, { labelJa: next })
                }}
              />
            </span>

            <button
              type="button"
              aria-label={`グループ「${groupLabel(groupRecords, group.key)}」を上へ移す`}
              disabled={busy || groupIndex === 0}
              className="h-8 w-8 shrink-0 rounded-control border border-line bg-white text-[11px] text-secondary-ink disabled:opacity-40"
              onClick={() => {
                void swapGroups(group.key, groups[groupIndex - 1]?.key)
              }}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label={`グループ「${groupLabel(groupRecords, group.key)}」を下へ移す`}
              disabled={busy || groupIndex === groups.length - 1}
              className="h-8 w-8 shrink-0 rounded-control border border-line bg-white text-[11px] text-secondary-ink disabled:opacity-40"
              onClick={() => {
                void swapGroups(group.key, groups[groupIndex + 1]?.key)
              }}
            >
              ▼
            </button>

            {/* 項目が残っているグループは消せない。先に移すか消してもらう。 */}
            <button
              type="button"
              aria-label={`グループ「${groupLabel(groupRecords, group.key)}」を削除する`}
              disabled={busy || group.items.length > 0}
              className="h-8 shrink-0 rounded-control border-[1.5px] border-error bg-white px-2.5 text-[11.5px] font-bold text-error disabled:border-line disabled:text-muted-ink disabled:opacity-50"
              onClick={() => {
                void removeGroup(group.key)
              }}
            >
              削除
            </button>

            <span className="shrink-0 text-[11px] text-muted-ink">
              {groupSaveState[group.key] === undefined
                ? null
                : SAVE_LABEL[groupSaveState[group.key] ?? "idle"]}
            </span>
          </div>

          {group.items.length === 0 ? (
            <p className="mt-2 rounded-control border border-line bg-surface-soft px-3 py-2.5 text-xs text-secondary-ink">
              このグループに項目はありません。下の「項目を足す」で作るか、
              他のグループの項目を開いて移してください
            </p>
          ) : null}

          <ul className="mt-2 flex flex-col gap-1.5">
            {group.items.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                groups={groupRecords}
                open={openId === question.id}
                saveState={saveState[question.id] ?? "idle"}
                busy={busy}
                onOpen={() => {
                  setOpenId(openId === question.id ? null : question.id)
                  setFailure(null)
                }}
                onMove={(direction) => {
                  const neighbour = group.items[index + direction]
                  if (neighbour === undefined) return
                  void swap(question, neighbour)
                }}
                onPatch={(body) => {
                  void patch(question.id, body)
                }}
                onDirty={() => {
                  mark(question.id, "saving")
                }}
                onDelete={() => {
                  void removeQuestion(question.id)
                }}
              />
            ))}
          </ul>

          <button
            type="button"
            disabled={busy}
            className="mt-2.5 h-10 w-full rounded-control bg-brand text-sm font-extrabold text-white disabled:opacity-60"
            onClick={() => {
              void addQuestion(group.key)
            }}
          >
            ＋ {groupLabel(groupRecords, group.key)}に項目を足す
          </button>
        </section>
      ))}

      <button
        type="button"
        disabled={busy}
        className="mt-6 h-10 w-full rounded-control border-[1.5px] border-brand bg-brand-surface text-sm font-extrabold text-brand-hover disabled:opacity-60"
        onClick={() => {
          void addGroup()
        }}
      >
        ＋ グループを足す
      </button>
    </div>
  )
}
