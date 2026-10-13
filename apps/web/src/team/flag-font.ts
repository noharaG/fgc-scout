/**
 * 国旗が出ない環境だけ、旗の絵文字フォントを後から足す。
 *
 * **端末に旗の字がある環境では何も読み込まない。**生徒が使うスマホは
 * iOS も Android も自前で旗を持っているので、足すと 709KB をただ払うだけに
 * なる。旗が出ないのは主に Windows で、そこでは `🇯🇵` が `JP` のような
 * 2文字の箱に見える。
 *
 * 読み込むのは Noto Color Emoji のうち**地域表示記号だけの1本**。
 * Google Fonts が unicode-range で分けて配っており、`U+1F1E6-1F1FF` の
 * subset だけが落ちてくる（→ 転送量の実測は下の EMOJI_SUBSET_BYTES）。
 *
 * **失敗時の文言と再試行は置かない**(→ A-17 の「置かない理由をその場に書く」)。
 * 旗は飾りで、読み上げからも外してある。取れなければ今までどおり2文字の箱に
 * 見えるだけで、隣に国名が出ている。利用者が回復すべき失敗が無い。
 */

// 転送量の実測(→ A-18)。2026-09-23、旗だけの subset が woff2 で
// 709,020 バイト。測った対象は下の STYLESHEET が指す `U+1F1E6-1F1FF` の
// 1本で、使う画面は訪問リスト・チーム一覧・試合詳細・次の試合。
// 予算の根拠は「会場の Wi-Fi で待たされない」。常時読み込みにすると
// 画面本体（gzip 88KB）の8倍を飾りに払うことになるので条件付きにした。
const STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap"

/**
 * 旗が1文字として描けるかを測る。
 *
 * 描ける環境では2つの地域表示記号が合字になり、**別々に測った幅の合計より
 * 狭くなる。**描けない環境では2つの箱が並ぶだけなので、幅は合計と一致する。
 * 「豆腐（□）が出るか」では判定できない。Windows は箱付きの英字という
 * 別の字を描いてしまい、字が無いようには見えないため。
 */
function flagsRenderNatively(): boolean {
  const context = document.createElement("canvas").getContext("2d")
  // 測れないときは足さない。判断できないまま 709KB を払わせない。
  if (context === null) return true

  context.font = "32px sans-serif"
  return isLigated(
    context.measureText("\u{1F1EF}\u{1F1F5}").width,
    context.measureText("\u{1F1EF}").width +
      context.measureText("\u{1F1F5}").width,
  )
}

/**
 * 判定そのもの。測る処理から切り離してあるのは、これだけ単体で確かめられる
 * ようにするため（canvas の無い所でも動く）。
 *
 * 丸めの差で取り違えないよう、**はっきり狭いときだけ**「描ける」とする。
 */
export function isLigated(pairWidth: number, apartWidth: number): boolean {
  return pairWidth < apartWidth - 1
}

/** 入口から1回だけ呼ぶ。2回目以降は何もしない。 */
export function loadFlagFontIfNeeded(): void {
  if (document.querySelector(`link[href="${STYLESHEET}"]`) !== null) return
  if (flagsRenderNatively()) return

  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = STYLESHEET
  document.head.append(link)
}
