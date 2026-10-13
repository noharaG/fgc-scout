import { useEffect, useRef, useState } from "react"

/**
 * 写真をアプリの中で見る。**別のタブへ飛ばさない。**
 *
 * 飛ばすと、戻るのにブラウザのタブ操作が要る。ピットを回りながら片手で
 * 使う画面なので、見て閉じるまでが1つの動作で済むようにする。
 *
 * **横に送れるのは渡された束の中だけ。**チーム詳細から開けばそのチームの
 * 写真だけを行き来し、端で止まる。隣の国へは続かない。
 *
 * 送りは自前のジェスチャではなく、**スクロールと吸着（scroll snap）で作る。**
 * 指のなぞりもトラックパッドも端末の作法のまま効き、慣性や端の跳ね返りも
 * 端末のものになる。自前で書くと、その全部を作り直すことになる。
 */

export type ViewerPhoto = {
  readonly id: string
  readonly width: number
  readonly height: number
  /** 読み上げ用。誰が撮ったものかを入れる。 */
  readonly label: string
}

export function PhotoViewer({
  photos,
  startId,
  onClose,
}: {
  readonly photos: readonly ViewerPhoto[]
  readonly startId: string
  readonly onClose: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const startIndex = Math.max(
    0,
    photos.findIndex((photo) => photo.id === startId),
  )
  const [index, setIndex] = useState(startIndex)

  // 押した写真から始める。開いた直後に1枚目へ戻ると、どれを押したのか
  // 分からなくなる。吸着が効く前に位置を決めるので、描画の直後に1回だけ。
  useEffect(() => {
    const element = track.current
    if (element === null) return
    element.scrollLeft = element.clientWidth * startIndex
  }, [startIndex])

  // 初期フォーカスは本文の先頭へ入れる(→ O-20)。見出しに `tabIndex={-1}` と
  // `outline-none` を付けてあるので、開いた瞬間にリングは出ない。
  // 戻り先は呼び出し側が持つ(→ teams.$team.tsx)。
  useEffect(() => {
    heading.current?.focus()
  }, [])

  // 自前で書く打鍵は Escape だけ(→ O-25)。左右の送りはスクロールが持つので
  // 矢印キーは書かない。
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  // 開いている間は後ろのページを動かさない。指を離した場所で背後が
  // スクロールしていると、閉じたときに見ていた記録を見失う。
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const goTo = (next: number): void => {
    const element = track.current
    if (element === null) return
    const clamped = Math.min(Math.max(0, next), photos.length - 1)
    element.scrollTo({
      left: element.clientWidth * clamped,
      behavior: "smooth",
    })
  }

  const current = photos[index]

  return (
    // 幕と中身を1つの要素に入れる。分けると段を2つ使うことになり、
    // 隣り合う値を各所に書くことになる(→ O-01)。
    <div
      role="dialog"
      aria-modal="true"
      aria-label="機体写真"
      /* 地は透かさない。透けると後ろの表と写真が重なって、どちらも読めない
         （実際にそうなった）。**暗いのは写真を見るための面が1つあるだけで、
         配色を2組にしたわけではない**(→ AGENTS.md の Invariants)。 */
      className="fixed inset-0 z-(--layer-dialog) flex flex-col bg-ink"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 開いた直後の読み上げ位置。リングは出さない(→ O-20)。 */}
        <h2
          ref={heading}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-sm font-bold text-white outline-none"
        >
          {current?.label ?? "機体写真"}
        </h2>
        <span className="shrink-0 text-xs font-bold text-white tabular-nums">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          aria-label="写真を閉じる"
          className="h-10 shrink-0 rounded-control border-[1.5px] border-white/60 px-3.5 text-sm font-bold text-white"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>

      {/* 吸着で1枚ずつ止める。`overscroll-contain` は、端まで送った指の勢いが
          後ろのページへ渡らないようにするためのもの。 */}
      <div
        ref={track}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain"
        onScroll={(event) => {
          const element = event.currentTarget
          const at = Math.round(element.scrollLeft / element.clientWidth)
          if (at !== index) setIndex(at)
        }}
      >
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="flex w-full shrink-0 snap-center items-center justify-center px-4"
          >
            <img
              src={`/api/pit/photos/${photo.id}`}
              alt={photo.label}
              width={photo.width}
              height={photo.height}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ))}
      </div>

      {/* 指でなぞれない環境のための送り。**端では押せない。**押せてしまうと
          「まだ先がある」と読めてしまう。 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          aria-label="前の写真"
          disabled={index === 0}
          className="h-11 rounded-control border-[1.5px] border-white/60 px-4 text-sm font-bold text-white disabled:opacity-40"
          onClick={() => {
            goTo(index - 1)
          }}
        >
          ← 前
        </button>
        <button
          type="button"
          aria-label="次の写真"
          disabled={index >= photos.length - 1}
          className="h-11 rounded-control border-[1.5px] border-white/60 px-4 text-sm font-bold text-white disabled:opacity-40"
          onClick={() => {
            goTo(index + 1)
          }}
        >
          次 →
        </button>
      </div>
    </div>
  )
}
