# chanoka のし・ギフト対応アプリ(副業ポートフォリオ第3弾)

@AGENTS.md

副業ポートフォリオ3件(本プロジェクト＋`portfolio-demo-store`＋`portfolio-booking-app`)を
横断する方針・世界観の一貫性・公開ガードレールは `~/Coding/portfolio-mentor/CLAUDE.md` を
参照。本ファイルは本プロジェクト固有の実装ルールを扱う。

## この案件の前提

- **副業案件を獲得するためのポートフォリオ用Shopifyアプリ**。クライアント案件ではない
- 第1弾(Shopifyデモストア `chanoka-demo`)、第2弾(Laravel/Filament予約管理)に続く第3弾。
  日本の贈答EC特有の**のし・ギフト対応**(熨斗の要否・表書き・名入れ・外のし／内のし)を担う
- リポジトリは**公開予定**。屋号・実ドメイン・実在の氏名などをコード・コメント・
  コミットメッセージ・ドキュメントのどこにも書かない。
  **デモデータ・スクリーンショット・テストの名入れサンプルは架空名を使う**(「山田」「佐藤」等)
- 本番の場所: 開発ストア `chanoka-demo`。**extension-only app のため開発者側のサーバーは
  持たない**(Shopify がホストする)

## 背景

経緯・意思決定の理由・進捗は `docs/context.md` を参照(このファイルには**ルール**だけを書き、
**事実**は `docs/context.md` 側に置く)。

実装範囲・確定事項・未検証のリスクは `docs/requirements.md` に集約している。
**実装で迷ったら requirements.md を正とし、食い違ったら requirements.md 側を直してから
実装する。**

## 構成

- スタック: Shopify CLI / extension-only app(custom distribution)
- 構成要素:
  - `extensions/` 配下に Theme App Extension・Shopify Functions・Admin UI Extension を置く
  - Theme App Extension … カートページの熨斗入力ブロック
  - Cart Transform Function … のし・包装料の加算(expand operation)
  - Discount Function … 一定金額以上で包装料を無料に
  - Admin UI Extension … `admin.order-details.block.render` で受注画面に熨斗情報を表示・訂正
- 表書きのマスタは **Metaobject** で持つ。**選択肢をコードにハードコードしない**
- ローカル起動: `shopify app dev`(開発ストアに接続してプレビュー)

## 検証

- Functions のロジック: fixture ベースの単体テストを通す。**金額を動かす変更を
  テストなしで完了と報告しない**
- 画面変更を伴う場合は `claude --chrome` で起動し、`chanoka-demo` のカートページを
  実際に操作してコンソールエラーを確認する
- 通しの動作確認(変更のたびに壊れやすい順):
  1. カートで熨斗を指定 → のし・包装料が加算される
  2. 熨斗を外す → のし・包装料が消える
  3. 数量を変更 → のし料が数量分になる
  4. 一定金額到達 → 包装料が無料になる
  5. 注文完了 → Admin の注文詳細に熨斗情報が出る
- 公開前のリーク検査: `ng-words.txt` はコメント行(`#`)と空行を含む構造化ファイルなので、
  **`grep -f` にそのまま渡すと見出し行が全文にマッチして誤検出する**。必ず除去する:
  ```
  grep -v '^\s*#' ~/.claude/portfolio/ng-words.txt | grep -v '^\s*$' > /tmp/ng.txt
  grep -n -F -f /tmp/ng.txt -r .
  ```

## 触ってはいけないもの

- `chanoka-demo` ストアの既存商品・コレクション・テーマの破壊的変更
  (第1弾の「素のDawnからの差分がそのまま証明になる」性質を壊さない)
- **第1弾のテーマファイルを直接編集すること**。本アプリは Theme App Extension で
  機能を足すのが存在意義であり、テーマを書き換えたらその証明が消える
- 実在情報(氏名・屋号・実ドメイン・単価)の記述
- `~/.claude/portfolio/` 配下(git管理外)の内容をリポジトリへ持ち込むこと

## Claudeがやりがちなミス

- 管理画面のメニュー名・プラン制約・パッケージのバージョンを記憶で断定する。
  **Shopify はプラン境界を頻繁に見直すため、着手のたびに公式ドキュメントで裏取りする**

## 次にやること(着手順)

`docs/requirements.md` の「検証すべき技術リスク」10項目を実機で潰す段階。
以下は依存関係を踏まえた着手順(前の項目が崩れると後ろの設計をやり直すため、
飛ばさず順に進める)。

1. ~~**リスク6**: 開発ストアへ extension-only app をインストールする手順を確認する~~
   → 2026-08-13 完了（`docs/requirements.md` の「検証結果」参照）。恒久インストール
   （custom distribution）だけ未検証で残っている
2. ~~**リスク2**: のし・包装料用のダミー商品を作る~~ → 2026-08-13 完了
3. ~~**リスク5**: app-owned Metaobject の管理と Liquid からの読み出し~~ → 2026-08-13 完了
4. ~~**リスク1**: Cart Transform の expand~~ → 2026-08-13 完了。料金設計は維持できる
5. **残りはリスク3・4・7・8・9・10**(次はここ)。順不同で潰す

各リスクを確認したら `docs/requirements.md` の「検証すべき技術リスク」の該当項目に
結果を追記し、確定した内容は「確定事項」の表へ移す。**「たぶん動く」で次に進まない。**
