import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
// テストの設定を同じファイルに書くので、入口が提供するラッパから受ける。
// ランナー本体(vitest)を直接 import せず、依存にも直接載せない(→ S-25)。
import { defineConfig } from "vite-plus/test/config"

export default defineConfig({
  plugins: [
    // ルート単位のコード分割はプラグインに任せる。アプリのソースへ
    // 手書きの動的 import や遅延読み込みを書かない(→ S-37)。
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      // 型設定の paths と同じ宣言をここにも書く。片方だけでは
      // 型検査かバンドルのどちらかが解決できない(→ S-36)。
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  build: {
    // 分割の妥当性はこの閾値で見張る(→ S-37)。
    chunkSizeWarningLimit: 500,
  },

  test: {
    // 単体テストは対象の隣の `.test.ts` だけ。`e2e/*.spec.ts` は
    // ブラウザを起動する別の層で、Playwright が実行器を持つ。
    // 拡張子で層を区別しているので、ここで拾うと二重に走る。
    include: ["src/**/*.test.{ts,tsx}"],
  },

  server: {
    proxy: {
      // 開発サーバは API を同一オリジンへプロキシし、Host を書き換えない
      // (→ A-23)。本番は同じ Worker が両方を配るのでプロキシは要らない。
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
})
