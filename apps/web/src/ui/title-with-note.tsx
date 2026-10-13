import { useState } from "react"

/**
 * 見出しの横に置く「？」。**注記は既定で畳む。**
 *
 * 常に出していると、本題（並んでいるデータ）より先に細かい字が目へ入り、
 * 見出しと中身の間に読み飛ばす行ができる。読み方は一度分かれば毎回は要らない
 * ので、押したときだけ出す。
 *
 * 押して開くだけの部品なので、オーバーレイにしない。ホバーで開くと、タッチでは
 * ホバーとタップを分離できず、触るたびに出る(→ O-24)。キー操作は `button` が
 * 持つものに任せ、自前で書かない(→ O-25)。
 *
 * **畳んでよいのは「読み方」だけ。**エラー・警告・いま起きていることは畳まない。
 * 畳むと、見なくても済むものとして扱われる(→ W-04)。
 */
export function NoteButton({
  title,
  open,
  onToggle,
}: {
  readonly title: string
  readonly open: boolean
  readonly onToggle: () => void
}) {
  return (
    // アイコンだけのボタンなので名前を明示する(→ O-30)。文型は
    // 「<対象>を<動詞>」(→ W-27)。
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${title}の読み方を${open ? "閉じる" : "開く"}`}
      className="size-7 shrink-0 rounded-full border border-line bg-white text-xs font-bold text-secondary-ink"
      onClick={onToggle}
    >
      ?
    </button>
  )
}

/** 開いたときに出る面。「？」を自前で持つ画面が体裁を揃えるために使う。 */
export function NoteBody({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="mt-1.5 rounded-control bg-surface-soft px-3 py-2 text-xs text-secondary-ink">
      {children}
    </p>
  )
}

/** 見出しと、その画面の読み方。畳む中身が1つで済むときはこれを使う。 */
export function TitleWithNote({
  title,
  note,
  as: Heading = "h1",
  className = "ui-section-heading",
}: {
  readonly title: string
  readonly note: React.ReactNode
  readonly as?: "h1" | "h2"
  readonly className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Heading className={className}>{title}</Heading>
        <NoteButton
          title={title}
          open={open}
          onToggle={() => {
            setOpen(!open)
          }}
        />
      </div>

      {open ? <NoteBody>{note}</NoteBody> : null}
    </>
  )
}
