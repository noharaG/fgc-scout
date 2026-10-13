import {
  createRootRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router"

import { useCurrentSession } from "~/session/current"

export const Route = createRootRoute({ component: RootLayout })

type NavTo = "/" | "/matches" | "/teams" | "/pit" | "/admin/questions"

type NavItem = {
  readonly to: NavTo
  readonly label: string
  readonly adminOnly: boolean
}

const NAV: readonly NavItem[] = [
  { to: "/", label: "次の試合", adminOnly: false },
  { to: "/matches", label: "試合一覧", adminOnly: false },
  { to: "/teams", label: "チーム一覧", adminOnly: false },
  { to: "/pit", label: "ピット記録", adminOnly: false },
  { to: "/admin/questions", label: "質問の管理", adminOnly: true },
]

/**
 * ナビの中身は1つだけ持ち、広幅のサイドバーと狭幅の下部タブの両方へ
 * 同じものを描く。どちらを見せるかは CSS だけで決める。内容を分岐させると、
 * 項目を1つ足すたびに2箇所を直すことになる。
 */
function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="app-nav-link"
          activeOptions={{ exact: item.to === "/" }}
          activeProps={{ "data-active": "" }}
        >
          {item.label}
        </Link>
      ))}
    </>
  )
}

function RootLayout() {
  const location = useLocation()
  const session = useCurrentSession()

  // ログイン画面はナビを出さない。まだ入っていない人に行き先を並べても、
  // どれを押しても弾かれる。
  if (location.pathname === "/login") {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <Outlet />
      </div>
    )
  }

  const isAdmin = session.data?.role === "admin"

  return (
    <div className="app-shell">
      <nav className="app-sidebar">
        <div className="px-2 pb-3 text-base font-extrabold">FGC Scout</div>
        <NavLinks isAdmin={isAdmin} />
      </nav>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="app-tabs">
        <NavLinks isAdmin={isAdmin} />
      </nav>
    </div>
  )
}
