import { useQuery } from "@tanstack/react-query"

import { api } from "~/client/api"

export type CurrentSession = {
  readonly role: "viewer" | "admin"
  readonly scoutName: string
}

/**
 * 今のセッション。ナビの出し分けに使う。
 *
 * **これは認可ではない。**権限の強制はサーバ側の前段1箇所で済んでいる。
 * ここで admin 用の項目を隠すのは、押しても 403 になる導線を見せない
 * ためだけである(→ AGENTS.md の Invariants)。
 */
export function useCurrentSession() {
  return useQuery<CurrentSession | null>({
    queryKey: ["session", "current"],
    queryFn: async () => {
      const response = await api.api.session.$get()
      if (response.status === 401) return null
      if (!response.ok) throw new Error(`session ${String(response.status)}`)
      return await response.json()
    },
    // ログイン直後に反映されてほしいので、他のクエリより短く保つ。
    staleTime: 0,
  })
}
