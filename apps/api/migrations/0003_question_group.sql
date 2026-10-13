-- Groups become data instead of a hard-coded pair (→ 要件定義書 F9-2).
-- これまでグループは question.group_key の文字列としてしか存在せず、
-- 表示名は画面のコードが持っていた。管理者が名前を直したり束を足したり
-- できるように、実体として持つ。
--
-- キーとラベルを分ける。ラベルを識別子として使うと、「搬送」を別の名前へ
-- 直した瞬間に、その名前で束ねていた項目がどこにも属さなくなる。
-- 選択肢で識別子を分けているのと同じ理由(→ 要件定義書 F9-4)。
CREATE TABLE question_group (
  key        TEXT    PRIMARY KEY,
  label_ja   TEXT    NOT NULL,
  -- 並び順はグループ自身が持つ。キーの文字順に頼ると、名前を直しただけで
  -- ページの順番が入れ替わる。
  sort_order INTEGER NOT NULL
);

-- 既存の2つを移す。question.group_key の値をそのままキーにするので、
-- 既に入っている項目の所属は変わらない。
INSERT INTO question_group (key, label_ja, sort_order)
VALUES ('carry', '搬送', 10),
       ('climb', 'クライム', 20);
