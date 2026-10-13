import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { routeTree } from "./routeTree.gen"
import { loadFlagFontIfNeeded } from "./team/flag-font"

// スタイルシートは入口で1回だけ副作用 import する。読み込み点が1つなら、
// トークン定義が全画面へ同じ順序で適用されることが配置から自明になる。
import "./styles/globals.css"

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// クエリのクライアントは1インスタンスだけ作り、既定値をここで持つ。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 公式データは元が s-maxage=10 で、サーバ側も30秒より細かく取りに
      // 行かない。フォーカスのたびに取り直しても転送量を払うだけになる。
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// 旗が出ない環境だけ絵文字フォントを足す。描ける端末では1バイトも読まない
// (→ team/flag-font.ts)。描画の前に判定しておく。
loadFlagFontIfNeeded()

const rootElement = document.getElementById("root")
if (rootElement === null) throw new Error("#root element is missing")

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
