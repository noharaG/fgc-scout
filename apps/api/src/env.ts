import type { D1Database } from "@cloudflare/workers-types"

/**
 * The bindings and settings this Worker receives.
 *
 * `wrangler types` が出すグローバルの `Env` を使わず、モジュールの型として
 * 宣言する。画面(`apps/web`)がルート定義の型を導出するとき、グローバル宣言だと
 * 解決できず、解決させようとすると Worker のランタイム型がブラウザ側の
 * 型グラフへ丸ごと入ってしまう(→ S-33)。
 *
 * この型が `wrangler.jsonc` の `vars` と `.dev.vars.example` の合わせ先になる。
 * 片方を変えたらもう片方も変える。
 */
export type AppEnv = {
  readonly DB: D1Database

  /** 自チーム。公式データの participants[].country と突き合わせる。 */
  readonly OUR_TEAM: string
  /** 公式サイトを叩く最小間隔。元データが10秒粒度なので30秒以上にする。 */
  readonly OFFICIAL_MIN_INTERVAL_SECONDS: string
  readonly OFFICIAL_BASE_URL: string

  /** 実行時に注入する秘密。テンプレートは .dev.vars.example にある。 */
  readonly VIEWER_PASSWORD_HASH: string
  readonly ADMIN_PASSWORD_HASH: string
  readonly SESSION_SECRET: string
}
