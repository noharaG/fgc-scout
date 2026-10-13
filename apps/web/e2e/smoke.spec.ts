/* oxlint-disable no-await-in-loop --
   ブラウザ操作は順序そのものが検査の内容なので、並列化できない。
   幅を変えてから測る、開いてから測る、という順を崩すと何も確かめられない。
   この免除はこのファイルとこの1規則に限る。 */
import { expect, test, type Page } from "@playwright/test"

/**
 * 画面が実際に立ち上がることだけを確かめる。中身の検証は単体テスト側に置く。
 *
 * サーバは起動済みの前提（`pnpm -C apps/api run dev`）。パスワードは
 * ローカルの .dev.vars に入れた値を環境変数から渡す。
 */

/** パスワードは書き込まない。手元の .dev.vars に入れた値を環境変数で渡す。 */
function requiredEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === "") {
    throw new Error(`${name} を設定してから実行する（→ apps/web/README.md）`)
  }
  return value
}

const VIEWER_PASSWORD = requiredEnv("E2E_VIEWER_PASSWORD")
const ADMIN_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD")

/**
 * 計測・撮影の前にフォントの読み込み完了を待つ。待たないと差し替え前の
 * 字面のまま測ってしまい、機械ごとに結果が揺れる。揺れを許容するために
 * 閾値を緩めることになるので、最初から待つ。
 */
async function ready(page: Page): Promise<void> {
  // **待てなければ諦める。**この関数の目的は字の大きさを揃えることで、
  // 通信が終わったことではない。公式データの取得は外のサイトへ出ていくので、
  // 回線しだいで `networkidle` がいつまでも来ない。待ち切れずに落ちると、
  // 製品の不具合と見分けがつかなくなる（実際に3本が落ちた）。
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => undefined)

  // **フォントの待ちにも期限を置く。**`document.fonts.ready` は読み込み中の
  // フォントが1つでも残っていると解決しない。旗の絵文字は Google から取る
  // ので、回線が詰まると永久に待つ(→ team/flag-font.ts)。画面のほうは
  // `font-display: swap` で字が出ているため、待てなければ進んでよい。
  await page
    .evaluate(async () => {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ])
    })
    .catch(() => undefined)
}

/**
 * 別人として入り直す。
 *
 * **記録者の名前は端末に保存され、2回目からは聞かれない**(→ 要件定義書 F1-2)。
 * 消さずに入り直すと、名前を変えたつもりで同じ人のまま入る。
 */
async function loginAsSomeoneElse(
  page: Page,
  password: string,
  name: string,
): Promise<void> {
  await page.goto("/login")
  await page.evaluate(() => {
    localStorage.clear()
  })
  await login(page, password, name)
}

/**
 * 保存の直後。**訪問リストではなくそのチームの画面へ戻る**ので、そこを待つ
 * (→ pit.$team.tsx)。書いた内容をその場で確かめられるようにするため。
 */
async function afterSave(page: Page): Promise<void> {
  await page.waitForURL(/\/teams\/.+/)
}

async function login(page: Page, password: string, name: string) {
  await page.goto("/login")
  await ready(page)
  await page.locator('input[type="password"]').fill(password)
  const nameField = page.locator('input[type="text"]')
  if ((await nameField.count()) > 0) await nameField.fill(name)
  await page.getByRole("button", { name: "入る" }).click()
  await page.waitForURL("**/")
  await ready(page)
}

test("生徒が入って、ピット記録まで辿り着ける", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")

  await expect(page.getByRole("heading", { name: "次の試合" })).toBeVisible()

  await page.getByRole("link", { name: "ピット記録" }).first().click()
  await ready(page)
  await expect(
    page.getByRole("heading", { name: "これから当たるチーム" }),
  ).toBeVisible()

  await page.getByRole("link", { name: "チーム一覧" }).first().click()
  await ready(page)
  await expect(page.getByRole("heading", { name: "チーム一覧" })).toBeVisible()
})

test("生徒には質問の管理が出ない", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await expect(page.getByRole("link", { name: "質問の管理" })).toHaveCount(0)
})

test("コーチには質問の管理が出て、開ける", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.getByRole("link", { name: "質問の管理" }).first().click()
  await ready(page)
  await expect(page.getByRole("heading", { name: "質問の管理" })).toBeVisible()
  // 推定式が読む項目には札が付く。無効化はサーバが 409 で拒む。
  await expect(page.getByText("推定が使用").first()).toBeVisible()
})

/* -------------------------------------------------------------------------
 * 押されている状態が読めること
 * ---------------------------------------------------------------------- */

function channel(value: number): number {
  const ratio = value / 255
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: readonly number[]): number {
  return (
    0.2126 * channel(rgb[0] ?? 0) +
    0.7152 * channel(rgb[1] ?? 0) +
    0.0722 * channel(rgb[2] ?? 0)
  )
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const light = Math.max(luminance(a), luminance(b))
  const dark = Math.min(luminance(a), luminance(b))
  return (light + 0.05) / (dark + 0.05)
}

/**
 * 背景を自分で塗っている操作要素を集め、文字色との比を測る。
 *
 * 状態で変わる色をユーティリティの足し算で書くと、同じプロパティのどちらが
 * 勝つかが書いた順ではなく生成順で決まる。生成順では `bg-white` と
 * `text-white` が最後に来るため、選択中の指定が全部負けて白地に白文字になり、
 * ラベルが消える。実際にそうなっていた。読めるかどうかは描画後に計算された
 * 色でしか確かめられないので、クラス名ではなく実際の値を測る。
 */
test("選択中の操作は文字が読める", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")

  // 札（span）も測る。**ボタンだけ見ていて、チーム一覧の「未」が白地に
  // 白文字になっているのを見逃した。**地を自分で塗る要素は全部対象にする。
  for (const path of ["/matches", "/teams", "/pit/Japan", "/admin/questions"]) {
    await page.goto(path)
    await ready(page)

    const measured = await page.$$eval("button, span, td", (nodes) =>
      nodes
        .map((node) => {
          const style = getComputedStyle(node)
          const background = (style.backgroundColor.match(/[\d.]+/g) ?? []).map(
            Number,
          )
          const color = (style.color.match(/[\d.]+/g) ?? []).map(Number)
          // 背景を塗っていない要素は親の面の上に載るので、ここでは測らない。
          if (background.length < 3) return null
          if ((background[3] ?? 1) === 0) return null
          return {
            text: (node.textContent ?? "").trim().slice(0, 24),
            pressed: node.getAttribute("aria-pressed"),
            background: background.slice(0, 3),
            color: color.slice(0, 3),
          }
        })
        .filter((found) => found !== null),
    )

    expect(measured.length, `${path} に測れる操作要素がある`).toBeGreaterThan(0)

    for (const item of measured) {
      expect(
        contrast(item.color, item.background),
        `${path} の「${item.text}」(aria-pressed=${String(item.pressed)})`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  }
})

/* -------------------------------------------------------------------------
 * 質問の管理
 * ---------------------------------------------------------------------- */

test("質問の管理はその場で直せて、入力が止まると自動で保存される", async ({
  page,
}) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "拾い方を開く" }).click()
  const label = page.locator('input[aria-label="日本語のラベルを直す"]')
  await expect(label).toBeVisible()

  await label.fill("拾い方（自動保存の確認）")
  await expect(page.getByText("保存しました")).toBeVisible()

  // 画面の表示ではなくサーバに入ったことを確かめる。開き直して残っていれば
  // 送られている。
  await page.reload()
  await ready(page)
  await expect(page.getByText("拾い方（自動保存の確認）")).toBeVisible()

  // 後続のテストに持ち越さないよう戻す。
  await page
    .getByRole("button", { name: "拾い方（自動保存の確認）を開く" })
    .click()
  await page.locator('input[aria-label="日本語のラベルを直す"]').fill("拾い方")
  await expect(page.getByText("保存しました")).toBeVisible()
})

test("保存が走っている最中に打ち続けても文字が混ざらない", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")

  // 保存の往復を遅らせる。ローカルの往復は数ミリ秒で終わるので、そのままでは
  // 「送ってから返事が届くまで」の隙間を踏まない。本番の回線ではここが
  // 数百ミリ秒あり、打ち続けていると必ず踏む。
  await page.route("**/api/questions/**", async (route) => {
    if (route.request().method() === "PATCH") {
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    await route.continue()
  })

  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "拾い方を開く" }).click()
  const field = page.locator('input[aria-label="英語の質問文を直す"]')
  await expect(field).toBeVisible()
  await field.fill("")

  // 実際の打ち方に合わせる。少し打って一息つくと自動保存が走り、その返事が
  // 届く前に続きを打つ。保存のたびに下書きを捨てていると、返事が届くまでの
  // 間だけ欄が確定値（まだ古い）へ戻り、続きの文字が古い値の上に乗って
  // 混ざる。打ちっぱなしでは待ちが伸び続けて保存が走らないので、再現しない。
  const head = "How many balls"
  const tail = " can you carry at once?"
  const typed = head + tail

  await field.pressSequentially(head, { delay: 30 })
  await page.waitForTimeout(700) // 自動保存が走る
  await field.pressSequentially(tail, { delay: 30 }) // まだ返事は届いていない

  await expect(field).toHaveValue(typed)

  // まだ送っていない編集があるので「保存中…」へ戻っている。前の保存の
  // 「保存しました」が残っていると、それを見て画面を閉じた分が消える。
  await expect(page.getByText("保存中…")).toBeVisible()

  await expect(page.getByText("保存しました")).toBeVisible({ timeout: 15_000 })
  await expect(field).toHaveValue(typed)

  // サーバにも打った通りで入っている。
  await page.reload()
  await ready(page)
  await page.getByRole("button", { name: "拾い方を開く" }).click()
  await expect(
    page.locator('input[aria-label="英語の質問文を直す"]'),
  ).toHaveValue(typed)

  // 後続のテストのために元へ戻す。
  await page
    .locator('input[aria-label="英語の質問文を直す"]')
    .fill("How do you pick up the balls?")
  await expect(page.getByText("保存しました")).toBeVisible()
})

test("推定が読む項目は無効にできず、入力形式も変えられない", async ({
  page,
}) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "1回に運べる個数を開く" }).click()
  // できないことは畳まずに出す。理由（どの推定が読んでいるか）だけ畳む。
  await expect(
    page.getByText("無効化・削除・入力形式の変更はできません"),
  ).toBeVisible()
  await expect(page.getByText("クライム乗数の推定が")).toHaveCount(0)
  await page.getByRole("button", { name: "この制限の読み方を開く" }).click()
  await expect(page.getByText("クライム乗数の推定が")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "この項目を無効にする" }),
  ).toBeDisabled()
  await expect(page.getByRole("button", { name: "自由文" })).toBeDisabled()
})

test("足した項目は無効で始まり、書き終えるまで生徒に出ない", async ({
  page,
}) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  // 足した項目はそのまま開くので、開く／閉じるの両方を数える。
  const cards = page.getByRole("button", {
    // 「◯◯の読み方を開く」は注記の「？」で、カードではない。除く。
    name: /(?<!の読み方)を(開く|閉じる)$/,
  })
  const before = await cards.count()
  await page.getByRole("button", { name: "＋ 搬送に項目を足す" }).click()

  await expect(
    page.getByText("この項目はピット記録の画面に出ていません"),
  ).toBeVisible()
  expect(await cards.count()).toBe(before + 1)

  // 生徒の一覧には入らない。空の質問がピットの聞き取りに並ぶと、その場で
  // 何を聞けばよいか分からなくなる。生徒として入り直して確かめる。
  await login(page, VIEWER_PASSWORD, "たなか")
  const asStudent = await page.request.get("/api/questions")
  const listed: unknown = await asStudent.json()

  const labels =
    typeof listed === "object" &&
    listed !== null &&
    "questions" in listed &&
    Array.isArray(listed.questions)
      ? listed.questions.map((question: unknown) =>
          typeof question === "object" &&
          question !== null &&
          "labelJa" in question
            ? String(question.labelJa)
            : "",
        )
      : []

  expect(labels.length, "生徒側の項目が読めている").toBeGreaterThan(0)
  expect(labels, "書きかけの項目が生徒の聞き取りに並んでいる").not.toContain(
    "新しい項目",
  )

  // 足したものは片づける。残すと次のテストが数える対象に混ざる。
  // 前の実行が途中で落ちて溜まっていることがあるので、残っている分も全部消す。
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  const leftovers = page.getByRole("button", { name: "新しい項目を開く" })
  for (let left = await leftovers.count(); left > 0; left -= 1) {
    await leftovers.first().click()
    await page.getByRole("button", { name: "この項目を削除する" }).click()
    await page.getByRole("button", { name: "削除する（戻せません）" }).click()
    await expect(leftovers).toHaveCount(left - 1)
  }
  await expect(page.getByText("新しい項目")).toHaveCount(0)
})

test("回答の付いていない項目は削除できる", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  // 消すための項目をその場で作る。seed の項目を消すと後続のテストが崩れる。
  const cards = page.getByRole("button", {
    // 「◯◯の読み方を開く」は注記の「？」で、カードではない。除く。
    name: /(?<!の読み方)を(開く|閉じる)$/,
  })
  const before = await cards.count()
  await page.getByRole("button", { name: "＋ 搬送に項目を足す" }).click()
  await expect(cards).toHaveCount(before + 1)

  // 名前を付けてから消す。消えたことを名前で確かめられるようにするため。
  await page
    .locator('input[aria-label="日本語のラベルを直す"]')
    .fill("消すための項目")
  await expect(page.getByText("保存しました")).toBeVisible()

  // 1度目は確かめる操作に変わるだけで、まだ消えない。
  await page.getByRole("button", { name: "この項目を削除する" }).click()
  expect(await cards.count()).toBe(before + 1)

  await page.getByRole("button", { name: "削除する（戻せません）" }).click()
  await expect(cards).toHaveCount(before)

  // 画面から消えただけでなく、サーバからも消えている。
  await page.reload()
  await ready(page)
  await expect(page.getByText("消すための項目")).toHaveCount(0)
})

test("推定が読む項目は削除できない", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "1回に運べる個数を開く" }).click()
  await expect(
    page.getByRole("button", { name: "この項目を削除する" }),
  ).toBeDisabled()
})

test("選択肢は削除できる", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "拾い方を開く" }).click()
  const rows = page.locator('input[aria-label$="番目の選択肢を直す"]')
  await expect(rows.first()).toBeVisible()
  const before = await rows.count()

  await page.getByRole("button", { name: "＋ 選択肢を足す" }).click()
  await rows.last().fill("投げ入れる")
  await expect(page.getByText("保存しました")).toBeVisible()

  await page.reload()
  await ready(page)
  await page.getByRole("button", { name: "拾い方を開く" }).click()
  await expect(rows).toHaveCount(before + 1)

  // 足したぶんを消して元に戻す。後続のテストに持ち越さない。
  await page
    .getByRole("button", { name: "選択肢「投げ入れる」を削除する" })
    .click()
  await expect(rows).toHaveCount(before)

  await page.reload()
  await ready(page)
  await page.getByRole("button", { name: "拾い方を開く" }).click()
  await expect(rows).toHaveCount(before)
})

test("グループは足せて、名前を直せて、空なら消せる", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  const headers = page.locator('input[aria-label$="の名前を直す"]')
  const before = await headers.count()

  await page.getByRole("button", { name: "＋ グループを足す" }).click()
  await expect(headers).toHaveCount(before + 1)

  // 名前を直す。キーとラベルは別物なので、名前を変えても中身は動かない。
  const added = page.locator(
    'input[aria-label="グループ「新しいグループ」の名前を直す"]',
  )
  await expect(added).toBeVisible()
  await added.fill("自律")
  await expect(page.getByText("保存しました")).toBeVisible()

  await page.reload()
  await ready(page)
  await expect(
    page.locator('input[aria-label="グループ「自律」の名前を直す"]'),
  ).toBeVisible()

  // 空のグループは消せる。
  await page.getByRole("button", { name: "グループ「自律」を削除する" }).click()
  await expect(headers).toHaveCount(before)

  await page.reload()
  await ready(page)
  await expect(
    page.locator('input[aria-label="グループ「自律」の名前を直す"]'),
  ).toHaveCount(0)
})

test("項目が残っているグループは消せない", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  // seed の「搬送」には項目が入っている。
  await expect(
    page.getByRole("button", { name: "グループ「搬送」を削除する" }),
  ).toBeDisabled()
})

test("項目をグループ間で移せる", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "駆動系を開く" }).click()
  await page.getByRole("button", { name: "クライム", exact: true }).click()

  // 移した先の束に入っている。順番はサーバの並びで取り直す。
  await page.reload()
  await ready(page)
  await page.getByRole("button", { name: "駆動系を開く" }).click()
  await expect(
    page.getByRole("button", { name: "クライム", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")

  // 戻す。
  await page.getByRole("button", { name: "搬送", exact: true }).click()
  await page.reload()
  await ready(page)
  await page.getByRole("button", { name: "駆動系を開く" }).click()
  await expect(
    page.getByRole("button", { name: "搬送", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
})

test("チーム一覧からピット記録の中身を読める", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")

  // 記録を1件作る。項目は管理者が変えるので、ラベルではなく形で操作する。
  await page.goto("/pit/Aruba")
  await ready(page)
  const number = page.locator('input[inputmode="numeric"]').first()
  await expect(number).toBeVisible()
  await number.fill("7")
  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  // チーム一覧の国名から詳細へ入る。
  await page.goto("/teams")
  await ready(page)
  await page.getByRole("link", { name: "Aruba" }).click()
  await expect(page.getByRole("heading", { name: "Aruba" })).toBeVisible()

  // 書いた値が読める。数字の隣に出典が付く。
  // 記録は上書きされず増えるので、走らせた回数だけ同じ値が並ぶ。先頭で見る。
  await expect(page.getByText("7", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("申告").first()).toBeVisible()
  await expect(page.getByText("たなか", { exact: false }).first()).toBeVisible()

  // 記録済みでも入口が残っている。間違えたら聞き直せる。
  await expect(
    page.getByRole("link", { name: "もう一度記録する" }),
  ).toBeVisible()

  await page.goto("/pit")
  await ready(page)
  const row = page.locator("li").filter({ hasText: "Aruba" }).first()
  await expect(row.getByRole("link", { name: "見る" })).toBeVisible()
})

test("写真は端末で縮小してから送られ、チーム詳細で読める", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Fiji")
  await ready(page)

  // 原寸に近い写真を作る。会場では4MB前後の写真が上がってくる。
  const raw = await page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 2400
    canvas.height = 1800
    const context = canvas.getContext("2d")
    if (context === null) throw new Error("canvas")
    context.fillStyle = "#c2410c"
    context.fillRect(0, 0, 2400, 1800)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.95)
    })
    if (blob === null) throw new Error("encode")
    return [...new Uint8Array(await blob.arrayBuffer())]
  })

  await page.setInputFiles('input[type="file"]', {
    name: "robot.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(raw),
  })
  await expect(page.locator("img").first()).toBeVisible()

  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  const listed: unknown = await (await page.request.get("/api/pit")).json()
  const records =
    typeof listed === "object" &&
    listed !== null &&
    "records" in listed &&
    Array.isArray(listed.records)
      ? listed.records
      : []

  const photos = records
    .filter(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "team" in item &&
        item.team === "Fiji",
    )
    .flatMap((item: { photos?: unknown }) =>
      Array.isArray(item.photos) ? item.photos : [],
    )

  const photo: unknown = photos[0]
  if (
    typeof photo !== "object" ||
    photo === null ||
    !("id" in photo) ||
    !("width" in photo) ||
    !("sizeBytes" in photo)
  ) {
    throw new Error("写真が保存されていない")
  }

  // 長辺は 1280 まで落ちている。原寸のままだと D1 の1行 2MB に入らない。
  expect(photo.width).toBe(1280)
  expect(Number(photo.sizeBytes)).toBeLessThan(1_500_000)

  // 中身が返る。空の 200 を返していた不具合があった。
  const fetched = await page.request.get(`/api/pit/photos/${String(photo.id)}`)
  expect(fetched.status()).toBe(200)
  expect(fetched.headers()["content-type"]).toContain("image/")
  expect((await fetched.body()).length).toBe(photo.sizeBytes)

  // チーム詳細で見える。
  await page.goto("/teams/Fiji")
  await ready(page)
  await expect(page.locator("img").first()).toBeVisible()
})

test("写真の項目はどれも複数枚を持てる", async ({ page }) => {
  // 写真の項目を2つにして、それぞれが別々に枚数を持てることを見る。
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  // 前の実行が途中で落ちて残っていることがあるので、先に片づける。
  const leftovers = page.getByRole("button", { name: "2つ目の写真を開く" })
  for (let left = await leftovers.count(); left > 0; left -= 1) {
    await leftovers.first().click()
    await page.getByRole("button", { name: "この項目を削除する" }).click()
    await page.getByRole("button", { name: "削除する（戻せません）" }).click()
    await expect(leftovers).toHaveCount(left - 1)
  }

  await page.getByRole("button", { name: "＋ 搬送に項目を足す" }).click()
  await expect(
    page.getByText("この項目はピット記録の画面に出ていません"),
  ).toBeVisible()
  await page
    .locator('input[aria-label="日本語のラベルを直す"]')
    .fill("2つ目の写真")
  await expect(page.getByText("保存しました")).toBeVisible()
  await page.getByRole("button", { name: "写真", exact: true }).click()
  await page.getByRole("button", { name: "この項目を有効にする" }).click()
  await expect(page.getByText("保存しました")).toBeVisible()

  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Tonga")
  await ready(page)

  // ファイル入力は hidden なので、描画の待ちはボタン側で行う。
  await expect(
    page.getByRole("button", { name: "写真を撮る" }).first(),
  ).toBeVisible()

  // 写真の項目は入力欄を2つ持つ（カメラ用と、アルバムから選ぶ用）。
  // 項目ごとに1つだけ指したいので、capture の無いほうを使う。
  const inputs = page.locator('input[type="file"]:not([capture])')
  expect(await inputs.count()).toBeGreaterThanOrEqual(2)

  const jpeg = async (color: string) =>
    await page.evaluate(async (fill: string) => {
      const canvas = document.createElement("canvas")
      canvas.width = 600
      canvas.height = 400
      const context = canvas.getContext("2d")
      if (context === null) throw new Error("canvas")
      context.fillStyle = fill
      context.fillRect(0, 0, 600, 400)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      })
      if (blob === null) throw new Error("encode")
      return [...new Uint8Array(await blob.arrayBuffer())]
    }, color)

  const file = async (name: string, color: string) => ({
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(await jpeg(color)),
  })

  // 1つ目には2枚、2つ目には1枚。
  await inputs
    .nth(0)
    .setInputFiles([
      await file("a.jpg", "#c2410c"),
      await file("b.jpg", "#15803d"),
    ])
  await expect(page.locator("img")).toHaveCount(2)
  await inputs.nth(1).setInputFiles([await file("c.jpg", "#2563eb")])
  await expect(page.locator("img")).toHaveCount(3)

  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  const listed: unknown = await (await page.request.get("/api/pit")).json()
  const records =
    typeof listed === "object" &&
    listed !== null &&
    "records" in listed &&
    Array.isArray(listed.records)
      ? listed.records
      : []
  // 記録は上書きされず増えるので、いま作った1件だけを見る。前の実行が
  // 残した記録まで数えると、項目の数が合わなくなる。
  const mine = records
    .filter(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "team" in item &&
        item.team === "Tonga",
    )
    .toSorted(
      (a: { recordedAt?: number }, b: { recordedAt?: number }) =>
        (b.recordedAt ?? 0) - (a.recordedAt ?? 0),
    )
  const newest: { photos?: unknown } = mine[0] ?? {}
  const photos = Array.isArray(newest.photos) ? newest.photos : []

  const perQuestion = new Map<string, number>()
  for (const photo of photos) {
    if (typeof photo === "object" && photo !== null && "questionId" in photo) {
      const key = String(photo.questionId)
      perQuestion.set(key, (perQuestion.get(key) ?? 0) + 1)
    }
  }

  // 項目ごとに分かれて保存される。まとめて1つの項目に寄らない。
  expect(perQuestion.size, "2つの項目に分かれていない").toBe(2)
  expect([...perQuestion.values()].toSorted((a, b) => a - b)).toEqual([1, 2])

  // 足した項目は片づける。
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)
  await page.getByRole("button", { name: "2つ目の写真を開く" }).click()
  await page.getByRole("button", { name: "この項目を削除する" }).click()
  await page.getByRole("button", { name: "削除する（戻せません）" }).click()
  await expect(page.getByText("2つ目の写真")).toHaveCount(0)
})

test("iPhone のように EXIF で回された写真が横倒しにならない", async ({
  page,
}) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Oman")
  await ready(page)

  // iPhone は縦で撮っても画素は横向きに保存し、「回して表示せよ」という
  // 指示（EXIF Orientation）を別に持つ。これを無視すると、縦の機体写真が
  // 全部横倒しで保存される。横長の画素に Orientation=6（時計回りに90度）を
  // 付けた、iPhone と同じ形の JPEG を作って確かめる。
  const raw = await page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 800
    canvas.height = 400
    const context = canvas.getContext("2d")
    if (context === null) throw new Error("canvas")
    context.fillStyle = "#c2410c"
    context.fillRect(0, 0, 800, 400)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    })
    if (blob === null) throw new Error("encode")
    const plain = new Uint8Array(await blob.arrayBuffer())

    // SOI の直後へ APP1(EXIF) を差し込む。中身は Orientation=6 だけ。
    const app1 = [
      0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49,
      0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]
    const out = new Uint8Array(plain.length + app1.length)
    out.set(plain.slice(0, 2), 0)
    out.set(app1, 2)
    out.set(plain.slice(2), 2 + app1.length)
    return [...out]
  })

  await page.setInputFiles('input[type="file"]', {
    name: "iphone.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(raw),
  })
  await expect(page.locator("img").first()).toBeVisible()

  // 向きを直していれば、800x400 の画素が 400x800（縦長）になる。
  // 直していないと 800x400 のまま横倒しで保存される。
  const shown = await page
    .locator("img")
    .first()
    .evaluate((node: HTMLImageElement) => ({
      width: node.naturalWidth,
      height: node.naturalHeight,
    }))
  expect(shown.height, "縦長になっていない＝横倒しのまま").toBeGreaterThan(
    shown.width,
  )
})

test("コーチは記録を消せて、生徒は消せない", async ({ page }) => {
  // 消すための記録を作る。
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Malta")
  await ready(page)
  await page.locator('input[inputmode="numeric"]').first().fill("5")
  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  // 生徒の画面には削除の導線が無い。
  await page.goto("/teams/Malta")
  await ready(page)
  await expect(
    page.getByRole("button", { name: /の記録を削除する$/ }),
  ).toHaveCount(0)

  // 導線が無いだけでなく、直接叩いても通らない。強制はサーバ側にある。
  const listed: unknown = await (await page.request.get("/api/pit")).json()
  const records =
    typeof listed === "object" &&
    listed !== null &&
    "records" in listed &&
    Array.isArray(listed.records)
      ? listed.records
      : []
  const target: { id?: unknown } =
    records.find((item: { team?: unknown }) => item.team === "Malta") ?? {}
  const id = String(target.id)

  const refused = await page.request.delete(`/api/pit/${id}`)
  expect(refused.status(), "生徒が消せてしまっている").toBe(403)

  // コーチなら消せる。
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/teams/Malta")
  await ready(page)

  const before = await page.getByText("申告").count()
  await page
    .getByRole("button", { name: /の記録を削除する$/ })
    .first()
    .click()
  await page.getByRole("button", { name: "削除する（戻せません）" }).click()
  await expect(page.getByText("申告")).not.toHaveCount(before)

  // 画面から消えただけでなく、サーバからも消えている。
  const remaining: unknown = await (await page.request.get("/api/pit")).json()
  const ids =
    typeof remaining === "object" &&
    remaining !== null &&
    "records" in remaining &&
    Array.isArray(remaining.records)
      ? remaining.records.map((item: { id?: unknown }) => String(item.id))
      : []
  expect(ids, "消したはずの記録が残っている").not.toContain(id)
})

test("画面の読み方は畳んであり、？を押すと出る", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")

  // 画面ごとに「畳んである文」を1つ選ぶ。開く前に出ていないこと、押すと
  // 出ることの両方を見る。**どの画面にも常設の細かい字を残さない。**
  const screens: readonly (readonly [string, string, string])[] = [
    ["/", "次の試合", "各チームの推定貢献"],
    ["/matches", "試合一覧", "最低スコアの1試合を除いた平均"],
    ["/pit", "これから当たるチーム", "190チームは回れない"],
    ["/teams", "チーム一覧", "公式の順位表に、ピット記録の有無を足したもの"],
    ["/pit/Japan", "ピット記録", "そのチームの画面へ戻り"],
    ["/admin/questions", "質問の管理", "カードを押すとその場で直せる"],
  ]

  for (const [path, title, phrase] of screens) {
    await page.goto(path)

    // **`ready()` を使わない。**この検査は字の大きさを測らないので、
    // フォントの読み込みを待つ必要がない。`networkidle` は公式データの
    // 取得に引きずられて待ち切れないことがある(→ ready の注記)。
    const open = page.getByRole("button", { name: `${title}の読み方を開く` })
    await expect(open).toBeVisible({ timeout: 20_000 })

    // 既定では本題の前に細かい字が入らない。
    await expect(page.getByText(phrase)).toHaveCount(0)

    await open.click()

    await expect(page.getByText(phrase)).toBeVisible()
    await expect(
      page.getByRole("button", { name: `${title}の読み方を閉じる` }),
    ).toBeVisible()
  }
})

/**
 * 「？」の中へ入れてよいのは読み方だけ。**取り損ねた事実は畳まない。**
 * 畳むと、古い内容を最新として見せたまま気づかれない(→ W-04)。
 */
test("公式データを取り直せなかったときは畳まずに出す", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")

  // 取得の失敗を作る。前回の内容を返しつつ stale を立てるのがサーバの約束。
  await page.route("**/api/official", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { rankings: [], matches: [] },
        fetchedAt: Date.now() - 45 * 60_000,
        stale: true,
        reason: "network",
      }),
    })
  })

  for (const path of ["/", "/matches", "/pit", "/teams"]) {
    await page.goto(path)
    await expect(
      page.getByText("公式データを取り直せませんでした"),
      `${path} で取得の失敗が畳まれている`,
    ).toBeVisible({ timeout: 20_000 })
  }
})

test("IOC の3文字コードでも国を探せる", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")

  for (const path of ["/pit", "/teams"]) {
    await page.goto(path)
    await ready(page)

    // 公式データが使うのは ISO3 ではなく IOC コード。Iran は IRI（IRN ではない）。
    // **見えているものだけを数える。**チーム一覧は表とカードの両方を描いて
    // CSS で片方を隠すので、隠れた側にも同じ国名がある(→ teams.index.tsx)。
    const shown = (name: string) =>
      page.getByText(name).filter({ visible: true })
    const box = page.getByRole("searchbox")
    await box.fill("IRI")
    await expect(shown("Islamic Republic of Iran")).toBeVisible()

    // 大文字小文字は問わない。
    await box.fill("kor")
    await expect(shown("Republic of Korea")).toBeVisible()

    // 名前でも引ける。
    await box.fill("Albania")
    await expect(shown("Albania")).toBeVisible()
  }
})

test("記録は誰でも直せて、直した人が残る", async ({ page }) => {
  // 前の実行が途中で落ちて残っていることがある。コーチで先に片づける。
  await login(page, ADMIN_PASSWORD, "こばやし")
  const before: unknown = await (await page.request.get("/api/pit")).json()
  const stale =
    typeof before === "object" &&
    before !== null &&
    "records" in before &&
    Array.isArray(before.records)
      ? before.records.filter(
          (item: { team?: unknown }) => item.team === "Nepal",
        )
      : []
  for (const item of stale) {
    const old: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(old.id)}`)
  }

  // **名前は端末に残り、2回目からは聞かれない**(→ 要件定義書 F1-2)。
  // 片づけをコーチで行った直後なので、消さずに入ると「こばやし」のまま
  // 記録してしまう。誰が書いたかを見るテストなので、ここは消して入り直す。
  await loginAsSomeoneElse(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Nepal")
  await ready(page)
  await page.locator('input[inputmode="numeric"]').first().fill("4")
  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  // 自分の記録には「直す」が出て、前の答えが入った状態で開く。
  await page.goto("/teams/Nepal")
  await ready(page)
  await page.getByRole("link", { name: "直す" }).first().click()
  await page.waitForURL(/record=/)
  const field = page.locator('input[inputmode="numeric"]').first()
  await expect(field).toHaveValue("4")

  await field.fill("9")
  await page.getByRole("button", { name: "書き直しを保存する" }).click()
  await afterSave(page)

  // 書き直しは記録を増やさない。増えると、どれが正しいか読めなくなる。
  const listed: unknown = await (await page.request.get("/api/pit")).json()
  const records =
    typeof listed === "object" &&
    listed !== null &&
    "records" in listed &&
    Array.isArray(listed.records)
      ? listed.records
      : []
  const nepal = records.filter(
    (item: { team?: unknown }) => item.team === "Nepal",
  )
  expect(nepal.length).toBe(1)

  const only: { id?: unknown } = nepal[0] ?? {}
  const id = String(only.id)

  // 別人として入っても直せる。共有パスワード1つで名前は自己申告なので、
  // 所有で止めても正直な人しか止まらない。錠の代わりに履歴を残す。
  await loginAsSomeoneElse(page, VIEWER_PASSWORD, "べつのひと")
  await page.goto("/teams/Nepal")
  await ready(page)

  // 他人の記録だと分かる状態で開く。知らずに直すと、書いた本人には理由の
  // 分からない書き換えとして届く。
  await page.getByRole("link", { name: "直す" }).first().click()
  await page.waitForURL(/record=/)
  await expect(page.getByText(/たなか.*が書いた記録です/)).toBeVisible()

  await page.locator('input[inputmode="numeric"]').first().fill("7")
  await page.getByRole("button", { name: "書き直しを保存する" }).click()
  await afterSave(page)

  // 直した人が記録に残り、画面にも出る。
  const afterEdit: unknown = await (await page.request.get("/api/pit")).json()
  const edited =
    typeof afterEdit === "object" &&
    afterEdit !== null &&
    "records" in afterEdit &&
    Array.isArray(afterEdit.records)
      ? afterEdit.records.find(
          (item: { id?: unknown; scoutName?: unknown; editedBy?: unknown }) =>
            String(item.id) === id,
        )
      : undefined
  expect(edited?.scoutName, "書いた人が書き換わっている").toBe("たなか")
  expect(edited?.editedBy, "直した人が残っていない").toBe("べつのひと")

  await page.goto("/teams/Nepal")
  await ready(page)
  await expect(page.getByText("べつのひと が")).toBeVisible()

  // 後始末はコーチが行う。
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.request.delete(`/api/pit/${id}`)
})

test("保存済みの写真は1枚ずつ消せる", async ({ page }) => {
  // 前の実行の残りを片づける。
  await login(page, ADMIN_PASSWORD, "こばやし")
  const before: unknown = await (await page.request.get("/api/pit")).json()
  const stale =
    typeof before === "object" &&
    before !== null &&
    "records" in before &&
    Array.isArray(before.records)
      ? before.records.filter(
          (item: { team?: unknown }) => item.team === "Tonga",
        )
      : []
  for (const item of stale) {
    const old: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(old.id)}`)
  }

  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Tonga")
  await ready(page)

  // 2枚入れて保存する。1枚だけ消えることを見たいので2枚要る。
  const jpeg = async (color: string) =>
    await page.evaluate(async (fill: string) => {
      const canvas = document.createElement("canvas")
      canvas.width = 600
      canvas.height = 400
      const context = canvas.getContext("2d")
      if (context === null) throw new Error("canvas")
      context.fillStyle = fill
      context.fillRect(0, 0, 600, 400)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      })
      if (blob === null) throw new Error("encode")
      return [...new Uint8Array(await blob.arrayBuffer())]
    }, color)

  const file = async (name: string, color: string) => ({
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(await jpeg(color)),
  })

  await page
    .locator('input[type="file"]:not([capture])')
    .first()
    .setInputFiles([
      await file("a.jpg", "#c2410c"),
      await file("b.jpg", "#15803d"),
    ])
  await expect(page.locator("img")).toHaveCount(2)

  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  const saved: unknown = await (await page.request.get("/api/pit")).json()
  const record =
    typeof saved === "object" &&
    saved !== null &&
    "records" in saved &&
    Array.isArray(saved.records)
      ? saved.records.find(
          (item: { team?: unknown; id?: unknown; photos?: unknown[] }) =>
            item.team === "Tonga",
        )
      : undefined
  expect(record?.photos?.length, "写真が2枚保存されていない").toBe(2)

  // 書き直しで開くと、保存済みの写真が出る。
  await page.goto(`/pit/Tonga?record=${String(record?.id)}`)
  await ready(page)
  const tiles = page.getByAltText("保存済みの機体写真")
  await expect(tiles).toHaveCount(2)

  // 消すのは2段。取り消せないので確定までに1段挟む(→ Y-15)。
  await page.getByRole("button", { name: "この写真を消す" }).first().click()
  await page.getByRole("button", { name: "消す", exact: true }).click()
  await expect(tiles).toHaveCount(1)

  // 画面だけでなく保存先からも消えている。
  const after: unknown = await (await page.request.get("/api/pit")).json()
  const left =
    typeof after === "object" &&
    after !== null &&
    "records" in after &&
    Array.isArray(after.records)
      ? after.records.find(
          (item: { team?: unknown; photos?: unknown[] }) =>
            item.team === "Tonga",
        )
      : undefined
  expect(left?.photos?.length, "保存先から消えていない").toBe(1)

  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.request.delete(`/api/pit/${String(record?.id)}`)
})

test("選択肢を並べ替えられる", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  await page.getByRole("button", { name: "拾い方を開く" }).click()
  const rows = page.locator('input[aria-label$="番目の選択肢を直す"]')
  await expect(rows.first()).toBeVisible()

  const first = await rows.nth(0).inputValue()
  const second = await rows.nth(1).inputValue()

  await page
    .getByRole("button", { name: `選択肢「${second}」を上へ移す` })
    .click()

  // 並びはそのまま聞き取りの画面へ出るので、サーバに入っていないと意味がない。
  await page.reload()
  await ready(page)
  await page.getByRole("button", { name: "拾い方を開く" }).click()
  await expect(rows.nth(0)).toHaveValue(second)
  await expect(rows.nth(1)).toHaveValue(first)

  // 戻す。
  await page
    .getByRole("button", { name: `選択肢「${first}」を上へ移す` })
    .click()
  await expect(rows.nth(0)).toHaveValue(first)
})

test("数の欄に単位を出さない", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Japan")
  await ready(page)

  // 個数とは限らず、秒やセンチのこともある。単位は項目名の側で言う。
  await expect(page.getByText("個", { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /増やす/ }).first(),
  ).toBeVisible()
})

/**
 * 公式データが載っている前提の検査。**載っていなければ飛ばす。**
 * 大会前は順位も試合も空で、確かめる対象そのものが無い。
 */
async function hasOfficialData(page: Page): Promise<boolean> {
  const body: unknown = await (await page.request.get("/api/official")).json()
  const data =
    typeof body === "object" && body !== null && "data" in body
      ? body.data
      : undefined
  const rankings =
    typeof data === "object" && data !== null && "rankings" in data
      ? data.rankings
      : undefined
  return Array.isArray(rankings) && rankings.length > 0
}

test("チーム一覧はボタンで並べ替えられる。既定は順位", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/teams")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  // **スマホ幅では表ではなくカード。**7列は 390px の画面に入らないので、
  // 1行ぶんを名前に使う形へ変えた。表は広い画面のために描いてあるが、
  // ここでは隠れている(→ teams.index.tsx、globals.css の 6)。
  await expect(page.locator("table")).toBeHidden()

  // **RS の軸は置かない。**順位は RS の順そのものなので、押しても順位と
  // 同じ並びにしかならない。数字はカードに出したままにしてある。
  await expect(
    page.getByRole("button", { name: /^RSで並べ替える/ }),
  ).toHaveCount(0)
  await expect(page.getByText(/RS .* · 最高 /).first()).toBeVisible()

  // **記録の有無は並べ替えではなく絞り込み。**2値しかないので、並べ替えても
  // 塊が2つできるだけで、探すにはスクロールが要る。
  await expect(
    page.getByRole("button", { name: /^ピットで並べ替える/ }),
  ).toHaveCount(0)

  // 順位はカードの先頭に出る。既定は昇順で、会場で最初に見るのがこれ。
  const shownRanks = await page.evaluate(() =>
    [...document.querySelectorAll("ul > li")]
      .map((row) => Number(row.firstElementChild?.textContent?.trim()))
      .filter((value) => !Number.isNaN(value)),
  )
  expect(shownRanks.length).toBeGreaterThan(0)
  expect(shownRanks).toStrictEqual([...shownRanks].toSorted((a, b) => a - b))

  // 国旗（地域表示記号）を落としてから比べる。並べ替えは名前で行うので、
  // 飾りを含んだまま比べると別の順序を見ることになる。
  const names = async () =>
    await page.evaluate(() =>
      [...document.querySelectorAll("ul > li a[href^='/teams/']")].map((link) =>
        (link.firstElementChild?.textContent ?? "")
          .replaceAll(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
          .trim(),
      ),
    )

  // 押すと軸が変わる。もう一度押すと向きが変わる。
  await page.getByRole("button", { name: /^チーム名で並べ替える/ }).click()
  const up = await names()
  expect(up.length).toBeGreaterThan(0)
  expect(up).toStrictEqual([...up].toSorted((a, b) => a.localeCompare(b)))

  await page.getByRole("button", { name: /^チーム名で並べ替える/ }).click()
  const down = await names()
  expect(down[0]).not.toBe(up[0])

  // いまどの軸でどちら向きかを、押されている状態と名前の両方で示す。
  const active = page.getByRole("button", { name: /^チーム名で並べ替える/ })
  await expect(active).toHaveAttribute("aria-pressed", "true")
  await expect(active).toHaveAccessibleName("チーム名で並べ替える（降順）")
})

test("並べ替えは覚えていて、画面を移って戻しても元へ戻らない", async ({
  page,
}) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/teams")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  const firstTeam = async () =>
    await page.evaluate(
      () =>
        document.querySelector("ul > li a[href^='/teams/']")?.textContent ?? "",
    )

  const byRank = await firstTeam()
  await page.getByRole("button", { name: /^最高で並べ替える/ }).click()
  const byBest = await firstTeam()
  expect(byBest).not.toBe(byRank)

  // **別の画面を経由しても戻さない。**会場では同じ並びで見続けたいことが
  // あり、そのたびに押し直すのは作業の邪魔になる。
  await page.goto("/pit")
  await ready(page)
  await page.goto("/teams")
  await ready(page)
  expect(await firstTeam()).toBe(byBest)

  // 読み込み直しでも残る。
  await page.reload()
  await ready(page)
  expect(await firstTeam()).toBe(byBest)
  await expect(
    page.getByRole("button", { name: "最高で並べ替える（降順）" }),
  ).toHaveAttribute("aria-pressed", "true")

  // 次のテストへ持ち越さない。
  await page.evaluate(() => {
    localStorage.removeItem("fgc_teams_sort")
  })
})

test("保存するとそのチームの画面へ戻り、書いた内容が読める", async ({
  page,
}) => {
  // 前の実行の残りを片づける。
  await login(page, ADMIN_PASSWORD, "こばやし")
  const before: unknown = await (await page.request.get("/api/pit")).json()
  const stale =
    typeof before === "object" &&
    before !== null &&
    "records" in before &&
    Array.isArray(before.records)
      ? before.records.filter(
          (item: { team?: unknown }) => item.team === "Tuvalu",
        )
      : []
  for (const item of stale) {
    const old: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(old.id)}`)
  }

  await loginAsSomeoneElse(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Tuvalu")
  await ready(page)
  await page.locator('input[inputmode="numeric"]').first().fill("7")
  await page.getByRole("button", { name: "保存する" }).click()

  // **訪問リストではなくチームの画面。**打ち間違いや入れ忘れに、その場で
  // 気づけるようにするため。
  await page.waitForURL("**/teams/Tuvalu")
  await expect(page.getByRole("heading", { name: "Tuvalu" })).toBeVisible()

  // いま書いた内容がそこに出ている。
  await expect(page.getByText("たなか")).toBeVisible()
  await expect(page.getByText("7", { exact: true }).first()).toBeVisible()
  // 間違えたときの直し口も同じ画面にある。
  await expect(page.getByRole("link", { name: "直す" }).first()).toBeVisible()

  await login(page, ADMIN_PASSWORD, "こばやし")
  const after: unknown = await (await page.request.get("/api/pit")).json()
  const mine =
    typeof after === "object" &&
    after !== null &&
    "records" in after &&
    Array.isArray(after.records)
      ? after.records.filter(
          (item: { team?: unknown }) => item.team === "Tuvalu",
        )
      : []
  for (const item of mine) {
    const row: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(row.id)}`)
  }
})

test("検索も覚えている。開いて戻っても打ち直さなくてよい", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")

  // チーム一覧と訪問リストの両方。**同じ検索欄なので同じ振る舞いにする。**
  for (const [path, label, team] of [
    ["/teams", "国名か3文字コードで探す（例 JPN）", "Japan"],
    ["/pit", "国名か3文字コードで探す（例 JPN）", "Albania"],
  ] as const) {
    await page.goto(path)
    await ready(page)

    const box = page.getByPlaceholder(label)
    await box.fill(team)
    await page.waitForTimeout(300)

    // 1チーム開いて戻る、という使い方をする。
    await page.goto("/teams/Japan")
    await ready(page)
    await page.goto(path)
    await ready(page)
    await expect(box, `${path} の検索が消えている`).toHaveValue(team)

    // 空にしたら覚えない。次に開いたときは素の一覧から始まる。
    await box.fill("")
    await page.goto(path)
    await ready(page)
    await expect(box).toHaveValue("")
  }
})

test("記録の有無で絞り込める", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/teams")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  const rows = page.locator("ul > li")
  const filter = page.getByRole("group", { name: "記録の有無で絞る" })

  const all = await rows.count()
  expect(all).toBeGreaterThan(0)

  // 現地（10/6 以降に新しく取った記録あり）・事前のみ・未記録の3つに分ける。
  const counts: number[] = []
  for (const label of ["現地", "事前のみ", "未記録"]) {
    await filter.getByRole("button", { name: label, exact: true }).click()
    counts.push(await rows.count())
  }

  // 絞った3つを足すと全部になる。取りこぼしも重複もない。
  expect(
    counts.reduce((sum, count) => sum + count, 0),
    "絞り込みが全体と合わない",
  ).toBe(all)

  // 「未記録」に絞ったら、現地と事前の札は1つも無い。
  await expect(rows.getByText("現地", { exact: true })).toHaveCount(0)
  await expect(rows.getByText("事前", { exact: true })).toHaveCount(0)

  // **絞り込みも覚えている。**記録を埋めている最中は「未記録」で見続ける
  // ことになり、チームを開いて戻るたびに押し直すのは作業の邪魔になる。
  await page.goto("/teams/Japan")
  await ready(page)
  await page.goto("/teams")
  await ready(page)
  await expect(
    filter.getByRole("button", { name: "未記録", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(rows).toHaveCount(counts[2] ?? -1)

  await filter.getByRole("button", { name: "すべて" }).click()
  await expect(rows).toHaveCount(all)

  // 次のテストへ持ち越さない。
  await page.evaluate(() => {
    localStorage.removeItem("fgc_teams_filter")
  })
})

test("公式に載っていない参加国もチーム一覧に出る", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/teams")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  // **2026から出る国は去年の順位表に居ない。**そのままだと公式データが
  // 載った時点で一覧から消え、ピット記録を始められなかった。
  const box = page.getByPlaceholder("国名か3文字コードで探す（例 JPN）")
  for (const team of ["Belgium", "Thailand", "Nigeria"]) {
    await box.fill(team)
    await expect(
      page.getByRole("link", { name: new RegExp(team) }).first(),
      `${team} が一覧に出ていない`,
    ).toBeVisible()
  }

  // **出場していない参加国は数字が空のまま。**0 で埋めない(→ W-01)。
  // Burundi と Kosovo は参加国マップに居るが、試合にも順位表にも出ていない。
  await box.fill("Burundi")
  const absent = page.locator("ul > li").first()
  await expect(absent).toContainText("Burundi")
  await expect(absent).toContainText("RS — · 最高 —")

  // そこから記録へ入れる。公式に無くても聞き取りは始められる。
  await page
    .getByRole("link", { name: /Burundi/ })
    .first()
    .click()
  await page.waitForURL("**/teams/Burundi")
  await expect(
    page.getByRole("link", { name: "このチームを記録する" }),
  ).toBeVisible()
})

test("チーム一覧はスマホ幅でも数字が隠れない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/teams")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  // **横に振らないと読めない状態を作らない。**表だったころは 390px で
  // 順位しか見えず、RS から右の5列が枠の外にあった。
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll("ul > li")].some(
      (row) => row.scrollWidth > row.clientWidth,
    ),
  )
  expect(clipped, "カードの中身が横にはみ出している").toBe(false)

  // 数字はその場に出ている。
  await expect(page.getByText(/RS .* · 最高 /).first()).toBeVisible()
})

test("広い画面では表になり、開かずに最新の記録の中身と現地の札が読める", async ({
  page,
}) => {
  // 前の実行の残りを片づける。
  await login(page, ADMIN_PASSWORD, "こばやし")
  const removeKiribati = async () => {
    const body: unknown = await (await page.request.get("/api/pit")).json()
    const stale =
      typeof body === "object" &&
      body !== null &&
      "records" in body &&
      Array.isArray(body.records)
        ? body.records.filter(
            (item: { team?: unknown }) => item.team === "Kiribati",
          )
        : []
    for (const item of stale) {
      const row: { id?: unknown } = item
      await page.request.delete(`/api/pit/${String(row.id)}`)
    }
  }
  await removeKiribati()

  // 10/6 以降に新しく取った記録は「現地」になる(→ pit/summary.ts)。
  await page.goto("/pit/Kiribati")
  await ready(page)
  await page.locator('input[inputmode="numeric"]').first().fill("7")
  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  // スマホの横向きと PC の両方で表になる。縦向きはカードのまま(→ 上のテスト)。
  for (const width of [844, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/teams")
    await ready(page)
    await expect(page.locator("table"), `${String(width)}px`).toBeVisible()
    await expect(page.locator("ul.teams-cards")).toBeHidden()

    // 出典は列の束ごとに札で示す。公式とピットの申告を混ぜない。
    await expect(
      page.getByRole("columnheader", { name: "公式", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: /^申告/ }),
    ).toBeVisible()

    // 開かずに、その行で記録の札と聞いた中身が読める。
    await page.getByRole("searchbox").fill("Kiribati")
    const row = page.getByRole("row", { name: /Kiribati/ })
    await expect(row).toBeVisible()
    await expect(row.getByText("現地", { exact: true })).toBeVisible()
    await expect(row.getByText("7", { exact: true })).toBeVisible()
  }

  // 次のテストへ持ち越さない。検索は空にすると覚えない。
  await page.getByRole("searchbox").fill("")
  await removeKiribati()
})

test("次の試合は国ごとの順位を出し、押すと記録へ行ける", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  // 名前だけでは相手の強さが分からない。公式の数字を添える。
  await expect(page.getByText(/平均 RS/).first()).toBeVisible()
  await expect(page.getByText(/\d+位 · RS/).first()).toBeVisible()

  // 国を押すとそのチームの記録へ入る。
  const team = page.locator("a[href^='/teams/']").first()
  const href = await team.getAttribute("href")
  await team.click()
  await page.waitForURL(`**${href ?? ""}`)
  await expect(
    page.getByRole("heading", { name: "ピットで聞いたこと" }),
  ).toBeVisible()
})

test("訪問リストは当たる相手・予定なし・済みの3段に分かれる", async ({
  page,
}) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  // **当たらない相手も回れるようにする。**プレーオフで組む先が要る。
  const sections = page.locator("section > h2")
  const labels = await sections.allInnerTexts()
  expect(labels.some((label) => label.startsWith("これから当たる"))).toBe(true)
  expect(labels.some((label) => label.startsWith("当たる予定はない"))).toBe(
    true,
  )

  // 段の順は「当たる → 予定なし → 済んだ」。急ぐものが上。
  const order = labels.map((label) => label.replace(/[0-9]/gu, "").trim())
  expect(order.indexOf("これから当たる")).toBeLessThan(
    order.indexOf("当たる予定はない"),
  )
})

test("試合を押すと試合詳細へ行き、そこから国の記録へ入れる", async ({
  page,
}) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/matches")
  await ready(page)
  test.skip(!(await hasOfficialData(page)), "公式データがまだ載っていない")

  // カードごと入口にする。試合名の文字幅だけを的にしない(→ Y-13)。
  const card = page.locator("li a[href^='/matches/']").first()
  await expect(card).toBeVisible()
  await card.click()
  await page.waitForURL(/\/matches\/.+/)

  // 6チームが順位つきで並ぶ。名前だけでは強さが分からない。
  await expect(page.getByText(/平均 RS/).first()).toBeVisible()
  const rows = page.locator("a[href^='/teams/']")
  expect(await rows.count()).toBeGreaterThanOrEqual(6)

  // 国を押すとそのチームの記録へ入る。
  const href = await rows.first().getAttribute("href")
  await rows.first().click()
  await page.waitForURL(`**${href ?? ""}`)
  await expect(
    page.getByRole("heading", { name: "ピットで聞いたこと" }),
  ).toBeVisible()
})

test("知らない試合名を開くと、黙って戻さずそう言う", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/matches/Ranking%20Match%209999")
  await ready(page)
  await expect(page.getByText("この試合は公式データにありません")).toBeVisible()
})

/**
 * 旗が出ない環境（Windows など）でだけ絵文字フォントを足す。
 * **描ける端末では1バイトも読まない。**生徒のスマホは自前で旗を持っている
 * ので、常時読み込みにすると 709KB をただ払う(→ team/flag-font.ts)。
 */
test("旗が出ない環境でだけ絵文字フォントを足す", async ({ page }) => {
  const asked: string[] = []
  page.on("request", (request) => {
    const url = request.url()
    if (url.includes("notocoloremoji") || url.includes("Noto+Color+Emoji")) {
      asked.push(url)
    }
  })

  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/teams")
  await ready(page)

  // この環境の Chromium で旗が合字になるかを実際に測り、実装の判定と
  // 同じ答えになることを見る。
  const native = await page.evaluate(() => {
    const context = document.createElement("canvas").getContext("2d")
    if (context === null) return true
    context.font = "32px sans-serif"
    const pair = context.measureText("\u{1F1EF}\u{1F1F5}").width
    const apart =
      context.measureText("\u{1F1EF}").width +
      context.measureText("\u{1F1F5}").width
    return pair < apart - 1
  })

  const link = page.locator('link[href*="Noto+Color+Emoji"]')
  if (native) {
    // 描ける環境。読み込みも、読み込みの指示も置かない。
    await expect(link).toHaveCount(0)
    expect(asked, "描けるのにフォントを取りに行っている").toStrictEqual([])
  } else {
    // 描けない環境。旗だけの subset を1本足す。
    await expect(link).toHaveCount(1)
    expect(asked.length, "フォントを取りに行っていない").toBeGreaterThan(0)
  }

  // どちらの環境でも国名は読める。旗は飾りで、読み上げからも外してある。
  // 見えているほうだけを見る。一覧は表とカードを両方描き、幅で片方を隠す。
  await expect(
    page.getByText("Japan").filter({ visible: true }).first(),
  ).toBeVisible()
})

/**
 * 写真はアプリの中で開く。**別のタブへ飛ばさない。**
 * 横に送れるのはそのチームの写真だけで、端で止まる。隣の国へは続かない。
 */
test("写真はその場で開き、そのチームの中だけを送れる", async ({ page }) => {
  // 前の実行の残りを片づける。枚数を数えるので他の記録が混ざると読めない。
  await login(page, ADMIN_PASSWORD, "こばやし")
  const before: unknown = await (await page.request.get("/api/pit")).json()
  const stale =
    typeof before === "object" &&
    before !== null &&
    "records" in before &&
    Array.isArray(before.records)
      ? before.records.filter(
          (item: { team?: unknown }) => item.team === "Palau",
        )
      : []
  for (const item of stale) {
    const old: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(old.id)}`)
  }

  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Palau")
  await ready(page)

  const jpeg = async (color: string) =>
    await page.evaluate(async (fill: string) => {
      const canvas = document.createElement("canvas")
      canvas.width = 600
      canvas.height = 400
      const context = canvas.getContext("2d")
      if (context === null) throw new Error("canvas")
      context.fillStyle = fill
      context.fillRect(0, 0, 600, 400)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      })
      if (blob === null) throw new Error("encode")
      return [...new Uint8Array(await blob.arrayBuffer())]
    }, color)

  const file = async (name: string, color: string) => ({
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(await jpeg(color)),
  })

  await page
    .locator('input[type="file"]:not([capture])')
    .first()
    .setInputFiles([
      await file("a.jpg", "#c2410c"),
      await file("b.jpg", "#15803d"),
    ])
  await expect(page.locator("img")).toHaveCount(2)
  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  await page.goto("/teams/Palau")
  await ready(page)

  // 別のタブへ出す経路を残さない。
  await expect(page.locator('a[target="_blank"]')).toHaveCount(0)

  const thumbs = page.getByRole("button", { name: /機体写真を開く$/ })
  await expect(thumbs).toHaveCount(2)
  await thumbs.first().click()

  const viewer = page.getByRole("dialog", { name: "機体写真" })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText("1 / 2")).toBeVisible()

  // 端では送れない。押せてしまうと「まだ先がある」と読めてしまう。
  await expect(page.getByRole("button", { name: "前の写真" })).toBeDisabled()

  await page.getByRole("button", { name: "次の写真" }).click()
  await expect(viewer.getByText("2 / 2")).toBeVisible()
  // **隣の国へは続かない。**このチームの2枚で終わり。
  await expect(page.getByRole("button", { name: "次の写真" })).toBeDisabled()

  // Escape で閉じ、押した写真へフォーカスが戻る(→ O-20、O-25)。
  await page.keyboard.press("Escape")
  await expect(viewer).toHaveCount(0)
  await expect(thumbs.first()).toBeFocused()

  await login(page, ADMIN_PASSWORD, "こばやし")
  const after: unknown = await (await page.request.get("/api/pit")).json()
  const mine =
    typeof after === "object" &&
    after !== null &&
    "records" in after &&
    Array.isArray(after.records)
      ? after.records.filter(
          (item: { team?: unknown }) => item.team === "Palau",
        )
      : []
  for (const item of mine) {
    const row: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(row.id)}`)
  }
})

/** クリップボードから画像を貼る動きを再現する。 */
async function pasteImage(page: Page): Promise<boolean> {
  return await page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 800
    canvas.height = 600
    const context = canvas.getContext("2d")
    if (context === null) throw new Error("canvas")
    context.fillStyle = "#2563eb"
    context.fillRect(0, 0, 800, 600)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png")
    })
    if (blob === null) throw new Error("encode")

    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], "clip.png", { type: "image/png" }))
    const event = new ClipboardEvent("paste", {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    })
    // 画面のどこにも触っていない状態を作る。焦点は body にある。
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
}

test("写真は貼り付けでも足せる", async ({ page }) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  const before: unknown = await (await page.request.get("/api/pit")).json()
  const stale =
    typeof before === "object" &&
    before !== null &&
    "records" in before &&
    Array.isArray(before.records)
      ? before.records.filter(
          (item: { team?: unknown }) => item.team === "Nauru",
        )
      : []
  for (const item of stale) {
    const old: { id?: unknown } = item
    await page.request.delete(`/api/pit/${String(old.id)}`)
  }

  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Nauru")
  await ready(page)

  // **焦点が本文に無くても受け取る。**受け口を画面側の要素に付けていた
  // ときは、body に焦点があると届かなかった(→ pit.$team.tsx)。
  expect(await pasteImage(page), "貼り付けを受け取っていない").toBe(true)
  await expect(page.locator("img")).toHaveCount(1)
  await expect(page.getByText("写真 1 枚")).toBeVisible()

  // 貼ったものがそのまま保存される。
  await page.getByRole("button", { name: "保存する" }).click()
  await afterSave(page)

  const saved: unknown = await (await page.request.get("/api/pit")).json()
  const record =
    typeof saved === "object" &&
    saved !== null &&
    "records" in saved &&
    Array.isArray(saved.records)
      ? saved.records.find(
          (item: { team?: unknown; id?: unknown; photos?: unknown[] }) =>
            item.team === "Nauru",
        )
      : undefined
  expect(record?.photos?.length, "貼った写真が保存されていない").toBe(1)

  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.request.delete(`/api/pit/${String(record?.id)}`)
})

test("写真の項目が無い束に貼ると、黙って捨てずにそう言う", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/pit/Nauru")
  await ready(page)

  // 写真の項目がある束から、無い束へ移る。
  await page.getByRole("button", { name: "クライム" }).click()
  await pasteImage(page)

  await expect(page.getByText("この束には写真の項目がありません")).toBeVisible()
  await expect(page.locator("img")).toHaveCount(0)
})

test("試合詳細から開いたチームは、その試合へ戻れる", async ({ page }) => {
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/matches")
  await ready(page)
  const card = page.locator("li a[href^='/matches/']").first()
  // カードの1行目が試合名。戻り先のリンク名に使う。
  const match = (await card.innerText()).trim().split(/\s*\n/u)[0] ?? ""
  await card.click()
  await page.waitForURL(/\/matches\/.+/)

  // **どこから開いたかを戻り先に使う。**チーム一覧へ戻すと、6チームを順に
  // 見る手が毎回止まる。
  await page.locator("a[href^='/teams/']").first().click()
  await page.waitForURL(/\/teams\/.+from=/)
  const back = page.getByRole("link", { name: `← ${match}` })
  await expect(back).toBeVisible()
  await back.click()
  await page.waitForURL(/\/matches\/.+/)

  // チーム一覧から開いたときは、今までどおりチーム一覧へ戻す。
  await page.goto("/teams/Japan")
  await ready(page)
  await expect(page.getByRole("link", { name: "← チーム一覧" })).toBeVisible()
})

test("横長の画面では6チームの記録を1枚の表で見比べられる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page, VIEWER_PASSWORD, "たなか")
  await page.goto("/matches")
  await ready(page)
  await page.locator("li a[href^='/matches/']").first().click()
  await page.waitForURL(/\/matches\/.+/)

  const table = page.locator("table")
  await expect(table).toHaveCount(1)
  // 列は「項目」＋6チーム。行方向にも見出しがあるので scope を明示する(→ O-33)。
  await expect(table.locator("thead th")).toHaveCount(7)
  expect(await table.locator("tbody th[scope='row']").count()).toBeGreaterThan(
    0,
  )

  // **狭い画面には出さない。**6列は入らず、入れるとどの列も読めない幅になる。
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(table).toBeHidden()
})

test("どの幅でも横スクロールが生えない", async ({ page }) => {
  // 質問の管理も見るので、管理者で入る。
  await login(page, ADMIN_PASSWORD, "こばやし")

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of [
      "/",
      "/pit",
      "/matches",
      "/teams",
      "/admin/questions",
    ]) {
      await page.goto(path)
      await ready(page)
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow, `${path} at ${String(width)}px`).toBeLessThanOrEqual(1)
    }
  }
})

test("質問のカードを開いてもどの幅でも横スクロールが生えない", async ({
  page,
}) => {
  await login(page, ADMIN_PASSWORD, "こばやし")
  await page.goto("/admin/questions")
  await ready(page)

  // 開いた状態が一番広い。入力欄・選択肢の行・識別子の列がここで並ぶ。
  await page.getByRole("button", { name: "拾い方を開く" }).click()
  await expect(
    page.locator('input[aria-label="日本語のラベルを直す"]'),
  ).toBeVisible()

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, `開いた状態 at ${String(width)}px`).toBeLessThanOrEqual(1)
  }
})
