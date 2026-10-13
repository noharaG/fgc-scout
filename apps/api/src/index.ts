/**
 * Entry point. Assembles the app and declares every route it exposes.
 *
 * 権限の強制はこのファイルの前段ミドルウェア1箇所だけで行う(→ A-30)。
 * 推定の計算はここに置かない。画面側が行う(→ ADR 0004)。
 */

import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { validator } from "hono/validator"

import { requiredRole, satisfies, type Role } from "./access"
import type { AppEnv } from "./env"
import {
  boolField,
  field,
  numberField,
  stringArrayField,
  stringField,
} from "./json"
import { extractData, fetchOfficial } from "./official"
import {
  clearCookieHeader,
  cookieHeader,
  isSecureRequest,
  newSession,
  readSession,
  SESSION_COOKIE,
  signSession,
  verifyPassword,
  type Session,
} from "./session"
import {
  choiceAnswerCount,
  deleteChoice,
  deleteGroup,
  deletePhoto,
  deletePitRecord,
  deleteQuestion,
  disableChoice,
  groupExists,
  groupQuestionCount,
  insertGroup,
  insertPhoto,
  insertPitRecord,
  insertQuestion,
  insertSnapshot,
  latestSnapshot,
  listGroups,
  listPitRecords,
  listQuestions,
  MAX_PHOTO_BYTES,
  nextGroupSortOrder,
  nextPhotoOrder,
  nextSortOrder,
  photoRecordId,
  pruneSnapshots,
  pitRecordExists,
  questionAnswerCount,
  questionMeta,
  readPhoto,
  replacePitAnswers,
  updateGroup,
  updateQuestion,
  upsertChoices,
  upsertScout,
  type PitAnswerInput,
} from "./store"

type Variables = {
  session: Session | null
}

/** Older snapshots only matter for replaying a changed interpretation. */
const SNAPSHOT_KEEP = 50

/** The set the question table's CHECK constraint allows. */
const INPUT_TYPES = new Set(["number", "single", "multi", "text", "photo"])

type ChoiceInput = {
  readonly id: string
  readonly labelJa: string
  readonly enabled: boolean
}

/**
 * 識別子はサーバが決める。管理者に決めさせず、ラベルからも作らない。
 * ラベルから作ると、ラベルを直した瞬間に識別子も変わり、過去の回答が
 * どの選択肢を指していたか読めなくなる(→ 要件定義書 F9-4)。
 */
function newId(prefix: string): string {
  return prefix + crypto.randomUUID().slice(0, 8)
}

/** 回答の入力を絞る。作成と書き直しで同じ形を使う。 */
function answerList(value: unknown): readonly PitAnswerInput[] {
  const raw = field(value, "answers")
  if (!Array.isArray(raw)) return []

  const answers: PitAnswerInput[] = []
  for (const item of raw) {
    const questionId = stringField(item, "questionId")
    if (questionId === null) continue

    const valueNumber = numberField(item, "valueNumber")
    const valueText = stringField(item, "valueText")
    const valueChoices = stringArrayField(item, "valueChoices")

    answers.push({
      questionId,
      ...(valueNumber === undefined ? {} : { valueNumber }),
      ...(valueText === null ? {} : { valueText }),
      ...(valueChoices === undefined ? {} : { valueChoices }),
    })
  }
  return answers
}

/** 選択肢の入力を絞る。id が空のものは新しく足された行として扱う。 */
function choiceList(value: unknown): readonly ChoiceInput[] | undefined {
  const raw = field(value, "choices")
  if (!Array.isArray(raw)) return undefined

  const choices: ChoiceInput[] = []
  for (const item of raw) {
    const labelJa = stringField(item, "labelJa")
    if (labelJa === null) continue
    choices.push({
      id: stringField(item, "id") ?? "",
      labelJa,
      enabled: boolField(item, "enabled") ?? true,
    })
  }
  return choices
}

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>()

/* -------------------------------------------------------------------------
 * The single enforcement point
 * ---------------------------------------------------------------------- */

app.use("/api/*", async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE) ?? ""
  const nowSeconds = Math.floor(Date.now() / 1000)
  const session =
    token === ""
      ? null
      : await readSession(token, c.env.SESSION_SECRET, nowSeconds)
  c.set("session", session)

  const requirement = requiredRole(c.req.method, new URL(c.req.url).pathname)
  // 未知のパスは 404 にする。存在しないパスと権限不足を利用者から
  // 区別できる状態に保つため。
  if (requirement === null) return c.json({ error: "not_found" }, 404)
  if (!satisfies(session === null ? null : session.role, requirement)) {
    return c.json(
      { error: session === null ? "unauthenticated" : "forbidden" },
      session === null ? 401 : 403,
    )
  }
  return await next()
})

/* -------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------- */

const routes = app
  .get("/api/health", (c) => c.json({ ok: true }))

  .post("/api/session", async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const password = stringField(body, "password")
    if (password === null) return c.json({ error: "bad_request" }, 400)

    // 管理者を先に判定する。両者に同じ文字列が設定されていた場合でも
    // 強いほうの権限で入る。
    let role: Role | null = null
    if (await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH)) {
      role = "admin"
    } else if (await verifyPassword(password, c.env.VIEWER_PASSWORD_HASH)) {
      role = "viewer"
    }
    if (role === null) return c.json({ error: "unauthenticated" }, 401)

    const scoutName = stringField(body, "scoutName") ?? ""
    const nowSeconds = Math.floor(Date.now() / 1000)
    const session = newSession(role, scoutName, nowSeconds)
    const token = await signSession(session, c.env.SESSION_SECRET)

    if (scoutName !== "") {
      await upsertScout(c.env.DB, scoutName, scoutName, Date.now())
    }

    c.header("set-cookie", cookieHeader(token, isSecureRequest(c.req.url)))
    return c.json({ role, scoutName })
  })

  // 画面がナビの出し分けに使う。出し分けは表示の都合であって認可ではない。
  // 強制は前段のミドルウェア1箇所で済んでいる。
  .get("/api/session", (c) => {
    const session = c.get("session")
    if (session === null) return c.json({ error: "unauthenticated" }, 401)
    return c.json({ role: session.role, scoutName: session.scoutName })
  })

  .delete("/api/session", (c) => {
    c.header("set-cookie", clearCookieHeader(isSecureRequest(c.req.url)))
    return c.json({ ok: true })
  })

  .get("/api/official", async (c) => {
    const db = c.env.DB
    const now = Date.now()
    const minIntervalMs =
      Number(c.env.OFFICIAL_MIN_INTERVAL_SECONDS) * 1000 || 30_000
    const latest = await latestSnapshot(db)

    // 元データが s-maxage=10 で10秒粒度しか持たないため、これより短い
    // 間隔で叩いても新しい値は返らない(→ ADR 0003)。
    if (latest !== null && now - latest.fetchedAt < minIntervalMs) {
      return c.json({
        data: extractData(latest.raw),
        fetchedAt: latest.fetchedAt,
        stale: false,
      })
    }

    const outcome = await fetchOfficial(
      c.env.OFFICIAL_BASE_URL,
      latest === null ? null : latest.buildId,
    )

    if (!outcome.ok) {
      // 取得に失敗したデータを最新として見せない。最後に成功した時刻を
      // 必ず添える(→ AGENTS.md の Invariants)。
      if (latest === null) {
        return c.json({ error: "unavailable", reason: outcome.reason }, 503)
      }
      return c.json({
        data: extractData(latest.raw),
        fetchedAt: latest.fetchedAt,
        stale: true,
        reason: outcome.reason,
      })
    }

    await insertSnapshot(db, {
      fetchedAt: now,
      source: outcome.source,
      buildId: outcome.buildId,
      raw: outcome.raw,
    })
    await pruneSnapshots(db, SNAPSHOT_KEEP)

    return c.json({
      data: extractData(outcome.raw),
      fetchedAt: now,
      stale: false,
    })
  })

  // グループは項目と必ず一緒に使うので同じ応答で返す。別に取りに行かせると、
  // 画面がどちらも揃うまで待つ状態をもう1つ持つことになる。
  .get("/api/questions", async (c) => {
    const session = c.get("session")
    const includeDisabled = session !== null && session.role === "admin"
    return c.json({
      questions: await listQuestions(c.env.DB, includeDisabled),
      groups: await listGroups(c.env.DB),
    })
  })

  .post(
    "/api/groups",
    validator("json", (value) => ({
      labelJa: stringField(value, "labelJa"),
    })),
    async (c) => {
      const labelJa = c.req.valid("json").labelJa ?? "新しいグループ"
      const key = newId("g_")
      await insertGroup(c.env.DB, {
        key,
        labelJa,
        sortOrder: await nextGroupSortOrder(c.env.DB),
      })
      return c.json({ key })
    },
  )

  .patch(
    "/api/groups/:key",
    validator("json", (value) => {
      const labelJa = stringField(value, "labelJa")
      const sortOrder = numberField(value, "sortOrder")
      return {
        ...(labelJa === null ? {} : { labelJa }),
        ...(sortOrder === undefined ? {} : { sortOrder }),
      }
    }),
    async (c) => {
      const key = c.req.param("key")
      if (!(await groupExists(c.env.DB, key))) {
        return c.json({ error: "not_found" }, 404)
      }
      await updateGroup(c.env.DB, key, c.req.valid("json"))
      return c.json({ ok: true })
    },
  )

  .delete("/api/groups/:key", async (c) => {
    const key = c.req.param("key")
    if (!(await groupExists(c.env.DB, key))) {
      return c.json({ error: "not_found" }, 404)
    }

    // 項目が残っているグループは消さない。消すと、その項目がどこにも属さない
    // ままピット記録の画面から抜け落ちる。文言は画面が持つ。
    const remaining = await groupQuestionCount(c.env.DB, key)
    if (remaining > 0) {
      return c.json({ error: "has_questions", questions: remaining }, 409)
    }

    await deleteGroup(c.env.DB, key)
    return c.json({ ok: true })
  })

  // 入力の絞り込みはスキーマ検証ライブラリを入れず、手書きの型ガードで行う。
  // validator を挟むのは、そうしないとクライアント側で本文の型が推論されず、
  // 型が直結しなくなるため(→ S-33)。
  // 新しい項目は空のまま作り、管理者がその場で埋める。先に名前を尋ねると、
  // 何を聞きたいか決まる前に入力を1つ挟むことになる。
  .post(
    "/api/questions",
    validator("json", (value) => {
      const groupKey = stringField(value, "groupKey")
      const inputType = stringField(value, "inputType")
      return {
        groupKey,
        ...(inputType === null ? {} : { inputType }),
      }
    }),
    async (c) => {
      const body = c.req.valid("json")
      if (body.groupKey === null || body.groupKey === "") {
        return c.json({ error: "bad_request" }, 400)
      }

      const inputType = body.inputType ?? "single"
      if (!INPUT_TYPES.has(inputType)) {
        return c.json({ error: "bad_request" }, 400)
      }

      // 無いグループへ入れさせない。入れると、その項目はどのページにも
      // 出ないまま一覧にだけ残る。
      if (!(await groupExists(c.env.DB, body.groupKey))) {
        return c.json({ error: "bad_request" }, 400)
      }

      const session = c.get("session")
      const id = newId("q_")
      await insertQuestion(
        c.env.DB,
        {
          id,
          groupKey: body.groupKey,
          labelJa: "新しい項目",
          askEn: "",
          inputType,
          sortOrder: await nextSortOrder(c.env.DB, body.groupKey),
        },
        session === null ? "unknown" : session.scoutName,
        Date.now(),
      )

      return c.json({ id })
    },
  )

  .patch(
    "/api/questions/:id",
    validator("json", (value) => {
      // 送られてきた項目だけを拾う。部分更新なので、欠けている項目を
      // undefined として持たせず、キーごと落とす。
      const enabled = boolField(value, "enabled")
      const labelJa = stringField(value, "labelJa")
      const askEn = stringField(value, "askEn")
      const inputType = stringField(value, "inputType")
      const groupKey = stringField(value, "groupKey")
      const sortOrder = numberField(value, "sortOrder")
      const choices = choiceList(value)
      const removeChoiceIds = stringArrayField(value, "removeChoiceIds")
      return {
        ...(removeChoiceIds === undefined ? {} : { removeChoiceIds }),
        ...(enabled === undefined ? {} : { enabled }),
        ...(labelJa === null ? {} : { labelJa }),
        ...(askEn === null ? {} : { askEn }),
        ...(inputType === null ? {} : { inputType }),
        ...(groupKey === null ? {} : { groupKey }),
        ...(sortOrder === undefined ? {} : { sortOrder }),
        ...(choices === undefined ? {} : { choices }),
      }
    }),
    async (c) => {
      const id = c.req.param("id")
      const body = c.req.valid("json")

      const meta = await questionMeta(c.env.DB, id)
      if (meta === undefined) return c.json({ error: "not_found" }, 404)

      if (body.inputType !== undefined && !INPUT_TYPES.has(body.inputType)) {
        return c.json({ error: "bad_request" }, 400)
      }

      if (
        body.groupKey !== undefined &&
        !(await groupExists(c.env.DB, body.groupKey))
      ) {
        return c.json({ error: "bad_request" }, 400)
      }

      // 役割キーを持つ項目は推定式が読む。無効化と入力形式の変更を許すと
      // 推定が黙って壊れる(→ AGENTS.md の Invariants、ADR 0004 の追記)。
      // 文言は画面側が持つので、ここでは何が使っているかだけを返す。
      const changesInputType =
        body.inputType !== undefined && body.inputType !== meta.inputType
      if (
        meta.roleKey !== null &&
        (body.enabled === false || changesInputType)
      ) {
        return c.json({ error: "role_key_locked", roleKey: meta.roleKey }, 409)
      }

      const session = c.get("session")
      const updatedBy = session === null ? "unknown" : session.scoutName
      await updateQuestion(
        c.env.DB,
        id,
        {
          ...(body.labelJa === undefined ? {} : { labelJa: body.labelJa }),
          ...(body.askEn === undefined ? {} : { askEn: body.askEn }),
          ...(body.inputType === undefined
            ? {}
            : { inputType: body.inputType }),
          ...(body.groupKey === undefined ? {} : { groupKey: body.groupKey }),
          ...(body.sortOrder === undefined
            ? {}
            : { sortOrder: body.sortOrder }),
          ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
        },
        updatedBy,
        Date.now(),
      )

      if (body.choices !== undefined) {
        await upsertChoices(
          c.env.DB,
          id,
          body.choices.map((choice) => ({
            id: choice.id === "" ? newId("c_") : choice.id,
            labelJa: choice.labelJa,
            enabled: choice.enabled,
          })),
        )
      }

      // 消すものは画面が明示して送る。配列から消えたものを暗黙に削除すると、
      // 別の端末が同時に足した選択肢を、こちらの古い一覧で消してしまう。
      const removals = await Promise.all(
        (body.removeChoiceIds ?? []).map(async (choiceId) => ({
          choiceId,
          answers: await choiceAnswerCount(c.env.DB, choiceId),
        })),
      )

      // 回答が指している選択肢は消さない。消すと、その選択肢を選んで答えた
      // 記録が何を指していたか読めなくなる(→ 要件定義書 F9-4)。定義は残した
      // まま聞き取りの画面からは外す。
      await Promise.all(
        removals.map(async (removal) =>
          removal.answers > 0
            ? await disableChoice(c.env.DB, removal.choiceId)
            : await deleteChoice(c.env.DB, removal.choiceId),
        ),
      )

      const kept = removals
        .filter((removal) => removal.answers > 0)
        .map((removal) => removal.choiceId)
      if (kept.length > 0) {
        return c.json({ ok: true, keptChoiceIds: kept })
      }

      return c.json({ ok: true })
    },
  )

  // 削除は取り消せないので、回答が付いていないことをサーバ側で確かめてから
  // 消す。画面の出し分けは表示の都合であって強制ではない
  // (→ AGENTS.md の Invariants)。
  .delete("/api/questions/:id", async (c) => {
    const id = c.req.param("id")

    const meta = await questionMeta(c.env.DB, id)
    if (meta === undefined) return c.json({ error: "not_found" }, 404)

    // 役割キーを持つ項目は推定式が読む。消せるようにすると推定が黙って壊れる
    // (→ ADR 0004)。
    if (meta.roleKey !== null) {
      return c.json({ error: "role_key_locked", roleKey: meta.roleKey }, 409)
    }

    const answers = await questionAnswerCount(c.env.DB, id)
    if (answers > 0) {
      // 文言は画面が持つ。サーバは何件の回答が掛かっているかだけを返す。
      return c.json({ error: "has_answers", answers }, 409)
    }

    await deleteQuestion(c.env.DB, id)
    return c.json({ ok: true })
  })

  .get("/api/pit", async (c) => {
    return c.json({ records: await listPitRecords(c.env.DB) })
  })

  .post("/api/pit", async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const team = stringField(body, "team")
    if (team === null || team === "") {
      return c.json({ error: "bad_request" }, 400)
    }

    const session = c.get("session")
    const scoutName =
      session === null || session.scoutName === ""
        ? "unknown"
        : session.scoutName

    const answers = answerList(body)

    const now = Date.now()
    await upsertScout(c.env.DB, scoutName, scoutName, now)
    const id = crypto.randomUUID()
    await insertPitRecord(
      c.env.DB,
      { id, team, scoutId: scoutName, recordedAt: now },
      answers,
    )

    return c.json({ id })
  })

  /**
   * 写真を1枚ずつ足す。本文は画像そのもので、JSON へは包まない。
   * base64 にすると転送が 1.33 倍に膨らむ。会場の Wi-Fi で効く。
   *
   * 縮小は端末側で済ませてある(→ apps/web/src/pit/photo.ts)。ここでは
   * 大きさの上限だけ見る。D1 は1行 2MB までで、越えると保存が失敗する。
   */
  .post("/api/pit/:recordId/photos", async (c) => {
    const recordId = c.req.param("recordId")
    if (!(await pitRecordExists(c.env.DB, recordId))) {
      return c.json({ error: "not_found" }, 404)
    }

    const questionId = c.req.query("questionId") ?? ""
    if (questionId === "") return c.json({ error: "bad_request" }, 400)

    const contentType = c.req.header("content-type") ?? ""
    if (!contentType.startsWith("image/")) {
      return c.json({ error: "bad_request" }, 400)
    }

    const bytes = await c.req.arrayBuffer()
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
      // 文言は画面が持つ。サーバは上限の値だけ返す。
      return c.json(
        { error: "too_large", limit: MAX_PHOTO_BYTES, size: bytes.byteLength },
        413,
      )
    }

    const id = newId("p_")
    await insertPhoto(
      c.env.DB,
      {
        id,
        pitRecordId: recordId,
        questionId,
        sortOrder: await nextPhotoOrder(c.env.DB, recordId, questionId),
        contentType: contentType.split(";")[0] ?? "image/jpeg",
        width: Number(c.req.query("width")) || 0,
        height: Number(c.req.query("height")) || 0,
        bytes,
      },
      Date.now(),
    )

    return c.json({ id })
  })

  /**
   * 記録を書き直す。**誰の記録でも直せる。**代わりに、直した人と時刻を
   * 記録へ押す。
   *
   * 所有で止めていたのをやめた。共有パスワードは1つで、記録者の名前は
   * ログイン時の自己申告でしかない(→ 要件定義書 F1-2)。名前を打ち替えれば
   * 誰にでもなれるので、所有の判定は錠として働かず、正直な人だけを止める。
   * 現場では、間違いに気づく人と書いた人が別なほうが普通。
   *
   * 回答は丸ごと入れ替える。部分更新にすると、答えを消した項目が残る。
   */
  .patch(
    "/api/pit/:recordId",
    // validator を挟むのは、そうしないとクライアント側で本文の型が推論
    // されないため(→ S-33)。
    validator("json", (value) => ({ answers: answerList(value) })),
    async (c) => {
      const recordId = c.req.param("recordId")
      if (!(await pitRecordExists(c.env.DB, recordId))) {
        return c.json({ error: "not_found" }, 404)
      }

      const session = c.get("session")
      const editedBy =
        session === null || session.scoutName === ""
          ? "unknown"
          : session.scoutName

      await replacePitAnswers(
        c.env.DB,
        recordId,
        c.req.valid("json").answers,
        editedBy,
        Date.now(),
      )
      return c.json({ ok: true })
    },
  )

  /**
   * 写真を1枚消す。書き直しの一部なので生徒にも開く(→ access.ts)。
   *
   * **記録ごとに消す経路とは別に置く。**1枚だけ撮り直したいときに記録ごと
   * 消させると、聞き取った答えまで道連れになる。
   *
   * このルートは `DELETE /api/pit/:recordId` より先に置く。後ろに置くと、
   * `photos` が記録の識別子として先に噛む。
   */
  .delete("/api/pit/photos/:photoId", async (c) => {
    const photoId = c.req.param("photoId")
    if ((await photoRecordId(c.env.DB, photoId)) === undefined) {
      return c.json({ error: "not_found" }, 404)
    }
    await deletePhoto(c.env.DB, photoId)
    return c.json({ ok: true })
  })

  /**
   * 記録を1件消す。コーチだけができる（許可表で強制している）。
   *
   * 質問項目と違って、こちらは何が参照しているかを確かめない。記録は
   * それ自体が末端で、消えて困るのは書いた本人だけ。取り消せないので
   * 画面側で1度確かめる。
   */
  .delete("/api/pit/:recordId", async (c) => {
    const recordId = c.req.param("recordId")
    if (!(await pitRecordExists(c.env.DB, recordId))) {
      return c.json({ error: "not_found" }, 404)
    }
    await deletePitRecord(c.env.DB, recordId)
    return c.json({ ok: true })
  })

  /** 1枚を返す。一覧には中身を混ぜない(→ store.ts の listPhotos)。 */
  .get("/api/pit/photos/:photoId", async (c) => {
    const photo = await readPhoto(c.env.DB, c.req.param("photoId"))
    if (photo === null) return c.json({ error: "not_found" }, 404)

    // 写真は差し替わらない。識別子が変われば別の画像なので、長く持たせる。
    return c.body(photo.bytes, 200, {
      "content-type": photo.contentType,
      "cache-control": "private, max-age=31536000, immutable",
    })
  })

export default app

/**
 * The type the web package derives its client from.
 * 実行環境固有の bindings を落として公開する。落とさないと D1Database の
 * 型がブラウザ側の型グラフに入り、DOM の型と衝突する(→ S-33)。
 */
export type AppType =
  typeof routes extends Hono<infer _Bindings, infer Schema, infer BasePath>
    ? Hono<Record<string, never>, Schema, BasePath>
    : never
