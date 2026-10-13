import type { QuestionSet } from "./list"

/**
 * 回答を読める文字にする。チーム詳細とチーム一覧の表の2画面で使う。
 * 項目が無効化されていると名前が引けないので、その旨を出す。
 */
export function answerText(
  set: QuestionSet,
  answer: {
    readonly questionId: string
    readonly valueNumber: number | null
    readonly valueText: string | null
    readonly valueChoices: readonly string[]
  },
): { readonly label: string; readonly value: string } {
  const question = set.questions.find((item) => item.id === answer.questionId)
  const label =
    question?.labelJa ?? `${answer.questionId}（いま使っていない項目）`

  if (answer.valueChoices.length > 0) {
    const names = answer.valueChoices.map((id) => {
      const choice = question?.choices.find((item) => item.id === id)
      return choice?.labelJa ?? id
    })
    return { label, value: names.join("、") }
  }
  if (answer.valueNumber !== null) {
    return { label, value: answer.valueNumber.toLocaleString("ja-JP") }
  }
  if (answer.valueText !== null && answer.valueText !== "") {
    return { label, value: answer.valueText }
  }
  // 値が無い欄は空にせず記号を置く。空欄だと「無い」と「描けなかった」を
  // 区別できない(→ W-22)。
  return { label, value: "—" }
}
