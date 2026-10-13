import { useQuery } from "@tanstack/react-query"
import type { InferResponseType } from "hono/client"

import { api } from "~/client/api"

/**
 * 聞き取り項目はデータであって固定の仕様ではない。管理者が変えるので、
 * 画面は取得したものをそのまま並べる(→ 要件定義書 F9)。
 *
 * 束ねるグループも同じ。名前を画面が持つと、管理者が直した名前が反映されず、
 * 足したグループにも名前を付けられない。
 *
 * 型はサーバのルート定義から導出する。手書きの型を置くと、項目が増えたときに
 * 2箇所を直すことになる(→ S-33)。
 */
type QuestionsResponse = InferResponseType<typeof api.api.questions.$get>

export type Question = QuestionsResponse["questions"][number]
export type Group = QuestionsResponse["groups"][number]

export type QuestionSet = {
  readonly questions: readonly Question[]
  readonly groups: readonly Group[]
}

export function useQuestions() {
  return useQuery({
    queryKey: ["questions"],
    queryFn: async (): Promise<QuestionSet> => {
      const response = await api.api.questions.$get()
      if (response.status === 401) throw new Error("unauthenticated")
      if (!response.ok) throw new Error(`questions ${String(response.status)}`)
      const body = await response.json()
      return { questions: body.questions, groups: body.groups }
    },
    // 管理者が変えたら次に開いた端末から反映される。入力中に差し替わると
    // 回答が消えるので、画面を開いている間は取り直さない。
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/**
 * グループ（ページの分かれ目）ごとに、並び順を保ったまま束ねる。
 *
 * 項目が1つも無いグループも返す。管理者が先にグループを作って、
 * そこへ項目を移す手順を踏めるようにするため。項目のある側だけ返すと、
 * 作ったばかりのグループが画面から消えて移す先を選べない。
 */
export function groupQuestions(
  set: QuestionSet,
): readonly { readonly key: string; readonly items: readonly Question[] }[] {
  const byKey = new Map<string, Question[]>()
  for (const group of set.groups) byKey.set(group.key, [])

  const order: string[] = set.groups.map((group) => group.key)
  for (const question of set.questions) {
    const existing = byKey.get(question.groupKey)
    if (existing === undefined) {
      // グループ表に無いキー。項目を消さずに末尾へ出す。
      order.push(question.groupKey)
      byKey.set(question.groupKey, [question])
    } else {
      existing.push(question)
    }
  }

  return order.map((key) => ({ key, items: byKey.get(key) ?? [] }))
}

/** グループの表示名。管理者が直すので、画面ではなくデータから引く。 */
export function groupLabel(groups: readonly Group[], key: string): string {
  return groups.find((group) => group.key === key)?.labelJa ?? key
}
