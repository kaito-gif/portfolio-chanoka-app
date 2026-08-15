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

ドキュメントは4系統ある。**実装で迷ったら spec.md、設計の根拠を示すときは docs/design/、
経緯を辿るときだけ requirements.md** を見る。

| 文書 | 役割 | 想定読者 |
|---|---|---|
| `docs/spec.md` | 作業指示書。実装状況と作業時の注意 | 自分（実装時） |
| `docs/design/01-requirements.md`<br>`docs/design/02-basic-design.md`<br>`docs/design/03-detailed-design.md` | 要件定義・基本設計・詳細設計の正式な三層 | 第三者（成果物として見せる） |
| `docs/requirements.md` | 技術検証の実測ログ(一次記録) | 自分（経緯を辿るとき） |
| `docs/context.md` | 背景・開発ストアの現状・進捗 | 自分（セッション開始時） |

`docs/design/` は spec.md・requirements.md の確定事項から起こした派生物。
**内容が食い違ったら docs/design/ 側を正とし、他を追いつかせる**(設計書が最も
第三者の目に触れるため)。実装を変えたら設計書の該当箇所も併せて直す。

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

## 現在地(2026-08-15 時点)

**フェーズ1が完了した。** 購入者側(カートでの熨斗指定・料金加算)と受注業務側
(受注画面の熨斗カード)が揃い、「購入から出荷までの通し」が初めて成立した。

**技術リスク10項目すべて片付いている（ドキュメント調査ベースのものも含む）。**
重いもの(料金設計・税区分)は全部片付き、**確定事項の設計は崩れないことが確認済み**。
実装フェーズ前の宿題のうち最優先だった**設定値の一元化も完了**した。

**構成要素#1を実装するときに必ず守ること**(リスク3で判明):
`/cart/change.js` で properties を更新するときは、**その行の現在の数量を `quantity` に
明示して送る**。省略すると数量が黙って1に落ちて商品が消える。行の指定は `line` ではなく
`id`(行キー)を使う。属性は全置換なので表書き・名入れ・のし種別は常にまとめて送る。

**カート描画固着の不具合は解消を実機確認済み(2026-08-14)。** 原因は Cart Transform の
expand(展開された行だけプロパティ表示が更新されない)。対策として **expand をやめ、
のし代・包装料を独立したカート行にする**方式へ実装を切り替えた: `extensions/noshi-fee`
(Cart Transform)を削除し、`noshi-cart.js` が `/cart/add.js` でfee行を直接追加・
`reconcileFeeLines`で親行に追随・DOM非表示化まで実装済み。`noshi-wrap-free` も fee行を
直接ターゲットする方式に変更し、リスク9の税額按分問題も同時に解消した。fixtureテスト
(7件)は緑。**実機での通し確認8項目もすべて通過し、描画固着は再現しなかった。**
旧Cart Transformオブジェクト(`gid://shopify/CartTransform/167641405`)は確認したところ
既に存在せず(`noshi-fee`拡張削除時に自動消滅したとみられる)、削除作業は不要だった。
詳細は `docs/requirements.md` の「構成要素#1: のし入力ブロックの実装」
「独立行化後の実測(2026-08-14)」を参照。

**実機再検証で新たに3つの罠を踏んで対処済み**(`docs/requirements.md`
「独立行化後に新たに判明した3つの罠」に詳細):

1. Liquid `shop.metafields.app.noshi_settings` の短縮記法は値を解決しない。
   namespace `app--410001276929` を直書きする必要がある
2. のし代・包装料ダミー商品は「オンラインストア」チャネルに公開していないと
   `/cart/add.js` が422で失敗する。`write_publications` スコープを追加し公開した
3. `shopify app dev` 実行中でも直接ストアURLを開くとTheme App Extensionのアセットが
   古いバージョンを指して404になることがある。**検証は `http://127.0.0.1:9293`
   経由で行うこと**(直接ストアURLは避ける)

動くもの:

- `extensions/noshi-cart` … Theme App Extension。カートフッターに行ごとの熨斗入力
  (表書き・名入れ・外のし/内のし)を出し、行ごとの「保存」ボタンで
  line item properties へ反映する。のし代・包装料は `/cart/add.js` で独立したカート行
  として追加し、`reconcileFeeLines` で親行の数量・キー変更に追随させる
- `extensions/noshi-wrap-free` … Discount Function。一定金額以上で包装料の行そのものを
  100%割引。単価・しきい値は shop metafield `$app:noshi_settings` を参照
- `extensions/noshi-order-block` … Admin UI Extension(`admin.order-details.block.render`)。
  注文詳細ページに商品ごとの熨斗情報カード(表書き・名入れ・のし種別)と印字用データを表示。
  `Order.lineItems.customAttributes` を直接読む(shop metafieldは読まない)。
  訂正機能(FR-18)は未実装。マーチャントが注文ごとに手動でブロックを追加・ピン留めする必要がある

fixture テストは7件(`noshi-wrap-free`)。**着手前に走らせて緑を確認すること。**

## 次にやること

### A. 残りの技術リスク → すべてドキュメント調査は完了。実機検証だけ実装フェーズに残っている

- ~~リスク7~~ → 2026-08-14 結論。**Thank you ページの拡張はPlus限定ではなく全プランで
  利用可**(Plus限定なのはチェックアウトの情報・配送・支払いステップのみ)。ただし
  Thank you ページの `Order` API は `isFirstOrder`/`number` しか公開せず、熨斗情報は
  取得できない。チェックアウト拡張は Admin API に直接アクセスできず Storefront API
  限定なので、フェーズ2着手時に構成要素#7の実現方式を再検討すること。
  詳細は `docs/requirements.md` の「リスク7」を参照
- ~~リスク8~~ → 2026-08-14 結論。**CIに載せられる**。`shopify app function build`は
  store/Partnerログイン不要のローカルwasmコンパイルだが、初回に javy/wasm-opt/trampoline
  バイナリをネットワーク経由でダウンロードするため完全オフラインのCIでは動かない。
  Alpine(musl)コンテナだとtrampolineバイナリの実行に失敗する既知の不具合があった
  (CLI 3.73〜3.84、[Shopify/cli#6044](https://github.com/shopify/cli/issues/6044)。
  3.85.4で修正済み、本リポジトリのCLIは4.6.1)。**CIランナーはUbuntu系のglibcイメージを
  使うこと**。詳細は `docs/requirements.md` の「リスク8」を参照
- ~~リスク10~~ → 2026-08-15 実装・実機確認まで完了。`extensions/noshi-order-block` として
  構成要素#5を実装した(下記参照)。**line item properties は注文確定後書き換えられない**
  (`orderUpdate`の`customAttributes`は注文レベルのみ)という当初の結論通り、
  読み取り専用のカード表示(FR-15/17)は完了、訂正(FR-18、`write_orders`が要る)は次段に残した

### B. 実装フェーズに入る前に片付ける宿題

リスク検証の副産物として溜まっている。**どれも金額か仕様の食い違いに直結する。**

1. ~~設定値の一元化~~ → 2026-08-14 完了。詳細は `docs/requirements.md` の
   「設定値の一元化」を参照
2. アプリIDのハードコード → **1ファイルに寄せる目標は達成できていない**(2026-08-14の
   設計レビューで判明)。Liquidの短縮記法が使えないと分かった際に
   `blocks/noshi_options.liquid` でもアプリIDの直書きが必要になり、**現在2ファイルが
   知っている**。`{% render %}` はスコープが独立していて値を返せないため1ファイルに
   寄せられない。アプリを作り直したら `grep -rn '410001276929' extensions/` で両方直すこと
3. ~~app block の置き場所~~ → 2026-08-14 完了。`templates/cart.json` の `cart-footer` へ
   移し、サイト共通フッターからは外した。なお `main-cart-items` は `@app` を
   受け付けないため、**カートの各行の中には入れられない**(この制約は残る)
4. ~~仕様の食い違い(構成要素#6)~~ → 2026-08-14 決定。**包装料のみ無料**に寄せ、
   requirements.md を修正済み
5. **税額の按分**。包装料無料の割引は税務上バンドル全体に按分される(実測済み)。
   帳簿の正確さを優先するなら設計変更が要る。フェーズ2で判断

各リスクを確認したら `docs/requirements.md` の該当項目に結果を追記し、確定した内容は
「確定事項」の表へ移す。**「たぶん動く」で次に進まない。**

### C. 構成要素#5(Admin UI Extension)の実装で踏んだ罠(2026-08-15)

**最大の壁: 注文(Order)は Shopify の「保護対象顧客データ」に該当し、`read_orders`
スコープの承認だけでは読めない。** `"This app is not approved to access the Order
object."` というエラーになる。このアプリのような Dev Dashboard 発行のアプリでは、
保護対象顧客データへのアクセスを要求する UI が Partner Dashboard・Dev Dashboard の
どちらにも見当たらない既知の未解決事象(Shopifyコミュニティで複数報告、解決時期不明)。
**実際に効いた回避策**: Dev Dashboard のアプリ概要ページ →「アプリをインストール」
ボタンから正規の OAuth インストールフローを踏む(`shopify app dev` のセッション認可とは
別経路)。加えて配布方法(Custom distribution)の選択が前提として必要で、これは
**不可逆な操作**なのでユーザー自身に Partner Dashboard で実施してもらった。
詳細手順は `docs/design/03-detailed-design.md` の 5.1.1 を参照。

その他の罠:
- Admin ブロックは**注文ごとに**手動で「+ ブロック」から追加する必要がある
  (ページ単位のピン留めではない)
- Shopify標準の注文詳細表示には Dawn の「先頭`_`のプロパティを非表示にする」規則が
  効かず、`_noshi_parent_key` がそのまま見える(実害なし)
- 名入れの値が1回だけ注文確定後に空文字になる事象が発生。再現せず未確定だが、
  日本語IME変換確定前に保存ボタンが押された可能性を疑っている
  (`noshi-cart.js`はIME合成中の入力を特別扱いしていない)。詳細は `docs/spec.md`
  の「既知の未検証事項」

料金行(のし代・包装料)をカードから除外する判定は、shop metafieldでvariant IDを
突き合わせるのではなく「表書きが空でない行だけ拾う」という主判定だけで足りた
(料金行は`表書き`属性を持たないため)。アプリIDをこの拡張に持ち込まずに済んでいる。

## セッション開始時の手順

1. `docs/context.md` の「開発ストア `chanoka-demo` の現状」を読む。
   **variant ID・Function の登録・テーマIDなど、コードに現れない状態がそこにある**。
   末尾の「未解決の不具合」は特に必ず読むこと(次にやることの最優先事項)
2. テストを走らせて緑を確認する
   ```
   (cd extensions/noshi-wrap-free && npm test -- --run)
   ```
3. 実機を触るなら、**ホストテーマを必ず指定して**起動する
   ```
   shopify app dev --store chanoka-demo.myshopify.com --theme 190518362429
   ```
   `--theme` を省くと live の第1弾テーマがホストに選ばれ、`templates/*.json` を
   書き換えてしまう
4. 画面確認は `claude --chrome` で起動したセッションから行う。**カートページの検証は
   `http://127.0.0.1:9293` 経由でアクセスする**(直接 `https://chanoka-demo.myshopify.com/...`
   を開くとTheme App Extensionのアセットが古いバージョンを指して404になることがある。
   2026-08-14実測、詳細は `docs/requirements.md` 参照)
