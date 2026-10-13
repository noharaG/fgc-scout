/**
 * Proxy fetch of the official results site.
 *
 * results.first.global は CORS ヘッダを返さないため、ブラウザから直接は
 * 取得できない(実測で確認)。サーバ側で代理取得し、取得した JSON は
 * 加工せず原文のまま保存する。解釈は読み出し側に置く(→ ADR 0003)。
 */

import { field } from "./json"

export type SnapshotSource = "next-data" | "html"

export type FetchOutcome =
  | {
      readonly ok: true
      readonly raw: string
      readonly source: SnapshotSource
      readonly buildId: string | null
    }
  | { readonly ok: false; readonly reason: string }

const NEXT_DATA_SCRIPT = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/

function readBuildId(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const buildId = field(parsed, "buildId")
  return typeof buildId === "string" ? buildId : null
}

async function fetchNextData(
  baseUrl: string,
  buildId: string,
): Promise<FetchOutcome> {
  const url = `${baseUrl}/_next/data/${buildId}/index.json`
  let response: Response
  try {
    response = await fetch(url, { headers: { accept: "application/json" } })
  } catch (error) {
    return { ok: false, reason: `next-data fetch failed: ${String(error)}` }
  }
  if (!response.ok) return { ok: false, reason: `next-data ${response.status}` }
  return {
    ok: true,
    raw: await response.text(),
    source: "next-data",
    buildId,
  }
}

async function fetchHtml(baseUrl: string): Promise<FetchOutcome> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/`, { headers: { accept: "text/html" } })
  } catch (error) {
    return { ok: false, reason: `html fetch failed: ${String(error)}` }
  }
  if (!response.ok) return { ok: false, reason: `html ${response.status}` }

  const match = NEXT_DATA_SCRIPT.exec(await response.text())
  if (match === null) return { ok: false, reason: "__NEXT_DATA__ not found" }

  const raw = match[1] ?? ""
  return { ok: true, raw, source: "html", buildId: readBuildId(raw) }
}

/**
 * Tries the light endpoint first, then falls back to the HTML.
 * `_next/data` は数百バイト、HTML は 69KB。ただし buildId は再ビルドで
 * 変わるので、変わった時点で HTML から取り直す二段構えにする。
 */
export async function fetchOfficial(
  baseUrl: string,
  knownBuildId: string | null,
): Promise<FetchOutcome> {
  if (knownBuildId !== null) {
    const viaData = await fetchNextData(baseUrl, knownBuildId)
    if (viaData.ok) return viaData
  }
  return await fetchHtml(baseUrl)
}

/**
 * The two endpoints wrap the same object at different depths:
 *   next-data: `{ pageProps: { data } }`
 *   html:      `{ props: { pageProps: { data } } }`
 *
 * 原文のまま保存しているので、読み出す側で両方の形を吸収する。
 * 知らないキーが来ても掘るだけで、中身の検査はしない(→ ADR 0003)。
 */
export function extractData(raw: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  const viaHtml = field(field(field(parsed, "props"), "pageProps"), "data")
  if (viaHtml !== undefined) return viaHtml
  return field(field(parsed, "pageProps"), "data")
}
