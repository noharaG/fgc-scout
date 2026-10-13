/**
 * D1 access. SQL is written directly; there is no ORM (→ ADR 0002).
 */

import type { D1Database } from "@cloudflare/workers-types"

import type { SnapshotSource } from "./official"

export type Snapshot = {
  readonly fetchedAt: number
  readonly source: SnapshotSource
  readonly buildId: string | null
  readonly raw: string
}

export type QuestionRow = {
  readonly id: string
  readonly roleKey: string | null
  readonly groupKey: string
  readonly labelJa: string
  readonly askEn: string
  readonly inputType: string
  readonly sortOrder: number
  readonly enabled: boolean
  readonly choices: readonly ChoiceRow[]
}

// QuestionRow の中でしか使わないので export しない。画面が要素型を名前で
// 参照する必要が出た時点で export へ昇格させる(→ A-07)。
type ChoiceRow = {
  readonly id: string
  readonly labelJa: string
  readonly sortOrder: number
  readonly enabled: boolean
}

/* -------------------------------------------------------------------------
 * Official snapshots
 * ---------------------------------------------------------------------- */

export async function latestSnapshot(db: D1Database): Promise<Snapshot | null> {
  const row = await db
    .prepare(
      `SELECT fetched_at, source, build_id, raw
         FROM official_snapshot
        ORDER BY fetched_at DESC
        LIMIT 1`,
    )
    .first<{
      fetched_at: number
      source: string
      build_id: string | null
      raw: string
    }>()

  if (row === null) return null
  return {
    fetchedAt: row.fetched_at,
    source: row.source === "html" ? "html" : "next-data",
    buildId: row.build_id,
    raw: row.raw,
  }
}

export async function insertSnapshot(
  db: D1Database,
  snapshot: Snapshot,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO official_snapshot (fetched_at, source, build_id, raw)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(snapshot.fetchedAt, snapshot.source, snapshot.buildId, snapshot.raw)
    .run()
}

/**
 * Keeps the newest N snapshots. Older rows are only useful for replaying a
 * changed interpretation, and D1 has a size limit.
 */
export async function pruneSnapshots(
  db: D1Database,
  keep: number,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM official_snapshot
        WHERE id NOT IN (
          SELECT id FROM official_snapshot ORDER BY fetched_at DESC LIMIT ?
        )`,
    )
    .bind(keep)
    .run()
}

/* -------------------------------------------------------------------------
 * Question groups
 * ---------------------------------------------------------------------- */

export type GroupRow = {
  readonly key: string
  readonly labelJa: string
  readonly sortOrder: number
}

export async function listGroups(db: D1Database): Promise<readonly GroupRow[]> {
  const rows = await db
    .prepare(
      `SELECT key, label_ja, sort_order
         FROM question_group
        ORDER BY sort_order`,
    )
    .all<{ key: string; label_ja: string; sort_order: number }>()

  return rows.results.map((row) => ({
    key: row.key,
    labelJa: row.label_ja,
    sortOrder: row.sort_order,
  }))
}

export async function insertGroup(
  db: D1Database,
  group: GroupRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO question_group (key, label_ja, sort_order) VALUES (?, ?, ?)`,
    )
    .bind(group.key, group.labelJa, group.sortOrder)
    .run()
}

export async function updateGroup(
  db: D1Database,
  key: string,
  patch: { readonly labelJa?: string; readonly sortOrder?: number },
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (patch.labelJa !== undefined) {
    sets.push("label_ja = ?")
    values.push(patch.labelJa)
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?")
    values.push(patch.sortOrder)
  }
  if (sets.length === 0) return

  values.push(key)
  await db
    .prepare(`UPDATE question_group SET ${sets.join(", ")} WHERE key = ?`)
    .bind(...values)
    .run()
}

export async function deleteGroup(db: D1Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM question_group WHERE key = ?`).bind(key).run()
}

export async function groupExists(
  db: D1Database,
  key: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS found FROM question_group WHERE key = ?`)
    .bind(key)
    .first<{ found: number }>()
  return row !== null
}

/**
 * 項目が残っているグループは消さない。消すと、その項目がどこにも属さない
 * ままピット記録の画面から抜け落ちる。先に項目を移すか消してもらう。
 */
export async function groupQuestionCount(
  db: D1Database,
  key: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM question WHERE group_key = ?`)
    .bind(key)
    .first<{ n: number }>()
  return row === null ? 0 : row.n
}

/** 末尾へ置くための並び順。項目と同じ 10 刻みで間に挟む余地を残す。 */
export async function nextGroupSortOrder(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT MAX(sort_order) AS last FROM question_group`)
    .first<{ last: number | null }>()
  return (row === null || row.last === null ? 0 : row.last) + 10
}

/* -------------------------------------------------------------------------
 * Questions
 * ---------------------------------------------------------------------- */

export async function listQuestions(
  db: D1Database,
  includeDisabled: boolean,
): Promise<readonly QuestionRow[]> {
  // グループの並びはグループ自身が持つ順で決める。キーの文字順に頼ると、
  // 名前を直しただけでページの順番が入れ替わる。表に無いキーは末尾へ送る。
  const questions = await db
    .prepare(
      `SELECT q.id, q.role_key, q.group_key, q.label_ja, q.ask_en,
              q.input_type, q.sort_order, q.enabled
         FROM question q
         LEFT JOIN question_group g ON g.key = q.group_key
        WHERE (? = 1 OR q.enabled = 1)
        ORDER BY COALESCE(g.sort_order, 2147483647), q.group_key, q.sort_order`,
    )
    .bind(includeDisabled ? 1 : 0)
    .all<{
      id: string
      role_key: string | null
      group_key: string
      label_ja: string
      ask_en: string
      input_type: string
      sort_order: number
      enabled: number
    }>()

  const choices = await db
    .prepare(
      `SELECT id, question_id, label_ja, sort_order, enabled
         FROM question_choice
        WHERE (? = 1 OR enabled = 1)
        ORDER BY question_id, sort_order`,
    )
    .bind(includeDisabled ? 1 : 0)
    .all<{
      id: string
      question_id: string
      label_ja: string
      sort_order: number
      enabled: number
    }>()

  const byQuestion = new Map<string, ChoiceRow[]>()
  for (const choice of choices.results) {
    const list = byQuestion.get(choice.question_id) ?? []
    list.push({
      id: choice.id,
      labelJa: choice.label_ja,
      sortOrder: choice.sort_order,
      enabled: choice.enabled === 1,
    })
    byQuestion.set(choice.question_id, list)
  }

  return questions.results.map((row) => ({
    id: row.id,
    roleKey: row.role_key,
    groupKey: row.group_key,
    labelJa: row.label_ja,
    askEn: row.ask_en,
    inputType: row.input_type,
    sortOrder: row.sort_order,
    enabled: row.enabled === 1,
    choices: byQuestion.get(row.id) ?? [],
  }))
}

/**
 * 役割キーを持つ項目は推定式が読むので、書き換えを拒むためにここで引く。
 * 無効化だけでなく入力形式も守る必要があるので、現在の形式も一緒に返す。
 * `capacity` を自由文に変えられると個数が数値として読めなくなり、抑制
 * ユニットへの貢献の推定が黙って壊れる(→ AGENTS.md の Invariants)。
 *
 * 見つからなければ undefined を返す。呼び出し側が 404 と区別できる状態に
 * 保つため、役割キーの null と混ぜない。
 */
export async function questionMeta(
  db: D1Database,
  questionId: string,
): Promise<
  { readonly roleKey: string | null; readonly inputType: string } | undefined
> {
  const row = await db
    .prepare(`SELECT role_key, input_type FROM question WHERE id = ?`)
    .bind(questionId)
    .first<{ role_key: string | null; input_type: string }>()
  return row === null
    ? undefined
    : { roleKey: row.role_key, inputType: row.input_type }
}

export async function updateQuestion(
  db: D1Database,
  questionId: string,
  patch: {
    readonly labelJa?: string
    readonly askEn?: string
    readonly inputType?: string
    readonly groupKey?: string
    readonly sortOrder?: number
    readonly enabled?: boolean
  },
  updatedBy: string,
  now: number,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (patch.labelJa !== undefined) {
    sets.push("label_ja = ?")
    values.push(patch.labelJa)
  }
  if (patch.askEn !== undefined) {
    sets.push("ask_en = ?")
    values.push(patch.askEn)
  }
  if (patch.inputType !== undefined) {
    sets.push("input_type = ?")
    values.push(patch.inputType)
  }
  if (patch.groupKey !== undefined) {
    sets.push("group_key = ?")
    values.push(patch.groupKey)
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?")
    values.push(patch.sortOrder)
  }
  if (patch.enabled !== undefined) {
    sets.push("enabled = ?")
    values.push(patch.enabled ? 1 : 0)
  }
  if (sets.length === 0) return

  sets.push("updated_at = ?", "updated_by = ?")
  values.push(now, updatedBy, questionId)

  await db
    .prepare(`UPDATE question SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run()
}

/**
 * 新しい項目は役割キーを持たない。推定式が読むのは seed の3つだけで、
 * 後から足した項目に推定が依存することはない(→ ADR 0004)。
 *
 * 無効の状態で作る。大会中に項目を足すと、埋めている途中の空の質問が
 * そのまま生徒のピット記録の画面に並ぶ。書き終えてから有効にする。
 */
export async function insertQuestion(
  db: D1Database,
  question: {
    readonly id: string
    readonly groupKey: string
    readonly labelJa: string
    readonly askEn: string
    readonly inputType: string
    readonly sortOrder: number
  },
  updatedBy: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO question
         (id, role_key, group_key, label_ja, ask_en, input_type,
          sort_order, enabled, updated_at, updated_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      question.id,
      question.groupKey,
      question.labelJa,
      question.askEn,
      question.inputType,
      question.sortOrder,
      now,
      updatedBy,
    )
    .run()
}

/**
 * 末尾へ置くための並び順。seed と同じ 10 刻みで空きを残し、間に1つ挟む
 * 並べ替えが番号の振り直しなしで済むようにする。
 */
export async function nextSortOrder(
  db: D1Database,
  groupKey: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT MAX(sort_order) AS last FROM question WHERE group_key = ?`)
    .bind(groupKey)
    .first<{ last: number | null }>()
  return (row === null || row.last === null ? 0 : row.last) + 10
}

/**
 * 選択肢をまとめて入れ直す。id は呼び出し側が決める。ラベルを識別子として
 * 保存しないため、ラベルを直しても過去の回答は同じ選択肢を指したまま残る
 * (→ 要件定義書 F9-4)。
 *
 * 配列に含まれない既存の選択肢は触らない。消えたものとして無効にすると、
 * 別の管理者が同時に足した選択肢を、こちらの古い一覧で消してしまう。
 */
export async function upsertChoices(
  db: D1Database,
  questionId: string,
  choices: readonly {
    readonly id: string
    readonly labelJa: string
    readonly enabled: boolean
  }[],
): Promise<void> {
  if (choices.length === 0) return

  await db.batch(
    choices.map((choice, index) =>
      db
        .prepare(
          `INSERT INTO question_choice
             (id, question_id, label_ja, sort_order, enabled)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             label_ja   = excluded.label_ja,
             sort_order = excluded.sort_order,
             enabled    = excluded.enabled`,
        )
        .bind(
          choice.id,
          questionId,
          choice.labelJa,
          (index + 1) * 10,
          choice.enabled ? 1 : 0,
        ),
    ),
  )
}

/**
 * 回答が1件でも付いている項目は消さない。定義を消すと、その項目に答えた
 * ピット記録が「値だけあって意味が分からないもの」になる(→ 要件定義書 F9-3)。
 * 大会が始まるまでは回答が無いので、作りかけの項目は自由に消せる。
 */
export async function questionAnswerCount(
  db: D1Database,
  questionId: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM pit_answer WHERE question_id = ?`)
    .bind(questionId)
    .first<{ n: number }>()
  return row === null ? 0 : row.n
}

/** 選択肢も同じ。回答は選択肢の識別子を指しているので、消すと読めなくなる。 */
export async function choiceAnswerCount(
  db: D1Database,
  choiceId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM pit_answer, json_each(pit_answer.value_choices)
        WHERE pit_answer.value_choices IS NOT NULL
          AND json_each.value = ?`,
    )
    .bind(choiceId)
    .first<{ n: number }>()
  return row === null ? 0 : row.n
}

/** 選択肢は question_id の外部キーが ON DELETE CASCADE なので一緒に消える。 */
export async function deleteQuestion(
  db: D1Database,
  questionId: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(`DELETE FROM question_choice WHERE question_id = ?`)
      .bind(questionId),
    db.prepare(`DELETE FROM question WHERE id = ?`).bind(questionId),
  ])
}

export async function deleteChoice(
  db: D1Database,
  choiceId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM question_choice WHERE id = ?`)
    .bind(choiceId)
    .run()
}

/**
 * 消せない選択肢の落としどころ。定義は残したまま聞き取りの画面から外す。
 * 回答が指している選択肢を消すと、その記録が何を指していたか読めなくなる。
 */
export async function disableChoice(
  db: D1Database,
  choiceId: string,
): Promise<void> {
  await db
    .prepare(`UPDATE question_choice SET enabled = 0 WHERE id = ?`)
    .bind(choiceId)
    .run()
}

/* -------------------------------------------------------------------------
 * Pit records
 * ---------------------------------------------------------------------- */

export type PitAnswerInput = {
  readonly questionId: string
  readonly valueNumber?: number
  readonly valueText?: string
  readonly valueChoices?: readonly string[]
}

export async function upsertScout(
  db: D1Database,
  id: string,
  name: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scout (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
    )
    .bind(id, name, now)
    .run()
}

export async function insertPitRecord(
  db: D1Database,
  record: {
    readonly id: string
    readonly team: string
    readonly scoutId: string
    readonly recordedAt: number
  },
  answers: readonly PitAnswerInput[],
): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO pit_record (id, team, scout_id, recorded_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(record.id, record.team, record.scoutId, record.recordedAt),
    ...answers.map((answer) =>
      db
        .prepare(
          `INSERT INTO pit_answer
             (pit_record_id, question_id, value_number, value_text, value_choices)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          answer.questionId,
          answer.valueNumber ?? null,
          answer.valueText ?? null,
          answer.valueChoices === undefined
            ? null
            : JSON.stringify(answer.valueChoices),
        ),
    ),
  ]
  await db.batch(statements)
}

/* -------------------------------------------------------------------------
 * Pit photos
 *
 * 画像の出し入れはこの3関数だけに閉じる。R2 へ移すときに触る場所を
 * ここへ集めておく(→ 0005_pit_photo.sql)。
 * ---------------------------------------------------------------------- */

// PitRecordRow の中でしか使わないので export しない。画面が要素型を名前で
// 参照する必要が出た時点で export へ昇格させる(→ A-07)。
type PhotoMeta = {
  readonly id: string
  readonly questionId: string
  readonly width: number
  readonly height: number
  readonly sizeBytes: number
}

/** D1 の1行は 2MB まで。端末で縮小済みのはずだが、境界はサーバでも見る。 */
export const MAX_PHOTO_BYTES = 1_500_000

export async function insertPhoto(
  db: D1Database,
  photo: {
    readonly id: string
    readonly pitRecordId: string
    readonly questionId: string
    readonly sortOrder: number
    readonly contentType: string
    readonly width: number
    readonly height: number
    readonly bytes: ArrayBuffer
  },
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pit_photo
         (id, pit_record_id, question_id, sort_order, content_type,
          width, height, size_bytes, bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      photo.id,
      photo.pitRecordId,
      photo.questionId,
      photo.sortOrder,
      photo.contentType,
      photo.width,
      photo.height,
      photo.bytes.byteLength,
      photo.bytes,
      now,
    )
    .run()
}

/** 一覧用。**中身は引かない。**混ぜると一覧の転送が枚数ぶん膨らむ。 */
async function listPhotos(
  db: D1Database,
): Promise<ReadonlyMap<string, PhotoMeta[]>> {
  const rows = await db
    .prepare(
      `SELECT id, pit_record_id, question_id, width, height, size_bytes
         FROM pit_photo
        ORDER BY pit_record_id, question_id, sort_order`,
    )
    .all<{
      id: string
      pit_record_id: string
      question_id: string
      width: number
      height: number
      size_bytes: number
    }>()

  const byRecord = new Map<string, PhotoMeta[]>()
  for (const row of rows.results) {
    const list = byRecord.get(row.pit_record_id) ?? []
    list.push({
      id: row.id,
      questionId: row.question_id,
      width: row.width,
      height: row.height,
      sizeBytes: row.size_bytes,
    })
    byRecord.set(row.pit_record_id, list)
  }
  return byRecord
}

/**
 * D1 が BLOB をどの形で返すかは版によって違う。ArrayBuffer のことも、
 * 数値の配列のこともある。**型注釈は実行時を保証しない。**揃えないと
 * 本文が空のまま 200 で返り、画像が壊れる（実際にそうなった）。
 */
function toBytes(raw: unknown): ArrayBuffer {
  if (raw instanceof ArrayBuffer) return raw

  const source = ArrayBuffer.isView(raw)
    ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
    : Array.isArray(raw)
      ? Uint8Array.from(
          raw.filter((item): item is number => typeof item === "number"),
        )
      : new Uint8Array()

  // 新しい ArrayBuffer へ写す。元の buffer をそのまま返すと、切り出し前の
  // 余分な範囲まで本文に載ることがある。
  const out = new ArrayBuffer(source.byteLength)
  new Uint8Array(out).set(source)
  return out
}

export async function readPhoto(
  db: D1Database,
  photoId: string,
): Promise<{
  readonly contentType: string
  readonly bytes: ArrayBuffer
} | null> {
  const row = await db
    .prepare(`SELECT content_type, bytes FROM pit_photo WHERE id = ?`)
    .bind(photoId)
    .first<{ content_type: string; bytes: unknown }>()
  return row === null
    ? null
    : { contentType: row.content_type, bytes: toBytes(row.bytes) }
}

/** 次に足す写真の並び順。同じ記録の同じ項目の中で通し番号にする。 */
export async function nextPhotoOrder(
  db: D1Database,
  pitRecordId: string,
  questionId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(sort_order) AS last
         FROM pit_photo
        WHERE pit_record_id = ? AND question_id = ?`,
    )
    .bind(pitRecordId, questionId)
    .first<{ last: number | null }>()
  return (row === null || row.last === null ? 0 : row.last) + 1
}

/**
 * 記録を1件消す。写真と回答も一緒に落とす。
 *
 * **外部キーの連鎖に頼らない。**D1 で連鎖が効くかは実行の仕方に左右され、
 * 効かなければ写真と回答だけが宙に浮いて残る。消すものを明示する。
 */
export async function deletePitRecord(
  db: D1Database,
  id: string,
): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM pit_photo WHERE pit_record_id = ?`).bind(id),
    db.prepare(`DELETE FROM pit_answer WHERE pit_record_id = ?`).bind(id),
    db.prepare(`DELETE FROM pit_record WHERE id = ?`).bind(id),
  ])
}

/**
 * 回答を入れ替える。消してから入れ直すので、答えを空にした項目は消える。
 * 写真はここでは触らない。写真は別の経路で足し引きする。
 *
 * **直した人と時刻を同じ一括の中で押す。**別々に流すと、回答だけ入れ替わって
 * 書いた人が前のままの記録が残りうる。
 */
export async function replacePitAnswers(
  db: D1Database,
  pitRecordId: string,
  answers: readonly PitAnswerInput[],
  editedBy: string,
  editedAt: number,
): Promise<void> {
  await db.batch([
    db
      .prepare(`DELETE FROM pit_answer WHERE pit_record_id = ?`)
      .bind(pitRecordId),
    ...answers.map((answer) =>
      db
        .prepare(
          `INSERT INTO pit_answer
             (pit_record_id, question_id, value_number, value_text, value_choices)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          pitRecordId,
          answer.questionId,
          answer.valueNumber ?? null,
          answer.valueText ?? null,
          answer.valueChoices === undefined
            ? null
            : JSON.stringify(answer.valueChoices),
        ),
    ),
    db
      .prepare(
        `UPDATE pit_record SET edited_by = ?, edited_at = ? WHERE id = ?`,
      )
      .bind(editedBy, editedAt, pitRecordId),
  ])
}

/**
 * 写真を1枚消す。**どの記録のものかを返す。**呼び出し側が記録の存在と
 * 突き合わせられないと、別の記録の写真を識別子だけで消せてしまう。
 */
export async function photoRecordId(
  db: D1Database,
  photoId: string,
): Promise<string | undefined> {
  const row = await db
    .prepare(`SELECT pit_record_id FROM pit_photo WHERE id = ?`)
    .bind(photoId)
    .first<{ pit_record_id: string }>()
  return row === null ? undefined : row.pit_record_id
}

export async function deletePhoto(
  db: D1Database,
  photoId: string,
): Promise<void> {
  await db.prepare(`DELETE FROM pit_photo WHERE id = ?`).bind(photoId).run()
}

export async function pitRecordExists(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS found FROM pit_record WHERE id = ?`)
    .bind(id)
    .first<{ found: number }>()
  return row !== null
}

export type PitRecordRow = {
  readonly id: string
  readonly team: string
  readonly scoutName: string
  readonly recordedAt: number
  /** 直されていなければ null。書いた人と直した人は同じこともある。 */
  readonly editedBy: string | null
  readonly editedAt: number | null
  readonly answers: readonly {
    readonly questionId: string
    readonly valueNumber: number | null
    readonly valueText: string | null
    readonly valueChoices: readonly string[]
  }[]
  /** 写真は識別子と寸法だけ返す。中身は1枚ずつ別の経路で取る。 */
  readonly photos: readonly PhotoMeta[]
}

export async function listPitRecords(
  db: D1Database,
): Promise<readonly PitRecordRow[]> {
  const records = await db
    .prepare(
      `SELECT r.id, r.team, r.recorded_at, r.edited_by, r.edited_at,
              s.name AS scout_name
         FROM pit_record r
         JOIN scout s ON s.id = r.scout_id
        ORDER BY r.recorded_at DESC`,
    )
    .all<{
      id: string
      team: string
      recorded_at: number
      edited_by: string | null
      edited_at: number | null
      scout_name: string
    }>()

  const answers = await db
    .prepare(
      `SELECT pit_record_id, question_id, value_number, value_text, value_choices
         FROM pit_answer`,
    )
    .all<{
      pit_record_id: string
      question_id: string
      value_number: number | null
      value_text: string | null
      value_choices: string | null
    }>()

  const byRecord = new Map<string, PitRecordRow["answers"][number][]>()
  for (const answer of answers.results) {
    const list = byRecord.get(answer.pit_record_id) ?? []
    let choices: readonly string[] = []
    if (answer.value_choices !== null) {
      try {
        const parsed: unknown = JSON.parse(answer.value_choices)
        if (Array.isArray(parsed)) {
          choices = parsed.filter(
            (value): value is string => typeof value === "string",
          )
        }
      } catch {
        choices = []
      }
    }
    list.push({
      questionId: answer.question_id,
      valueNumber: answer.value_number,
      valueText: answer.value_text,
      valueChoices: choices,
    })
    byRecord.set(answer.pit_record_id, list)
  }

  const photos = await listPhotos(db)

  return records.results.map((row) => ({
    id: row.id,
    team: row.team,
    scoutName: row.scout_name,
    recordedAt: row.recorded_at,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
    answers: byRecord.get(row.id) ?? [],
    photos: photos.get(row.id) ?? [],
  }))
}
