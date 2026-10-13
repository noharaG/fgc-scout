import { useState } from "react"

/**
 * 打った文字を端末に覚えておく。**チーム一覧と訪問リストの検索欄で使う**
 * ので汎用層に置く(→ S-10)。
 *
 * 絞り込んだまま1チーム開いて戻る、という使い方をするので、戻るたびに
 * 打ち直させない。何で絞っているかは欄に文字が残るので画面から読める。
 *
 * localStorage は読めないことも書けないこともある（プライベートウィンドウ、
 * 設定で切っている場合）。**失敗は握りつぶして既定へ落とす。**覚えられない
 * だけで、検索そのものは動く。
 *
 * キーは `<アプリ名>_<用途>` の小文字スネークケース(→ login.tsx)。
 */
export function useRememberedText(
  key: string,
): readonly [string, (next: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return globalThis.localStorage.getItem(key) ?? ""
    } catch {
      return ""
    }
  })

  const remember = (next: string): void => {
    setValue(next)
    try {
      // 空は覚えない。消しておけば、次に開いたときは素の一覧から始まる。
      if (next === "") globalThis.localStorage.removeItem(key)
      else globalThis.localStorage.setItem(key, next)
    } catch {
      // 覚えられなくても絞り込み自体は効く。
    }
  }

  return [value, remember]
}
