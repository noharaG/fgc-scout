import { describe, expect, test } from "vite-plus/test"

import { extractData } from "./official"

/**
 * 「未知のキーで落ちない」は AGENTS.md の Invariants にある。
 * matches[].details の中身は大会が始まるまで確認できないので、
 * 知らない形が来ても掘るだけで壊れないことをここで固定する。
 */

const DATA = {
  matches: [{ name: "Q1", redScore: 120, blueScore: 98 }],
  rankings: [{ team: "Japan", rank: 12 }],
}

describe("extractData", () => {
  test("_next/data の形から data を取り出す", () => {
    const raw = JSON.stringify({ pageProps: { data: DATA }, __N_SSG: true })
    expect(extractData(raw)).toEqual(DATA)
  })

  test("HTML の __NEXT_DATA__ の形から data を取り出す", () => {
    const raw = JSON.stringify({
      props: { pageProps: { data: DATA } },
      buildId: "abc123",
    })
    expect(extractData(raw)).toEqual(DATA)
  })

  test("知らないキーが増えていても落ちず、data をそのまま返す", () => {
    const withUnknown = {
      ...DATA,
      matches: [
        {
          name: "Q1",
          redScore: 120,
          blueScore: 98,
          // 大会が始まるまで形の分からない領域。
          details: { someKeyWeHaveNeverSeen: { nested: [1, 2, 3] } },
          anotherNewTopLevelKey: true,
        },
      ],
    }
    const raw = JSON.stringify({ pageProps: { data: withUnknown } })
    expect(extractData(raw)).toEqual(withUnknown)
  })

  test("壊れた JSON は undefined になり、例外を投げない", () => {
    expect(extractData("{not json")).toBe(undefined)
    expect(extractData("")).toBe(undefined)
  })

  test("data が無い形は undefined になる", () => {
    expect(extractData(JSON.stringify({ pageProps: {} }))).toBe(undefined)
    expect(extractData(JSON.stringify({ hello: "world" }))).toBe(undefined)
  })

  test("JSON の null や配列を渡しても掘るだけで壊れない", () => {
    expect(extractData("null")).toBe(undefined)
    expect(extractData("[1,2,3]")).toBe(undefined)
    expect(extractData("42")).toBe(undefined)
  })
})
