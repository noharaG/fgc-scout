import { useQuery } from "@tanstack/react-query"
import type { InferResponseType } from "hono/client"

import { api } from "~/client/api"

type PitResponse = InferResponseType<typeof api.api.pit.$get>

export type PitRecord = PitResponse["records"][number]

export function usePitRecords() {
  return useQuery({
    queryKey: ["pit", "records"],
    queryFn: async (): Promise<readonly PitRecord[]> => {
      const response = await api.api.pit.$get()
      if (response.status === 401) throw new Error("unauthenticated")
      if (!response.ok) throw new Error(`pit ${String(response.status)}`)
      const body = await response.json()
      return body.records
    },
  })
}

/** 記録済みのチーム名。同じチームを複数人が記録していてもよい。 */
export function recordedTeams(
  records: readonly PitRecord[],
): ReadonlySet<string> {
  return new Set(records.map((record) => record.team))
}
