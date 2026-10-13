-- 機体写真（→ 要件定義書 F7-5）。
--
-- 画像は D1 に直接入れる。R2 を使わないのは、有効化の手間なしに今日から
-- 撮れるようにするため。**端末側で縮小してから送る**ので、1枚あたり
-- 100〜200KB に収まる。190チーム×3枚でも 100MB 前後で、無料枠の
-- 上限（DB 1つあたり 500MB、1行あたり 2MB）に十分収まる。
--
-- 原寸を残したくなったら R2 へ移す。そのときのために、画像の出し入れは
-- store.ts の3関数だけに閉じてある。
CREATE TABLE pit_photo (
  id            TEXT    PRIMARY KEY,
  pit_record_id TEXT    NOT NULL REFERENCES pit_record (id) ON DELETE CASCADE,
  -- どの聞き取り項目で撮ったか。写真の項目は複数あってよい
  -- （シューター・インテイク・クライムなど）。
  question_id   TEXT    NOT NULL,
  sort_order    INTEGER NOT NULL,
  -- 端末で JPEG へ焼き直してから送る。iPhone の HEIC はこの時点で消える。
  content_type  TEXT    NOT NULL,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  size_bytes    INTEGER NOT NULL,
  bytes         BLOB    NOT NULL,
  created_at    INTEGER NOT NULL
);

-- 一覧は「どの記録にどの項目で何枚あるか」を引く。中身（bytes）は
-- 引かない。一覧の応答に画像を混ぜると、写真の枚数ぶん転送が膨らむ。
CREATE INDEX pit_photo_record
  ON pit_photo (pit_record_id, question_id, sort_order);
