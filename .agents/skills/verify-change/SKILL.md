---
name: verify-change
description: Runs the verification baseline and boundary-specific checks for the fgc-scouting repository. Use when asked to verify, review, or finish a change. Applies only to the fgc-scouting repository (FGC Scout).
---

# verify-change

検証者の禁止事項を先に置く。

- 飛ばした検査を「通った」と報告しない。実行していないものは実行していないと書く。
- 数を増やすためだけにテストを足さない。
- 失敗した検査を、閾値を緩めて通さない。原因を直す。

## Baseline

差分の内容によらず毎回この順で実行する。順序は上から下へ依存している。

```sh
pnpm install --frozen-lockfile
pnpm run check      # 整形・lint・型認識 lint
pnpm run knip       # 未使用の依存と export
pnpm run typecheck  # 全パッケージの tsc
pnpm run test       # 単体テスト
pnpm run build      # 画面の成果物
pnpm --dir apps/api exec wrangler deploy --dry-run --outdir /tmp/worker
```

`knip` が未使用を報告したら、**依存を消すか使うかのどちらかを選ぶ。**
検出を無効化して通さない。

## Boundary checks

差分が触れた境界の節だけを追加で実行する。

### `apps/api/src/official.ts` を変更した

- `pnpm --dir apps/api exec vp test official` を実行する。
- **未知のキーが来ても落ちないこと**を確かめるテストが残っているか読む。
  `matches[].details` の形は大会が始まるまで確認できないので、この性質が
  このファイルの唯一の防波堤である。
- 取得した JSON を整形・正規化して保存する変更になっていないか読む。
  原文のまま保存する（→ ADR 0003）。

### `apps/api/src/access.ts` を変更した

- 許可表に行を足したら、`access.test.ts` にも行を足す。
- 全ロール（未ログイン / viewer / admin）で表を検証しているか確認する。
- 未知のパスが `null` を返し、呼び出し側が 404 にしているか確認する。
  403 を返すと、存在しないパスと権限不足の区別が利用者から消える。

### `apps/api/src/session.ts` を変更した

- `pnpm --dir apps/api exec vp test session` を実行する。
- 署名・鍵導出を変えたなら、**性質のテストを同じ変更の中で更新する**。
  「動いたから正しい」で済ませない（→ A-09）。

### `apps/api/migrations/` を変更した

- `pnpm --dir apps/api run db:local` がローカルで通ることを確かめる。
- 既存の列を消す変更なら、**過去の回答が読めなくなっていないか**を確かめる。
  質問項目は削除せず無効化する（→ 要件定義書 F9-3）。

### 質問項目まわり（`role_key`）を変更した

- `capacity` / `climb_zone` / `partner_climb` の無効化が 409 で拒まれることを
  確かめる。これらは推定式が読むので、消せると推定が黙って壊れる。

### `apps/web/src/styles/globals.css` を変更した

- 値を変えたなら、**先に `prototype/fgc-scout/tokens.css`（視覚の正本）を
  変えたか**確認する。実装から先に変えない。
- 色を足したなら、白地または白文字とのコントラストを実測し、4.5:1 以上を
  満たすまで暗くする。実測値をコメントに残す。
- 赤と青を新しい用途に使っていないか読む。アライアンス色に予約している。
- `dark:` 修飾子・`prefers-color-scheme`・`.dark` が入っていないか読む。

### `prototype/fgc-scout/` を変更した

- 実装（`apps/web`）への転写が同じ変更に含まれているか確認する。
- 正本だけを変えて実装を放置すると、次の人がどちらが正しいか判定できない。

### 数字を画面に出す変更をした

- その数字に出典（公式 / 推定 / 申告）が添えられているか確認する。
- 推定なら、**何試合ぶんの観測に基づくか**が読めるか確認する。
- 取得に失敗しているとき、最後に成功した時刻が出るか確認する。

## Requirement mapping

検査と要件の対応。空欄を減らすために使う表であり、行を減らすためではない。

| 要件                                       | 何が押さえているか                                              |
| ------------------------------------------ | --------------------------------------------------------------- |
| F1-4 / F1-5 権限は2区分・強制はサーバ1箇所 | `access.test.ts`（全ロールで表を検証）                          |
| F2-4 未知のキーで落ちない                  | `official.test.ts`                                              |
| F2-5 古いデータを最新として見せない        | `official` の `stale` フラグと、画面側の表示                    |
| F4-2b 公式 / 推定 / 申告の区別             | 画面のレビュー（自動検査は未実装。TODO）                        |
| F9-5 役割キーを持つ項目は消せない          | `PATCH /api/questions/:id` の 409（自動検査は未実装。TODO）     |
| A-09 署名と鍵導出                          | `session.test.ts`（性質のみ。公開ベクタとの突き合わせは未実装） |

TODO と書いた行はまだ検査が無い。スタブで埋めて緑にしない。
