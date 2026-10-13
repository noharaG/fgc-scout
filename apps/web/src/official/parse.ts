/**
 * 公式データの解釈。取り込み層(apps/api)は応答を原文のまま保つので、
 * 形を読むのはここだけにする。
 *
 * **キー名はまだ確定していない。**2026-09-10 時点で公式サイトの配列は
 * すべて空で、実データを見られない。去年のスクレイピングでは
 * `details.redRobotOneParking` の形だったが、今年はランキング列に
 * `Climb Points` があり名前が変わっている可能性が高い。
 *
 * そのため各項目で候補キーを順に試し、**どれにも当たらなければ null を返す。**
 * 落ちるより欠けるほうを選ぶ(→ AGENTS.md の Invariants)。
 * 大会初日に実データを見た時点で、当たったキーだけに絞ってこの配列を短くする。
 */

import { nameOfCode } from "~/team/roster"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function pickString(source: unknown, keys: readonly string[]): string | null {
  if (!isRecord(source)) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value !== "") return value
  }
  return null
}

function pickNumber(source: unknown, keys: readonly string[]): number | null {
  if (!isRecord(source)) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    // 公式の JSON が数値を文字列で返す場合に備える。
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function pickArray(source: unknown, key: string): readonly unknown[] {
  if (!isRecord(source)) return []
  const value = source[key]
  return Array.isArray(value) ? value : []
}

export type OfficialMatch = {
  readonly name: string
  /** 赤3チーム→青3チームの順に並ぶ。国名で入る。 */
  readonly teams: readonly string[]
  readonly redScore: number | null
  readonly blueScore: number | null
  readonly field: string | null
  /**
   * 予定時刻。`"2026-10-08T11:15:00.900+09:00"` の形で、**会場の時刻**が
   * そのまま入っている。`Date` へ通して組み直さない(→ matchClock)。
   */
  readonly scheduledTime: string | null
  readonly played: boolean
}

export type OfficialRanking = {
  /** 表示名。`rankings[].team.name`（例 "Republic of Korea"）。 */
  readonly team: string
  /** ISO3 の国コード（例 "KOR"）。試合の参加者はこちらしか持たない。 */
  readonly code: string | null
  readonly rank: number | null
  readonly rankingScore: number | null
  readonly highestScore: number | null
  readonly climbPoints: number | null
  readonly played: number | null
}

/**
 * 国コード → 表示名の対応。
 *
 * **試合の `participants[]` は国コードしか持たない。**名前は順位表の
 * `team` オブジェクトにしか無いので、同じ応答の中から引き当てる。
 * 2025 の実データで確認した形（`participants[].country` = "JPN"、
 * `rankings[].team` = `{ country: "JPN", name: "Japan" }`）。
 */
/**
 * 公式の表示名をこれまでの名前にそろえる。
 *
 * **2026 は順位表が出た時点で `Team Japan` のように `Team ` 付きになった**
 * （185件すべて。2025 は `Japan` だった）。そのまま使うと2つ壊れる。
 *
 * 1. 自チームの判定は名前の一致で行うので、`"Japan"` がどの試合にも当たらず
 *    「次の試合」「自分の試合」「訪問リスト」が全部空になる
 * 2. ピット記録は国名を鍵に保存してあるので、記録とチームの結び付きが切れる
 *
 * **接頭辞があるときだけ剥がす。**公式が付けるのをやめたら、何もせずに
 * 元どおり動く。
 */
function tidyName(name: string): string {
  const stripped = name.replace(/^Team\s+/u, "")
  // 剥がした結果が空になる名前は、剥がす前のほうが情報がある。
  return stripped === "" ? name : stripped
}

function teamNames(data: unknown): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  for (const raw of pickArray(data, "rankings")) {
    const team = isRecord(raw) ? raw["team"] : undefined
    const code = pickString(team, ["country", "countryCode"])
    const name = pickString(team, ["name", "shortName"])
    if (code !== null && name !== null) {
      names.set(code.toUpperCase(), tidyName(name))
    }
  }
  return names
}

/**
 * 1チームぶんの表示名。**公式が名乗った名前を最優先する。**
 *
 * 順位表が空のときだけ参加国名簿から引く(→ team/roster.ts の nameOfCode)。
 * 2026 はマッチスケジュールだけが先に出て順位表が空だったため、この受け皿が
 * 無いと全チームがコードで並び、自チームもどの試合にも一致しなかった。
 *
 * どちらでも引けなければコードをそのまま出す。**落とさない。**
 */
function displayName(
  code: string,
  official: ReadonlyMap<string, string>,
): string {
  return official.get(code.toUpperCase()) ?? nameOfCode(code) ?? code
}

/** フィールド番号。文字列でも数でも受ける。 */
function fieldOf(raw: unknown): string | null {
  const text = pickString(raw, ["field", "fieldName"])
  if (text !== null) return text
  const number = pickNumber(raw, ["field"])
  return number === null ? null : String(number)
}

export function parseMatches(data: unknown): readonly OfficialMatch[] {
  const names = teamNames(data)

  return pickArray(data, "matches").flatMap((raw): OfficialMatch[] => {
    const name = pickString(raw, ["name", "matchName", "match"])
    if (name === null) return []

    // 参加者は station で赤(1x)と青(2x)に分かれる。配列の順序ではなく
    // station が正で、並びが崩れた応答でもアライアンスを取り違えない。
    const participants = pickArray(raw, "participants").toSorted(
      (a, b) =>
        (pickNumber(a, ["station"]) ?? 0) - (pickNumber(b, ["station"]) ?? 0),
    )

    const teams = participants.flatMap((participant) => {
      const country = pickString(participant, ["country", "team", "name"])
      if (country === null) return []
      // 国コードで来るので表示名へ寄せる。引けなければコードのまま出す。
      // 落とすと試合から国が消える。
      return [displayName(country, names)]
    })

    const redScore = pickNumber(raw, ["redScore", "red_score"])
    const blueScore = pickNumber(raw, ["blueScore", "blue_score"])
    const playedFlag = isRecord(raw) ? raw["played"] : undefined

    return [
      {
        name,
        teams,
        redScore,
        blueScore,
        // **数で来ることがある。**2026 は `field: 1`。文字列としてだけ読むと
        // 黙って落ちて、どのフィールドか分からなくなる（実際に落ちていた）。
        field: fieldOf(raw),
        scheduledTime: pickString(raw, ["scheduledTime", "startTime"]),
        // played が無い形式でも、両方のスコアが入っていれば消化済みとみなす。
        played:
          typeof playedFlag === "boolean"
            ? playedFlag
            : redScore !== null && blueScore !== null,
      },
    ]
  })
}

export function parseRankings(data: unknown): readonly OfficialRanking[] {
  return pickArray(data, "rankings").flatMap((raw): OfficialRanking[] => {
    // 2025 の実データでは `team` がオブジェクトで、名前とコードを持つ。
    // 文字列で来る形も残す。どちらでも読めないときだけ落とす。
    const teamObject = isRecord(raw) ? raw["team"] : undefined
    const team =
      pickString(teamObject, ["name", "shortName"]) ??
      pickString(raw, ["team", "country", "name", "teamName"])
    if (team === null) return []
    const tidy = tidyName(team)

    // コードは `team` オブジェクトからだけ読む。行の直下の `country` は
    // 旧来の想定では国名が入る場所で、コードと取り違える。
    const code = pickString(teamObject, ["country", "countryCode"])

    return [
      {
        team: tidy,
        code: code === null ? null : code.toUpperCase(),
        rank: pickNumber(raw, ["rank", "ranking", "position"]),
        rankingScore: pickNumber(raw, [
          "rankingScore",
          "ranking_score",
          "score",
          "averageScore",
        ]),
        highestScore: pickNumber(raw, [
          "highestPoints",
          "highest_points",
          "highestScore",
          "highScore",
        ]),
        climbPoints: pickNumber(raw, ["climbPoints", "climb_points", "climb"]),
        played: pickNumber(raw, ["played", "matchesPlayed", "matches"]),
      },
    ]
  })
}

/**
 * 自チームが出る試合だけを、消化前→消化済みの順で返す。
 * 190チームぶんの行から自分を探す作業をなくすための関数。
 */
export function matchesOf(
  matches: readonly OfficialMatch[],
  team: string,
): readonly OfficialMatch[] {
  const mine = matches.filter((match) => match.teams.includes(team))
  const upcoming = mine.filter((match) => !match.played)
  const finished = mine.filter((match) => match.played)
  return [...upcoming, ...finished]
}

/** 6チームのうち前半3つが赤、後半3つが青。並び順が唯一の手がかりになる。 */
export function alliancesOf(match: OfficialMatch): {
  readonly red: readonly string[]
  readonly blue: readonly string[]
} {
  const half = Math.floor(match.teams.length / 2)
  return {
    red: match.teams.slice(0, half),
    blue: match.teams.slice(half),
  }
}
