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
- **Shopify管理画面の「設定」の変更は Claude からは操作できない**(2026-08-13に判明)。
  自動操作タブは背面だと `visibilityState: hidden` になり、この状態では
  JSの合成クリックは保存されず、`computer` の実クリックもチェックボックスが反応しない。
  ユーザーがClaudeの画面を見ている間はタブが必ず背面になるため、原理的に前面を保てない。
  **設定変更はユーザーに手順とURLを渡して実施してもらい、Claudeは Admin API
  (`shopify app execute`)で結果を検証する**役割に徹する。
  一方、商品・コレクション・メタオブジェクトなど Admin API にミューテーションがあるものは
  Claudeが直接作れるので、そちらを優先する。
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

## 現在地(2026-08-14 時点)

**技術リスク10項目のうち7つ(1・2・3・4・5・6・9)が実機で潰れている。**
重いもの(料金設計・税区分)は全部片付き、**確定事項の設計は崩れないことが確認済み**。
実装フェーズ前の宿題のうち最優先だった**設定値の一元化も完了**した。

**構成要素#1を実装するときに必ず守ること**(リスク3で判明):
`/cart/change.js` で properties を更新するときは、**その行の現在の数量を `quantity` に
明示して送る**。省略すると数量が黙って1に落ちて商品が消える。行の指定は `line` ではなく
`id`(行キー)を使う。属性は全置換なので表書き・名入れ・のし種別は常にまとめて送る。

**未解決の不具合が1件ある**: プロパティ変更後、カートの描画HTMLが古い状態で固着する。
金額は常に正しいが、**「表示だけの問題」ではない**。古いHTMLで描かれるとブロックの
`data-line-key` も古くなり、保存が不発になる(この二次被害は行の特定を
key→index＋variant の2段構えにして塞いだ)。未公開テーマのプレビュー特有かどうかは
未検証。**公開前に必ず決着させること。**
詳細は `docs/requirements.md` の「構成要素#1: のし入力ブロックの実装」を参照。

動くもの:

- `extensions/noshi-cart` … Theme App Extension。カートフッターに行ごとの熨斗入力
  (表書き・名入れ・外のし/内のし)を出し、行ごとの「保存」ボタンで
  line item properties へ反映する
- `extensions/noshi-fee` … Cart Transform。熨斗ありの行を expand してのし代・包装料を加算。
  variant ID・単価は shop metafield `$app:noshi_settings` から読む
- `extensions/noshi-wrap-free` … Discount Function。一定金額以上で包装料相当を割引。
  単価・しきい値は同じ metafield を参照

fixture テストは12件(5＋7)。**着手前に両方を走らせて緑を確認すること。**

## 次にやること

### A. 残りの技術リスク(順不同・どれも軽い)

- **リスク7**: チェックアウト拡張のプラン境界を公式ドキュメントで再確認
- **リスク8**: Functions の単体テストを CI に載せられるか
- **リスク10**: Admin UI Extension から注文メタフィールドへ書き込む方法とスコープ

### B. 実装フェーズに入る前に片付ける宿題

リスク検証の副産物として溜まっている。**どれも金額か仕様の食い違いに直結する。**

1. ~~設定値の一元化~~ → 2026-08-14 完了。詳細は `docs/requirements.md` の
   「設定値の一元化」を参照
2. ~~アプリIDのハードコード~~ → 2026-08-14 完了。
   `snippets/noshi-title-options.liquid` 1ファイルだけが知っている状態にした
3. ~~app block の置き場所~~ → 2026-08-14 完了。`templates/cart.json` の `cart-footer` へ
   移し、サイト共通フッターからは外した。なお `main-cart-items` は `@app` を
   受け付けないため、**カートの各行の中には入れられない**(この制約は残る)
4. ~~仕様の食い違い(構成要素#6)~~ → 2026-08-14 決定。**包装料のみ無料**に寄せ、
   requirements.md を修正済み
5. **税額の按分**。包装料無料の割引は税務上バンドル全体に按分される(実測済み)。
   帳簿の正確さを優先するなら設計変更が要る。フェーズ2で判断

各リスクを確認したら `docs/requirements.md` の該当項目に結果を追記し、確定した内容は
「確定事項」の表へ移す。**「たぶん動く」で次に進まない。**

## セッション開始時の手順

1. `docs/context.md` の「開発ストア `chanoka-demo` の現状」を読む。
   **variant ID・Function の登録・テーマIDなど、コードに現れない状態がそこにある**
2. テストを走らせて緑を確認する
   ```
   (cd extensions/noshi-fee && npm test -- --run)
   (cd extensions/noshi-wrap-free && npm test -- --run)
   ```
3. 実機を触るなら、**ホストテーマを必ず指定して**起動する
   ```
   shopify app dev --store chanoka-demo.myshopify.com --theme 190518362429
   ```
   `--theme` を省くと live の第1弾テーマがホストに選ばれ、`templates/*.json` を
   書き換えてしまう
4. 画面確認は `claude --chrome` で起動したセッションから行う
