-- Initial question set. Ships as a migration because the app is unusable
-- with an empty question table; the admin edits it from here (→ 要件定義書 F9).
-- 初期値であって固定の仕様ではない。管理者が後から変更する。

INSERT INTO question
  (id, role_key, group_key, label_ja, ask_en, help_ja, input_type, required,
   sort_order, enabled, updated_at, updated_by)
VALUES
  ('q_photo', NULL, 'carry', '写真',
   'May I take some photos?',
   NULL, 'photo', 1, 10, 1, 0, 'seed'),

  ('q_capacity', 'capacity', 'carry', '1回に運べる個数',
   'How many balls can you carry at once?',
   '抑制ユニットへの貢献を推定する土台。目視では数えられないので、ここが唯一の正確な入力になる',
   'number', 1, 20, 1, 0, 'seed'),

  ('q_intake', NULL, 'carry', '拾い方',
   'How do you pick up the balls?',
   '床の WILDFIRE を拾えるか', 'single', 0, 30, 1, 0, 'seed'),

  ('q_deliver', NULL, 'carry', '入れ方',
   'Where do you put the balls?',
   'シールド経由は人が介在するので、連携の練度が別に効く',
   'single', 0, 40, 1, 0, 'seed'),

  ('q_drivetrain', NULL, 'carry', '駆動系',
   'What drivetrain do you use?',
   NULL, 'single', 0, 50, 1, 0, 'seed'),

  ('q_climb_zone', 'climb_zone', 'climb', '登れる ZONE（申告）',
   'How high can you climb on the brace?',
   '申告であって実績ではない。公式データの実績と突き合わせて見る',
   'single', 0, 60, 1, 0, 'seed'),

  ('q_climb_mech', NULL, 'climb', 'クライム機構の型',
   'How do you attach to the brace?',
   '掛け方が分かると失敗の理由が読める', 'single', 0, 70, 1, 0, 'seed'),

  ('q_partner_climb', 'partner_climb', 'climb', 'パートナークライム',
   'Can you lift another robot, or be lifted?',
   '支えられたロボット1台につき 25点', 'single', 0, 80, 1, 0, 'seed'),

  ('q_note', NULL, 'climb', '備考',
   'Anything you are especially proud of?',
   '数値にならないこと（英語が話せる担当者の名前、連携の意欲 など）',
   'text', 0, 90, 1, 0, 'seed');

INSERT INTO question_choice (id, question_id, label_ja, sort_order, enabled)
VALUES
  ('intake_floor', 'q_intake', '床から吸う', 10, 1),
  ('intake_grip', 'q_intake', '挟む', 20, 1),
  ('intake_scoop', 'q_intake', 'すくう', 30, 1),
  ('intake_none', 'q_intake', '拾えない', 40, 1),

  ('deliver_direct', 'q_deliver', '抑制ユニットへ直接', 10, 1),
  ('deliver_shield', 'q_deliver', 'シールド経由', 20, 1),
  ('deliver_both', 'q_deliver', '両方やる', 30, 1),
  ('deliver_extinguisher', 'q_deliver', '消火器優先', 40, 1),

  ('drive_4wd', 'q_drivetrain', '4輪', 10, 1),
  ('drive_6wd', 'q_drivetrain', '6輪', 20, 1),
  ('drive_mecanum', 'q_drivetrain', 'メカナム', 30, 1),
  ('drive_other', 'q_drivetrain', 'その他', 40, 1),

  ('climb_none', 'q_climb_zone', '不可', 10, 1),
  ('climb_contact', 'q_climb_zone', '接触', 20, 1),
  ('climb_zone1', 'q_climb_zone', 'ZONE 1', 30, 1),
  ('climb_zone2', 'q_climb_zone', 'ZONE 2', 40, 1),
  ('climb_zone3', 'q_climb_zone', 'ZONE 3', 50, 1),

  ('mech_hook', 'q_climb_mech', 'フック', 10, 1),
  ('mech_winch', 'q_climb_mech', 'ウインチで巻く', 20, 1),
  ('mech_arm', 'q_climb_mech', '腕で掴む', 30, 1),
  ('mech_other', 'q_climb_mech', 'その他', 40, 1),

  ('partner_lift', 'q_partner_climb', '他機を支えられる', 10, 1),
  ('partner_lifted', 'q_partner_climb', '支えてもらえる', 20, 1),
  ('partner_both', 'q_partner_climb', '両方できる', 30, 1),
  ('partner_none', 'q_partner_climb', 'できない', 40, 1);
