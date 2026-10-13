import type { AppType } from "api/type"
import { hc } from "hono/client"

/**
 * API の型を受ける経路はこの1ファイルの1行に限る。手書きクライアントも
 * 生成クライアントも置かない。サーバのルート定義から型が直結するので、
 * 形の変わったルートは実行時に失敗するのではなくビルドを壊す(→ S-33)。
 *
 * 新しい API 呼び出しはこのクライアント経由で書き、生の fetch を足さない。
 */
export const api = hc<AppType>("/")
