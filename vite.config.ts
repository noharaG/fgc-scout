import { defineConfig } from "vite-plus"

// 生成物の除外を名前付き定数にして fmt と lint の両方から参照する(→ S-12 / S-18)。
// routeTree.gen.ts はルータのプラグインが生成する。手で編集しない。
const generated = ["apps/web/src/routeTree.gen.ts"]

// prototype/ は視覚の正本で、実装がここから転写する側。整形器に書き換え
// させると、正本と実装のどちらが先に動いたのか追えなくなる。
const conventions = ["prototype/**"]

export default defineConfig({
  defaultPackage: "./apps/web",
  fmt: {
    printWidth: 80,
    semi: false,
    ignorePatterns: [...generated, ...conventions],
  },
  lint: {
    // 検査の厳しさは既定を最も厳しい側に置く(→ A-42)。
    categories: { correctness: "error", suspicious: "error", perf: "error" },
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
      reportUnusedDisableDirectives: "error",
    },
    ignorePatterns: [...generated, ...conventions],
  },
})
