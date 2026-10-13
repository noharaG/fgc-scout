import { defineConfig } from "@playwright/test"

/**
 * ブラウザを起動するテストは単体テストと実行器を分ける。層の区別は
 * import 元（`vite-plus/test` か `@playwright/test` か）と拡張子
 * （`.test.ts` か `.spec.ts` か）で決まる。
 *
 * サーバは別に起動しておく。`wrangler dev` が API と画面の両方を配るので、
 * ここでは立ち上げず、起動済みの前提で叩く（手順は apps/api/README.md）。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:8787",
    // 会場の端末に近い条件で見る。PC 幅は spec 側で切り替える。
    viewport: { width: 390, height: 844 },
  },
})
