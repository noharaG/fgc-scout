import { useQuery } from "@tanstack/react-query"

import { api } from "~/client/api"

export type Snapshot = {
  readonly data: unknown
  readonly fetchedAt: number
  readonly stale: boolean
}

/**
 * 公式データの最新スナップショット。2つ以上の画面から使うのでここに置く。
 * サーバ側が30秒間隔を守るので、画面側は素直に取りに行ってよい。
 */
export function useSnapshot() {
  return useQuery<Snapshot>({
    queryKey: ["official", "snapshot"],
    queryFn: async () => {
      const response = await api.api.official.$get()
      if (response.status === 401) throw new Error("unauthenticated")
      if (!response.ok) throw new Error(`official ${String(response.status)}`)
      // サーバのルート型から形が直結しているので、ここで絞り直さない。
      const body = await response.json()
      return {
        data: body.data,
        fetchedAt: body.fetchedAt,
        stale: body.stale,
      }
    },
  })
}

/**
 * 取得時刻の表示。**いつの数字かを必ず添える**ための関数で、
 * 省くと順位が動いていないのか取得が止まっているのか読み手が区別できない。
 */
export function fetchedAgo(timestamp: number, stale: boolean): string {
  if (timestamp === 0) return "取得時刻が不明"
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  const ago = minutes === 0 ? "1分以内に取得" : `${String(minutes)}分前に取得`
  return stale ? `${ago}（最新の取得に失敗したため前回の内容）` : ago
}
