import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

import { api } from "~/client/api"
import { shrinkPhoto, type ShrunkPhoto } from "~/pit/photo"
import { usePitRecords } from "~/pit/records"
import {
  groupLabel,
  groupQuestions,
  useQuestions,
  type Question,
} from "~/question/list"
import { useCurrentSession } from "~/session/current"
import { NoteBody, NoteButton } from "~/ui/title-with-note"

export const Route = createFileRoute("/pit/$team")({
  // 検索パラメータの検証 → 画面本体の順に書く(→ S-30)。`record` が入って
  // いれば、その記録を読み込んで書き直す。
  validateSearch: (search: Record<string, unknown>) => ({
    record: typeof search["record"] === "string" ? search["record"] : undefined,
  }),
  component: PitRecord,
})

// 1画面に閉じた見た目はクラスに切り出さず、ここに置く。択一の選択は
// 試合一覧とも共有するので globals.css の .ui-segment を使う。
//
// 押されている状態の色は、基底に片方を書いて条件でもう片方を足す形にしない。
// 同じプロパティのユーティリティは生成順で勝ち負けが決まり、足した側が黙って
// 負ける。両方の状態を排他の定数に分ける。
const TOGGLE_ROW =
  "flex h-14 items-center gap-2.5 rounded-control border-[1.5px] px-3.5 text-left text-[15px] font-bold"
const TOGGLE_OFF = "border-line bg-white text-secondary-ink"
const TOGGLE_ON = "border-brand bg-brand text-white"
const STEP_BUTTON =
  "h-14 w-14 shrink-0 rounded-control border-[1.5px] border-brand bg-brand-surface text-[22px] font-extrabold text-brand-hover"

type Answer = {
  readonly valueNumber?: number
  readonly valueText?: string
  readonly valueChoices?: readonly string[]
}

/* 絵だけのボタンの中身。意味は aria-label が持つので読み上げから外す(→ O-32)。 */

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  )
}

/** 保存する前の写真。記録を作ってから1枚ずつ送るので、ここでは手元に持つ。 */
type PendingPhoto = ShrunkPhoto & { readonly key: string }

/** すでに保存されている写真。書き直しのときだけ出る。 */
type SavedPhoto = {
  readonly id: string
  readonly width: number
  readonly height: number
}

/**
 * 保存済みの写真を消す。**2段に分ける。**消すと戻せないので、確定までに
 * 1段階挟む(→ 10-若者向けアプリ.md の Y-15、Y-20)。取り消せる操作には
 * 確認を挟まないが、これは取り消せない。
 */
function SavedPhotoTile({
  photo,
  busy,
  onRemove,
}: {
  photo: SavedPhoto
  busy: boolean
  onRemove: (photoId: string) => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <span className="relative">
      <img
        src={`/api/pit/photos/${photo.id}`}
        alt="保存済みの機体写真"
        width={photo.width}
        height={photo.height}
        className="size-24 rounded-control border border-line object-cover"
      />
      {confirming ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-control bg-white/90 p-1">
          <button
            type="button"
            disabled={busy}
            className="h-7 w-full rounded-control bg-error text-[11px] font-bold text-white disabled:opacity-50"
            onClick={() => {
              onRemove(photo.id)
            }}
          >
            消す
          </button>
          <button
            type="button"
            className="h-7 w-full rounded-control border border-line bg-white text-[11px] font-bold text-secondary-ink"
            onClick={() => {
              setConfirming(false)
            }}
          >
            やめる
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label="この写真を消す"
          disabled={busy}
          className="absolute -top-2 -right-2 size-7 rounded-full border-[1.5px] border-line bg-white text-sm text-error disabled:opacity-50"
          onClick={() => {
            setConfirming(true)
          }}
        >
          ✕
        </button>
      )}
    </span>
  )
}

function PhotoField({
  photos,
  saved,
  busy,
  onAdd,
  onRemove,
  onRemoveSaved,
}: {
  photos: readonly PendingPhoto[]
  saved: readonly SavedPhoto[]
  busy: boolean
  onAdd: (files: readonly File[]) => void
  onRemove: (key: string) => void
  onRemoveSaved: (photoId: string) => void
}) {
  // 入力欄を2つ持つ。**iPhone は `capture` の有無でしか経路を選べない。**
  // 付ければカメラへ直行し、付けなければアルバムから選べる。1つにまとめると
  // どちらかを諦めることになるので、ボタンも2つに分ける。
  const camera = useRef<HTMLInputElement>(null)
  const album = useRef<HTMLInputElement>(null)

  return (
    <div className="mt-2">
      {/* 保存済みが先。撮った順に並ぶので、いま足した分は後ろに続く。 */}
      {saved.length === 0 ? null : (
        <div className="mb-2 flex flex-wrap gap-2">
          {saved.map((photo) => (
            <SavedPhotoTile
              key={photo.id}
              photo={photo}
              busy={busy}
              onRemove={onRemoveSaved}
            />
          ))}
        </div>
      )}

      {photos.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <span key={photo.key} className="relative">
              <img
                src={photo.previewUrl}
                alt=""
                width={photo.width}
                height={photo.height}
                className="size-24 rounded-control border border-line object-cover"
              />
              <button
                type="button"
                aria-label="この写真を外す"
                disabled={busy}
                className="absolute -top-2 -right-2 size-7 rounded-full border-[1.5px] border-line bg-white text-sm text-error"
                onClick={() => {
                  onRemove(photo.key)
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* **配列へ写してから渡す。**FileList は入力欄と繋がった生きた参照で、
          value を空にした時点で中身も消える。縮小は非同期なので、読み終わる
          前に空になり、2枚目以降が黙って落ちる（実際に落ちた）。 */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // 同じ写真をもう一度選べるようにする。値が残っていると change が出ない。
          event.target.value = ""
          if (files.length > 0) onAdd(files)
        }}
      />
      <input
        ref={album}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ""
          if (files.length > 0) onAdd(files)
        }}
      />

      {/* 文字だと「撮る」と「追加する」が読み分けにくい。カメラとアップロードの
          絵で分ける。絵だけのボタンなので名前は aria-label で出す(→ O-30)。
          絵そのものは読み上げの対象にしない(→ O-32)。 */}
      <div
        className={`flex gap-2 ${
          photos.length === 0 && saved.length === 0 ? "mt-0" : "mt-2"
        }`}
      >
        <button
          type="button"
          disabled={busy}
          aria-label="写真を撮る"
          className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-control bg-brand text-white disabled:opacity-60"
          onClick={() => {
            camera.current?.click()
          }}
        >
          <CameraIcon />
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="撮ってある写真を選ぶ"
          className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-control border-[1.5px] border-brand bg-brand-surface text-brand-hover disabled:opacity-60"
          onClick={() => {
            album.current?.click()
          }}
        >
          <UploadIcon />
        </button>
      </div>
    </div>
  )
}

/** 押しっぱなしで動き出すまでの待ち。押した直後に走ると1ずつ刻めない。 */
const HOLD_START_MS = 450
/** 押しっぱなしの刻み。 */
const HOLD_STEP_MS = 90

function NumberField({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (next: number) => void
}) {
  const current = value ?? 0

  // 押しっぱなしの間の値。state を読むと、繰り返しの最中に古い値を見て
  // 1 と 2 を往復する。
  const held = useRef(current)
  held.current = current
  const timers = useRef<{
    start: number | undefined
    repeat: number | undefined
  }>({ start: undefined, repeat: undefined })

  const step = (by: number): void => {
    held.current = Math.max(0, held.current + by)
    onChange(held.current)
  }

  // **長押しで速く動かす。**個数が2桁になる機体があり、1ずつ押すと
  // ピットで時間を食う。押している間だけ繰り返し、離した時点で止める。
  const startHold = (by: number): void => {
    stopHold()
    timers.current.start = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => {
        step(by)
      }, HOLD_STEP_MS)
    }, HOLD_START_MS)
  }

  const stopHold = (): void => {
    if (timers.current.start !== undefined) {
      clearTimeout(timers.current.start)
      timers.current.start = undefined
    }
    if (timers.current.repeat !== undefined) {
      clearInterval(timers.current.repeat)
      timers.current.repeat = undefined
    }
  }

  useEffect(() => stopHold, [])

  const holdProps = (by: number) => ({
    onPointerDown: () => {
      startHold(by)
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  })

  return (
    <div className="mt-2 flex items-center gap-2.5">
      <button
        type="button"
        className={STEP_BUTTON}
        aria-label="減らす（長押しで速く）"
        onClick={() => {
          step(-1)
        }}
        {...holdProps(-1)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="h-14 min-w-0 flex-1 rounded-control border-[1.5px] border-line bg-white px-3.5 text-center text-2xl font-extrabold tabular-nums"
        value={String(current)}
        onChange={(event) => {
          const parsed = Number(event.target.value.replace(/[^0-9]/g, ""))
          onChange(Number.isFinite(parsed) ? parsed : 0)
        }}
      />
      {/* 単位は出さない。個数とは限らず、秒やセンチのこともある。 */}
      <button
        type="button"
        className={STEP_BUTTON}
        aria-label="増やす（長押しで速く）"
        onClick={() => {
          step(1)
        }}
        {...holdProps(1)}
      >
        ＋
      </button>
    </div>
  )
}

function QuestionField({
  question,
  answer,
  photos,
  savedPhotos,
  busy,
  onChange,
  onAddPhotos,
  onRemovePhoto,
  onRemoveSavedPhoto,
}: {
  question: Question
  answer: Answer | undefined
  photos: readonly PendingPhoto[]
  savedPhotos: readonly SavedPhoto[]
  busy: boolean
  onChange: (next: Answer) => void
  onAddPhotos: (files: readonly File[]) => void
  onRemovePhoto: (key: string) => void
  onRemoveSavedPhoto: (photoId: string) => void
}) {
  if (question.inputType === "photo") {
    return (
      <PhotoField
        photos={photos}
        saved={savedPhotos}
        busy={busy}
        onAdd={onAddPhotos}
        onRemove={onRemovePhoto}
        onRemoveSaved={onRemoveSavedPhoto}
      />
    )
  }

  if (question.inputType === "number") {
    return (
      <NumberField
        value={answer?.valueNumber}
        onChange={(next) => {
          onChange({ valueNumber: next })
        }}
      />
    )
  }

  if (question.inputType === "text") {
    return (
      <textarea
        className="mt-2 min-h-20 w-full rounded-control border-[1.5px] border-line bg-white px-3 py-2.5 font-normal"
        value={answer?.valueText ?? ""}
        onChange={(event) => {
          onChange({ valueText: event.target.value })
        }}
      />
    )
  }

  const selected = answer?.valueChoices ?? []
  const multiple = question.inputType === "multi"

  return (
    <div
      className={
        multiple ? "mt-2 flex flex-col gap-1.5" : "mt-2 flex flex-wrap gap-1.5"
      }
    >
      {question.choices.map((choice) => {
        const on = selected.includes(choice.id)
        if (multiple) {
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={on}
              className={`${TOGGLE_ROW} ${on ? TOGGLE_ON : TOGGLE_OFF}`}
              onClick={() => {
                onChange({
                  valueChoices: on
                    ? selected.filter((id) => id !== choice.id)
                    : [...selected, choice.id],
                })
              }}
            >
              <span className="w-5 text-base font-extrabold">
                {on ? "■" : "□"}
              </span>
              {choice.labelJa}
            </button>
          )
        }
        return (
          <button
            key={choice.id}
            type="button"
            aria-pressed={on}
            // 半分の幅で固定し、伸ばさない。伸ばすと、選択肢が奇数のときに
            // 最後の1つだけ横幅が2倍になり、大きさが重要さに見える。
            // 正本も `flex: 0 0 calc(50% - 3px)` で伸ばさない
            // (prototype/fgc-scout/tokens.css の .segment.is-wrap button)。
            className="ui-segment h-14 grow-0 basis-[calc(50%-0.375rem)]"
            onClick={() => {
              onChange({ valueChoices: on ? [] : [choice.id] })
            }}
          >
            {choice.labelJa}
          </button>
        )
      })}
    </div>
  )
}

function PitRecord() {
  const { team } = Route.useParams()
  const { record: editingId } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const questions = useQuestions()
  const records = usePitRecords()
  const session = useCurrentSession()

  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  // 書き直しのときは、いま入っている答えを最初に入れる。空から始めると、
  // 直したい1項目のために全部打ち直すことになる。
  const [loaded, setLoaded] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  // 項目ごとの写真。記録を作ってから1枚ずつ送るので、保存するまで手元に置く。
  const [photos, setPhotos] = useState<Record<string, PendingPhoto[]>>({})
  const [howTo, setHowTo] = useState(false)
  const [shrinking, setShrinking] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // 最後に触った写真の項目。貼り付けの行き先を決めるのに使う。
  const [lastPhotoField, setLastPhotoField] = useState<string | null>(null)
  // 貼り付けの行き先と、写真を足す関数。**受け口は document に付ける**ので、
  // そこから最新の値を読めるように参照で持つ。
  const pasteTarget = useRef<string | undefined>(undefined)
  const addRef = useRef<
    (questionId: string, files: readonly File[]) => Promise<void>
  >(async () => undefined)
  const photoKey = useRef(0)

  const addPhotos = async (
    questionId: string,
    files: readonly File[],
  ): Promise<void> => {
    setShrinking(true)
    setPhotoError(null)
    const added: PendingPhoto[] = []
    let failed = 0
    for (const file of files) {
      try {
        // 1枚ずつ縮める。読めない1枚のせいで残りを落とさない。
        // 並列にしない。原寸の画像を同時に何枚も展開すると、スマホの
        // メモリを使い切ってタブごと落ちる。
        // oxlint-disable-next-line no-await-in-loop -- 上のとおり順に処理する
        const shrunk = await shrinkPhoto(file)
        photoKey.current += 1
        added.push({ ...shrunk, key: `p${String(photoKey.current)}` })
      } catch {
        failed += 1
      }
    }
    if (failed > 0) {
      setPhotoError(
        `${String(failed)} 枚は読み込めませんでした。撮り直してください。`,
      )
    }
    setPhotos((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] ?? []), ...added],
    }))
    setShrinking(false)
  }
  addRef.current = addPhotos

  /**
   * **貼り付けでも写真を足せる。**パソコンでは撮るより貼るほうが速く、
   * 画面の切り抜きや他から取った画像をそのまま渡せる。
   *
   * **受け口は document に付ける。**`paste` は焦点のある要素で起きて上へ
   * 上がるので、画面のどこにも触っていない状態（焦点が body）だと、
   * 画面側の要素に付けても届かない（実際に届かなかった）。
   *
   * これは打鍵の横取りではないので O-25 の対象外。文字として貼る経路は
   * 残す。画像が入っていないときは何もしない。
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
        file.type.startsWith("image/"),
      )
      if (images.length === 0) return
      event.preventDefault()

      const target = pasteTarget.current
      if (target === undefined) {
        // 黙って捨てない。なぜ入らなかったかを出す(→ W-04)。
        setPhotoError(
          "この束には写真の項目がありません。写真のある束へ切り替えてから貼り付けてください。",
        )
        return
      }
      void addRef.current(target, images)
    }

    document.addEventListener("paste", onPaste)
    return () => {
      document.removeEventListener("paste", onPaste)
    }
  }, [])

  /**
   * 記録ができてから写真を1枚ずつ送る。画像は JSON へ包まず本文にそのまま
   * 載せる。base64 にすると転送が 1.33 倍になる。
   */
  const sendPhotos = async (recordId: string): Promise<void> => {
    for (const [questionId, list] of Object.entries(photos)) {
      for (const photo of list) {
        // 並列にしない。並び順はサーバが「いまの最大＋1」で採るので、
        // 同時に送ると同じ番号が2枚に付く。
        // oxlint-disable-next-line no-await-in-loop -- 採番が競合するため順に送る
        const sent = await fetch(
          `/api/pit/${recordId}/photos?questionId=${encodeURIComponent(
            questionId,
          )}&width=${String(photo.width)}&height=${String(photo.height)}`,
          { method: "POST", body: photo.blob, credentials: "same-origin" },
        )
        if (!sent.ok) throw new Error(`photo ${String(sent.status)}`)
      }
    }
  }

  const removePhoto = (questionId: string, key: string): void => {
    setPhotos((prev) => {
      const list = prev[questionId] ?? []
      const target = list.find((photo) => photo.key === key)
      if (target !== undefined) URL.revokeObjectURL(target.previewUrl)
      return {
        ...prev,
        [questionId]: list.filter((photo) => photo.key !== key),
      }
    })
  }

  const editing =
    editingId === undefined
      ? undefined
      : records.data?.find((item) => item.id === editingId)

  /**
   * 保存済みの写真を消す。**保存を待たずにその場で消える。**回答と違って
   * 写真は下書きを持っていないので、押した時点が確定になる。
   */
  const dropPhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const response = await api.api.pit.photos[":photoId"].$delete({
        param: { photoId },
      })
      if (!response.ok) throw new Error(`photo ${String(response.status)}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pit", "records"] })
    },
  })

  useEffect(() => {
    if (editing === undefined || loaded === editing.id) return
    const filled: Record<string, Answer> = {}
    for (const answer of editing.answers) {
      filled[answer.questionId] = {
        ...(answer.valueNumber === null
          ? {}
          : { valueNumber: answer.valueNumber }),
        ...(answer.valueText === null ? {} : { valueText: answer.valueText }),
        ...(answer.valueChoices.length === 0
          ? {}
          : { valueChoices: answer.valueChoices }),
      }
    }
    setAnswers(filled)
    setLoaded(editing.id)
  }, [editing, loaded])

  /**
   * 送る回答。**値の無い項目はキーごと落とす。**`undefined` を入れると、
   * 「答えていない」と「答えが undefined」がサーバ側で同じに見える。
   */
  const answerPayload = () => {
    const sent: {
      questionId: string
      valueNumber?: number
      valueText?: string
      valueChoices?: readonly string[]
    }[] = []
    for (const [questionId, answer] of Object.entries(answers)) {
      const one: (typeof sent)[number] = { questionId }
      if (answer.valueNumber !== undefined) one.valueNumber = answer.valueNumber
      if (answer.valueText !== undefined) one.valueText = answer.valueText
      if (answer.valueChoices !== undefined) {
        one.valueChoices = answer.valueChoices
      }
      sent.push(one)
    }
    return sent
  }

  const save = useMutation({
    mutationFn: async () => {
      // 書き直しは回答を丸ごと入れ替える。新しく撮った写真はその記録へ足す。
      if (editingId !== undefined) {
        const patched = await api.api.pit[":recordId"].$patch({
          param: { recordId: editingId },
          json: { answers: answerPayload() },
        })
        if (!patched.ok) throw new Error(`pit ${String(patched.status)}`)
        await sendPhotos(editingId)
        return { id: editingId }
      }

      const response = await api.api.pit.$post({
        json: { team, answers: answerPayload() },
      })
      if (!response.ok) throw new Error(`pit ${String(response.status)}`)
      const created = await response.json()
      await sendPhotos(created.id)
      return created
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pit", "records"] })
      // **訪問リストではなくそのチームの画面へ戻す。**書いた内容がその場で
      // 読めるので、打ち間違いや入れ忘れにすぐ気づける。直す導線もそこにある。
      await navigate({
        to: "/teams/$team",
        params: { team },
        search: { from: undefined },
      })
    },
  })

  if (questions.isPending || records.isPending) {
    return (
      <div className="p-4 text-secondary-ink">
        聞き取り項目を読み込んでいます。
      </div>
    )
  }

  if (questions.isError) {
    return (
      <div className="p-4 text-secondary-ink">
        聞き取り項目を読み込めませんでした。回線を確認してください。
      </div>
    )
  }

  // 項目の無いグループはページを作らない。生徒には空のタブだけが見える。
  const groups = groupQuestions(questions.data).filter(
    (group) => group.items.length > 0,
  )
  const current = activeGroup ?? groups[0]?.key ?? ""
  const items = groups.find((group) => group.key === current)?.items ?? []
  const answered = Object.keys(answers).length
  // 写真だけ撮って保存する使い方もある。項目の数だけで判断しない。
  const photoCount = Object.values(photos).reduce(
    (total, list) => total + list.length,
    0,
  )
  // 書き直しのときは空でも押せる。間違えて入れた答えを消すのも書き直しで、
  // 止めると「全部消す」だけができなくなる。
  const empty = answered === 0 && photoCount === 0 && editingId === undefined

  // 貼り付けの行き先。**いま開いている束の写真の項目に限る。**見えていない
  // 項目へ入れると、貼ったつもりの写真がどこにも出てこない。最後に触った
  // 項目を優先し、それがこの束に無ければ先頭の写真の項目にする。
  const photoFields = items.filter((item) => item.inputType === "photo")
  const pasteInto =
    photoFields.find((item) => item.id === lastPhotoField) ?? photoFields[0]
  // 貼り付けの受け口は document に付けてある。そこから今の行き先を読めるよう
  // 参照へ写す。描画のたびに書き換わってよい値なので state にはしない。
  pasteTarget.current = pasteInto?.id

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="text-[15px] font-extrabold">
          {editingId === undefined ? "ピット" : "書き直し"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
          {team}
        </span>
        <span className="text-xs text-muted-ink">
          {answered} 項目
          {photoCount === 0 ? "" : ` · 写真 ${String(photoCount)} 枚`}
        </span>
        {/* 保存の仕方はここへ畳む。聞き取りの最中はずっと出ている画面なので、
            ボタンの下に常時2行あると、その分だけ項目が入らない。 */}
        <NoteButton
          title={editingId === undefined ? "ピット記録" : "書き直し"}
          open={howTo}
          onToggle={() => {
            setHowTo(!howTo)
          }}
        />
      </header>

      {howTo ? (
        <div className="border-b border-line px-4 py-2">
          <NoteBody>
            {(editingId === undefined
              ? "答えた項目だけが残る。空欄のままでよい。保存するとそのチームの画面へ戻り、書いた内容をその場で確かめられる。英語の文はそのまま読み上げる用。"
              : "保存すると、いまの回答を丸ごと置き換える。空にした項目は消える。写真は保存を待たずその場で足し引きされる。") +
              "写真は撮る・選ぶのほかに、貼り付け（Ctrl+V）でも足せる。"}
          </NoteBody>
        </div>
      ) : null}

      {/* 誰の記録を直しているかを先に出す。共有の記録なので他人のものも
          直せるが、それと知らずに直すと、書いた本人には理由の分からない
          書き換えとして届く。 */}
      {editing === undefined ||
      editing.scoutName === session.data?.scoutName ? null : (
        <p className="border-b border-line bg-brand-surface px-4 py-2.5 text-xs text-secondary-ink">
          これは
          <strong className="font-extrabold">{editing.scoutName}</strong>
          が書いた記録です。直すと、直した人としてあなたの名前が残ります
        </p>
      )}

      {groups.length > 1 ? (
        <nav className="flex border-b border-line">
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              aria-current={group.key === current ? "page" : undefined}
              className={`h-12 flex-1 text-xs font-bold ${
                group.key === current
                  ? "border-b-[3px] border-brand text-brand-hover"
                  : "text-muted-ink"
              }`}
              onClick={() => {
                setActiveGroup(group.key)
              }}
            >
              {groupLabel(questions.data.groups, group.key)}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {items.map((question) => (
          <section
            key={question.id}
            className="mt-4.5"
            // 触った写真の項目を覚える。貼り付けはここへ入る。
            onPointerDownCapture={() => {
              if (question.inputType === "photo") setLastPhotoField(question.id)
            }}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[14.5px] font-extrabold">
                {question.labelJa}
              </span>
              {/* 写真の項目が2つ以上あるときだけ、どこへ貼られるかを出す。
                  1つしか無ければ迷いようがないので黙っている。 */}
              {photoFields.length > 1 && pasteInto?.id === question.id ? (
                <span className="shrink-0 rounded-tag border border-brand bg-brand-surface px-[7px] py-0.5 text-[10.5px] font-bold text-brand-hover">
                  貼り付け先
                </span>
              ) : null}
            </div>
            {/* 生徒がそのまま読み上げる。聞き方が分からない項目は空欄で戻ってくる */}
            <div className="mt-0.5 text-[12.5px] font-normal text-brand-hover italic">
              {question.askEn}
            </div>
            <QuestionField
              question={question}
              answer={answers[question.id]}
              photos={photos[question.id] ?? []}
              savedPhotos={(editing?.photos ?? []).filter(
                (photo) => photo.questionId === question.id,
              )}
              busy={shrinking || save.isPending || dropPhoto.isPending}
              onChange={(next) => {
                setAnswers((prev) => ({ ...prev, [question.id]: next }))
              }}
              onAddPhotos={(files) => {
                void addPhotos(question.id, files)
              }}
              onRemovePhoto={(key) => {
                removePhoto(question.id, key)
              }}
              onRemoveSavedPhoto={(photoId) => {
                dropPhoto.mutate(photoId)
              }}
            />
          </section>
        ))}
      </div>

      <div className="border-t border-line px-4 py-3">
        <button
          type="button"
          className="h-14 w-full rounded-control bg-rank-high text-[17px] font-extrabold text-white disabled:opacity-60"
          disabled={save.isPending || shrinking || empty}
          onClick={() => {
            save.mutate()
          }}
        >
          {save.isPending
            ? "保存しています"
            : editingId === undefined
              ? "保存する"
              : "書き直しを保存する"}
        </button>
        {photoError === null ? null : (
          <p role="alert" className="mb-2 text-center text-xs text-error">
            {photoError}
          </p>
        )}
        {shrinking ? (
          <p className="mb-2 text-center text-xs text-secondary-ink">
            写真を縮小中…
          </p>
        ) : null}
        {/* 失敗だけを出す。うまくいく前提の説明は見出しの「？」の中(→ howTo)。 */}
        {save.isError ? (
          <p className="mt-2 text-center text-xs text-error">
            保存できませんでした（{save.error.message}）。
            回線を確認してもう一度押してください。
          </p>
        ) : null}
      </div>
    </div>
  )
}
