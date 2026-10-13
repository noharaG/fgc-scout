import { describe, expect, test } from "vite-plus/test"

import { requiredRole, satisfies } from "./access"

/**
 * 許可表の隣に置くテスト。全ロールで表を検証する(→ S-31)。
 * 表に行を足したらここにも行を足す。
 */

describe("requiredRole", () => {
  test("未知のパスは null を返し、呼び出し側が 404 を返せるようにする", () => {
    expect(requiredRole("GET", "/api/nope")).toBe(null)
    expect(requiredRole("GET", "/nope")).toBe(null)
  })

  test("メソッドが違えば同じパスでも一致しない", () => {
    expect(requiredRole("POST", "/api/official")).toBe(null)
  })

  test("公開されているのはヘルスとログインだけ", () => {
    expect(requiredRole("GET", "/api/health")).toBe("public")
    expect(requiredRole("POST", "/api/session")).toBe("public")
  })

  test("読み取りは viewer、質問の書き換えは admin", () => {
    expect(requiredRole("GET", "/api/session")).toBe("viewer")
    expect(requiredRole("DELETE", "/api/session")).toBe("viewer")
    expect(requiredRole("GET", "/api/official")).toBe("viewer")
    expect(requiredRole("GET", "/api/questions")).toBe("viewer")
    expect(requiredRole("GET", "/api/pit")).toBe("viewer")
    expect(requiredRole("POST", "/api/pit")).toBe("viewer")
    expect(requiredRole("POST", "/api/questions")).toBe("admin")
    expect(requiredRole("PATCH", "/api/questions")).toBe("admin")
  })

  test("長い接頭辞が勝つので、パラメータ付きのパスも同じ規則で解決する", () => {
    expect(requiredRole("PATCH", "/api/questions/q_capacity")).toBe("admin")
    expect(requiredRole("GET", "/api/questions/q_capacity")).toBe("viewer")
  })

  test("記録の書き直しは生徒に開き、記録ごと消すのはコーチだけ", () => {
    expect(requiredRole("PATCH", "/api/pit/abc")).toBe("viewer")
    expect(requiredRole("DELETE", "/api/pit/abc")).toBe("admin")
  })

  /**
   * 写真の1枚消しは書き直しの一部なので生徒に開く。**記録ごと消す admin の
   * 規則と同じ接頭辞から始まる**ので、長いほうが勝つ規則に頼っている。
   * ここが逆転すると、生徒が写真を1枚外そうとして記録ごと消せてしまう。
   */
  test("写真の1枚消しは生徒に開く（記録ごと消す規則に飲まれない）", () => {
    expect(requiredRole("DELETE", "/api/pit/photos/p_1")).toBe("viewer")
  })
})

describe("satisfies", () => {
  test("public は未ログインでも通る", () => {
    expect(satisfies(null, "public")).toBe(true)
    expect(satisfies("viewer", "public")).toBe(true)
    expect(satisfies("admin", "public")).toBe(true)
  })

  test("viewer 要求は未ログインだけを弾く", () => {
    expect(satisfies(null, "viewer")).toBe(false)
    expect(satisfies("viewer", "viewer")).toBe(true)
    expect(satisfies("admin", "viewer")).toBe(true)
  })

  test("admin 要求は admin だけを通す", () => {
    expect(satisfies(null, "admin")).toBe(false)
    expect(satisfies("viewer", "admin")).toBe(false)
    expect(satisfies("admin", "admin")).toBe(true)
  })
})
