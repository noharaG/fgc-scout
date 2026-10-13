-- Official responses are stored verbatim. Interpretation happens on read.
-- 公式サイトの応答を加工せずに保つ。matches[].details の形は大会が始まるまで
-- 確認できないため、整形して保存すると形が判明した後に遡れない(→ ADR 0003)。
CREATE TABLE official_snapshot (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at INTEGER NOT NULL,
  source     TEXT    NOT NULL CHECK (source IN ('next-data', 'html')),
  build_id   TEXT,
  raw        TEXT    NOT NULL
);

CREATE INDEX official_snapshot_fetched_at
  ON official_snapshot (fetched_at DESC);

-- Scouts identify themselves once; the name is kept on their device after that.
CREATE TABLE scout (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

-- Pit interview questions are data, not a fixed spec (→ 要件定義書 F9).
CREATE TABLE question (
  id         TEXT    PRIMARY KEY,
  -- 推定式が読む項目にだけ役割キーを入れる。capacity / climb_zone /
  -- partner_climb の3つ。これを持つ項目は無効化を拒む。消せるように
  -- すると、抑制ユニットへの貢献の推定が黙って壊れる。
  role_key   TEXT    UNIQUE,
  group_key  TEXT    NOT NULL,
  label_ja   TEXT    NOT NULL,
  -- 生徒がそのまま読み上げる英語の質問文。相手は190カ国から来ており、
  -- 聞き方が分からない項目は空欄のまま戻ってくる。
  ask_en     TEXT    NOT NULL,
  help_ja    TEXT,
  input_type TEXT    NOT NULL
             CHECK (input_type IN ('number', 'single', 'multi', 'text', 'photo')),
  required   INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  sort_order INTEGER NOT NULL,
  -- Disabled questions stay in the table; past answers need the definition.
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE INDEX question_order ON question (group_key, sort_order);

-- Choice ids are separate from labels on purpose.
-- ラベルを識別子として保存すると、「床から吸う」を「床から拾う」に直した
-- 瞬間に過去の回答が何を指していたか読めなくなる。
CREATE TABLE question_choice (
  id          TEXT    PRIMARY KEY,
  question_id TEXT    NOT NULL REFERENCES question (id) ON DELETE CASCADE,
  label_ja    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE INDEX question_choice_order ON question_choice (question_id, sort_order);

-- One pit visit for one team. Several scouts may record the same team.
CREATE TABLE pit_record (
  id          TEXT    PRIMARY KEY,
  team        TEXT    NOT NULL,
  scout_id    TEXT    NOT NULL REFERENCES scout (id),
  recorded_at INTEGER NOT NULL
);

CREATE INDEX pit_record_team ON pit_record (team, recorded_at DESC);

-- Values are split by type instead of stringifying everything, so that
-- numeric answers stay comparable without parsing.
CREATE TABLE pit_answer (
  pit_record_id TEXT NOT NULL REFERENCES pit_record (id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL REFERENCES question (id),
  value_number  REAL,
  value_text    TEXT,
  -- JSON array of question_choice.id. Single-choice keeps one element.
  value_choices TEXT,
  PRIMARY KEY (pit_record_id, question_id)
);
