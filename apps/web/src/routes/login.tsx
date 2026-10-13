import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { api } from "~/client/api"

export const Route = createFileRoute("/login")({ component: Login })

// localStorage のキーは <アプリ名>_<用途> の小文字スネークケースにする。
// 接頭辞が無いと、同じオリジンの別の物と衝突したときに名前から読めない。
const SCOUT_NAME_KEY = "fgc_scout_name"

const FIELD =
  "h-14 rounded-control border-[1.5px] border-line bg-white px-4 text-center text-[17px] font-normal"

function readStoredName(): string {
  try {
    return globalThis.localStorage.getItem(SCOUT_NAME_KEY) ?? ""
  } catch {
    // プライベートウィンドウなどで読めないことがある。名前を聞き直すだけで
    // 済むので、失敗を握りつぶして空として扱う。
    return ""
  }
}

function storeName(name: string): void {
  try {
    globalThis.localStorage.setItem(SCOUT_NAME_KEY, name)
  } catch {
    // 保存できなくてもログイン自体は成立する。次回また名前を聞く。
  }
}

function Login() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const storedName = readStoredName()

  const [password, setPassword] = useState("")
  const [scoutName, setScoutName] = useState(storedName)

  const login = useMutation({
    mutationFn: async () => {
      const response = await api.api.session.$post({
        json: { password, scoutName },
      })
      if (response.status === 401) throw new Error("password")
      if (!response.ok) throw new Error(`session ${String(response.status)}`)
      return await response.json()
    },
    onSuccess: async () => {
      if (scoutName !== "") storeName(scoutName)
      // 入り直すと権限が変わる。セッションを引き直さないと、ナビが前の
      // 権限のまま残り、コーチで入っても管理者向けの項目が出ない。
      await queryClient.invalidateQueries({ queryKey: ["session", "current"] })
      await navigate({ to: "/" })
    },
  })

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 p-6">
      <p className="text-center text-[26px] font-extrabold">FGC Scout</p>
      <p className="text-center text-xs text-secondary-ink">
        FIRST Global Challenge 2026 · Team Japan
      </p>

      <input
        type="password"
        className={FIELD}
        placeholder="共有パスワード"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
        }}
      />

      {storedName === "" ? (
        <input
          type="text"
          className={FIELD}
          placeholder="あなたの名前（記録に残ります）"
          value={scoutName}
          onChange={(event) => {
            setScoutName(event.target.value)
          }}
        />
      ) : (
        <p className="text-center text-xs text-secondary-ink">
          {storedName} として入ります
        </p>
      )}

      <button
        type="button"
        className="h-14 rounded-control bg-brand text-[17px] font-extrabold text-white disabled:opacity-60"
        disabled={login.isPending || password === ""}
        onClick={() => {
          login.mutate()
        }}
      >
        {login.isPending ? "確認しています" : "入る"}
      </button>

      {login.isError ? (
        <p className="text-center text-xs text-error">
          {login.error.message === "password"
            ? "パスワードが違います。コーチに確認してください。"
            : `入れませんでした（${login.error.message}）。回線を確認してください。`}
        </p>
      ) : null}

      <p className="text-center text-xs text-muted-ink">
        この端末に保存して、次回から聞きません
      </p>
    </main>
  )
}
