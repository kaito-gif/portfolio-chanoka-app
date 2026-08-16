# 実装仕様書

**このファイルはリポジトリごと公開する前提で書く。** 実在の氏名・屋号・実ドメイン・単価は書かない。

自分向けの作業指示書。「何を作るか」「今どこまで実装済みか」「実装するときに必ず守ること」
を、調査の経緯を追わなくても分かる形にまとめる。調査の経緯・実測ログ・まだ決着していない
論点は `docs/requirements.md` に置く。**この2つは食い違うことがある**
（`requirements.md` が調査ログの積み上げで、確定するたびにここへ反映するため）。
実装で両者が食い違ったら、このファイルを正として `requirements.md` 側を追いつかせる。

最終更新: 2026-08-16（構成要素#10(FunctionsのCI化)を実装、フェーズ2の残りはデモ資材とREADME書き換えのみに）

## 何を作るか

日本の贈答EC特有の「のし・ギフト対応」（熨斗の要否・表書き・名入れ・外のし／内のし）を
Shopifyアプリとして実装する。副業ポートフォリオ第3弾。第1弾のデモストア `chanoka-demo`
（架空の日本茶D2C）に実際にインストールして動かす。「技術を展示するための機能」ではなく
「発注者が実際に困っていることを解く機能」を選んでいる。

## アーキテクチャ

**extension-only app**（custom distribution）。開発者側のWebサーバーを持たず、
Theme App Extension・Shopify Functions・Admin UI Extension のみで構成する。
月額のホスティング費用が発生しない構成を意図的に選んでいる。

```
┌─────────────────────┐
│ カートページ (Dawn)   │
│  extensions/noshi-cart (Theme App Extension)
│  ├ blocks/noshi_options.liquid … 行ごとの熨斗入力UI（カートフッター配置）
│  └ assets/noshi-cart.js        … /cart/add.js でfee行を追加・reconcileFeeLinesで追随
└─────────┬────────────┘
          │ line item properties（表書き・名入れ・のし種別）
          │ + 独立したカート行（のし代・包装料）
          ▼
┌─────────────────────┐
│ extensions/noshi-wrap-free (Discount Function)
│  一定金額以上で包装料の行を100%割引
└─────────┬────────────┘
          ▼
      注文確定
          │
          ▼
┌─────────────────────┐
│ extensions/noshi-order-block (Admin UI Extension・構成要素#5)
│  admin.order-details.block.render で商品ごとの熨斗情報カード＋印字用データを表示
│  (訂正機能=FR-18は未実装)
└─────────────────────┘
```

設定値（variant ID・しきい値）は shop metafield `$app:noshi_settings`
（type: json）に一元化し、Theme App Extension と Discount Function が同じ値を参照する。

## データモデル

| データ | 置き場所 | 備考 |
|---|---|---|
| 熨斗の要否・表書き・名入れ・のし種別 | カート行の line item properties（キー: `表書き`／`名入れ`／`のし種別`） | 注文確定後は**読み取り専用**。編集する mutation は存在しない |
| のし代・包装料 | 通常のカート行（独立行）。非表示の `_noshi_parent_key` プロパティで親行のキーを保持 | ダミー商品2点（のし代・包装料）。**「オンラインストア」販売チャネルに公開している必要がある**（未公開だと `/cart/add.js` が422で失敗する） |
| 表書きの選択肢 | Metaobject（`app--{app_id}--noshi_title`） | マーチャントが管理画面から増減できる。7件投入済み（御中元・御歳暮・御祝・内祝・御礼・粗品・無地熨斗） |
| variant ID・しきい値 | shop metafield `$app:noshi_settings`（type: json） | `{ noshiFeeVariantId, wrapFeeVariantId, freeWrapThreshold }` の3キー。**単価は持たない**（独立行化以降、単価の正はダミー商品のvariant価格。旧 `noshiFeeAmount`/`wrapFeeAmount` は廃止済み） |
| 出荷担当による訂正値（未実装） | Order メタフィールド（app-owned、名前未定） | line item properties は書き換えられないため、訂正は別データとして持つ。元の入力と訂正後の値を両方表示する設計にする |

**受注画面(`noshi-order-block`)が読むデータ**: `Order.lineItems.customAttributes`
（表書き・名入れ・のし種別）を直接読む。**shop metafieldは読まない**（下記「実装するときに
必ず守ること」参照）。料金行(のし代・包装料)の除外は「表書きが空でない行だけ拾う」という
判定だけで足り、variant IDの突き合わせは不要という設計判断をした。

**Liquid から `$app:noshi_settings` を読むときの注意**: `shop.metafields.app.noshi_settings`
や `shop.metafields['$app:noshi_settings']` の短縮記法はこの環境では値を解決しない。
`shop.metafields['app--{app_id}']['noshi_settings']` のように namespace を直書きする
（`extensions/noshi-cart/blocks/noshi_options.liquid` 参照。`app_id` は
`snippets/noshi-title-options.liquid` が持つ値と同じ）。

## 実装状況

### フェーズ1（コア。これだけで作品として成立する）

| # | 要素 | 状態 |
|---|---|---|
| 1 | のし入力ブロック（Theme App Extension） | ✅ 実装済み・実機通し確認8項目クリア |
| 2 | 表書きのマスタ管理（Metaobject） | ✅ 実装済み |
| 3 | 入力値の保持（line item properties） | ✅ 実装済み |
| 4 | のし・包装料の加算（独立行として `/cart/add.js` で追加） | ✅ 実装済み |
| 5 | 受注画面での熨斗確認（Admin UI Extension） | ✅ 実装済み・実機確認済み（2026-08-15）。**これでフェーズ1完了** |

**フェーズ1は2026-08-15に完了した。** 購入から出荷まで(カートで熨斗指定→料金加算→
受注画面での確認)が初めて通しで動く状態になった。

### フェーズ2（説得力の上乗せ。ここまでで公開）

| # | 要素 | 状態 |
|---|---|---|
| 6 | 一定金額以上で包装料を無料（Discount Function） | ✅ 実装済み |
| 7 | 購入後の贈答内容の確認表示（Customer Account UI Extension） | ✅ 実装済み・実機確認済み（2026-08-15）。実現方式をCheckout UI Extension(Thank youページ)からCustomer Account UI Extension(注文ステータスページ)へ変更した(下記「構成要素#7の実装結果」参照) |
| 8 | 熨斗の印字用データ出力 | ✅ 実装済み・実機確認済み（2026-08-15）。構成要素#5に統合 |
| 9 | 受注後の熨斗の訂正（FR-18） | ✅ 実装済み・実機確認済み（2026-08-15）。`noshi-order-block`に統合 |
| 10 | Functions の自動テスト | ✅ fixture ベースの単体テスト実装済み（`noshi-wrap-free` 7件）。GitHub Actionsでのcheck済み（2026-08-16、下記「CI化の実装結果」参照） |
| 11 | デモ資材の作成 | ❌ 未着手。構成要素#5実機確認時のスクリーンショットが素材候補としてある |

### フェーズ3（当面やらない）

配送希望日時の指定、メッセージカード文面、明細書の金額非表示、複数配送先への別送。

## 実装するときに必ず守ること（横断的な罠）

### カート行の操作（構成要素#1・今後の関連実装で踏襲する）

- `/cart/change.js` で `properties` を送るときは、**その行の現在の数量を `quantity` に
  明示して送る**。省略すると数量が黙って1に落ちる
- `properties` は**全置換**。表書き・名入れ・のし種別は常に3つまとめて送る
- 行の指定は `line`（番号）ではなく `id`（行キー）で行う。番号は「後から追加した行が先頭」で
  追加順と一致しない
- 属性が完全一致する行は黙ってマージされ、数量が合算される（意図した挙動）

### metafield の読み出し（Liquid側）

- `shop.metafields.app.*` / `shop.metafields['$app:*']` の短縮記法はこの環境では解決しない。
  namespace を `app--{app_id}` で直書きする
- **アプリIDを知っているファイルは2つある**（`blocks/noshi_options.liquid` と
  `snippets/noshi-title-options.liquid`）。スニペット側のコメントは「このファイルだけが
  知っている」と書いてあるが**事実と違う**（短縮記法が使えないと判明した際にブロック側にも
  必要になった）。アプリを作り直したら `grep -rn '410001276929' extensions/` で
  両方直すこと。`{% render %}` はスコープが独立していて値を返せないため1ファイルに寄せられない
- Function の入力クエリ（GraphQL）では `$app:` が**使える**。Liquid だけの制約

### のし代・包装料ダミー商品

- 「オンラインストア」販売チャネルに公開しておく（`publishablePublish`）。未公開だと
  `/cart/add.js` が422で失敗する。公開には `write_publications` スコープが要る

### dev preview での動作確認

- `shopify app dev --store chanoka-demo.myshopify.com --theme 190518362429` で起動し、
  **`http://127.0.0.1:9293` 経由でストアを開く**。直接 `https://chanoka-demo.myshopify.com/...`
  を開くとTheme App Extensionのアセットが古いバージョンを指して404になることがある
  （再起動・強制リロードでも直らない場合がある）
- `127.0.0.1:9293` はローカルプロキシのためカートセッション（cookie）が本番ドメインと別になる。
  検証のたびにカートを作り直す

### Admin API での調査・変更

- Admin UI Extension・Checkout UI Extension とも、direct API access は既定で
  **online access mode**（`shopify.app.toml` の `[access.admin] direct_api_mode = "online"` /
  `embedded_app_direct_api_access = true` は設定済み）
- Order を owner とする metafield の読み書きには `write_orders` スコープが要る
- 60日より前の注文を読むには `read_all_orders` が別途必要（審査で用途を問われうる。
  実装時に「直近の注文だけで足りるか」を先に確認する）
- **注文(Order)を読むには、スコープの承認だけでは足りない。** Order は Shopify の
  「保護対象顧客データ」に該当し、`read_orders`/`write_orders` を承認しても
  `"This app is not approved to access the Order object."` というエラーになることがある。
  Dev Dashboard発行のアプリ(このリポジトリのようなshopify.app.tomlベース)では、
  保護対象顧客データを要求するUIがPartner Dashboard/Dev Dashboardのどちらにも
  見当たらない既知の未解決事象がある(Shopifyコミュニティで複数報告、解決時期不明)。
  実際に効いた回避策: **Dev Dashboardのアプリ概要ページ→「アプリをインストール」ボタンから
  正規のOAuthインストールフローを踏む**(`shopify app dev`のセッション認可とは別物)。
  加えて配布方法(Custom distribution)の選択が前提として必要で、これは**不可逆**な操作

### Admin UI Extensionのブロック運用

- ブロックは**ページ単位ではなく注文ごとに**「+ ブロック」から追加する必要がある。
  過去に別の注文でピン留めしていても、新しい注文では毎回追加操作が要る
- Shopify標準の注文詳細表示(商品行の属性一覧)には、カート側の「先頭`_`のプロパティは
  非表示」というDawnの規則が効かない。`_noshi_parent_key`のような内部プロパティが
  そのまま見えてしまう。実害はないが、アプリ側から隠す手段もない

## 構成要素#5の実装結果（Admin UI Extension、2026-08-15）

`extensions/noshi-order-block`。`admin.order-details.block.render` を使う。
scaffoldは `shopify app generate extension --template admin_block`
（既定targetは`admin.product-details.block.render`なので手で書き換えた）。
api_versionはCLIが選んだ`2025-10`をそのまま採用(Preact + Polaris web components)。

実装した設計(FR-15・FR-17。読み取りのみ、`read_orders`で足りる):

1. `shopify.data.selected?.[0]?.id` から注文のGIDを取得する
2. `shopify.query()` で `Order.lineItems.customAttributes` を取得し、
   「表書きが空でない行だけ拾う」判定でカード化する(**shop metafieldは読まない**。
   料金行は`表書き`を持たないためこの判定だけで除外できる。variant IDの突き合わせは不要)
3. 値が空の項目(名入れなし等)は行ごと描画しない
4. 印字用データは読み取り専用の`s-text-area`に整形済みテキストで出す
   (Admin拡張にクリップボード専用コンポーネントは無く、`navigator.clipboard`も
   サンドボックスから確実に使える保証がないため採用しなかった)
5. 熨斗指定が0件の注文では`null`を返さず、明示的な空状態メッセージを出す
   (`null`はブロックを畳むだけで、動いていないのか熨斗が無いのか区別がつかなくなる)

## 構成要素#9の実装結果（受注後の熨斗の訂正・FR-18、2026-08-15）

`noshi-order-block`に統合。書き込み系のためスコープを`read_orders`から`write_orders`へ
差し替え、Order metafield定義を追加した:

```toml
[order.metafields.app.noshi_correction]
name = "熨斗訂正"
type = "json"
```

設計は「元の入力値を上書きしない。訂正値を別データとして持ち、表示時に併記する」
（詳細設計5.3で確定していた方針をそのまま実装）。

1. `ORDER_NOSHI_QUERY`に`noshiCorrection: metafield(namespace: "$app", key: "noshi_correction") { jsonValue }`
   を追加し、`{ [lineItemId]: { title, name, type } }`形式のJSONを読む
2. `buildNoshiCards(lineItemNodes, corrections)`の`corrections`引数(実装済みだった受け皿)
   にこの値を渡す。元の入力値(line item properties)より訂正値を優先して表示する
3. カードに「訂正する」ボタンを追加。クリックで表書き・名入れ・のし種別の3つの
   `s-text-field`を編集可能にする。**同時に編集できるのは1行のみ**
   (複数行を同時編集させると保存の衝突を考える必要が出るため避けた)
4. 保存は`metafieldsSet`。**Order metafieldは注文単位の単一値**なので、1行だけ訂正する
   ときも既存の`corrections`オブジェクト全体を読み込んでマージしてから書き直す
   (該当行のキーだけを上書きし、他の行の訂正は保持する)
5. 保存成功後は注文をまるごと再取得(`load()`を再実行)し、表示を最新化する
6. 訂正済みの行には「訂正済み」バッジを表示する

実機確認(2026-08-15、注文#1005・#1006の2件):
- 既存の訂正値がある行の編集フォームに正しい初期値が入ること
- 名入れを空文字に訂正した場合、表示側で正しく非表示になり、フォームには
  空文字として保持されること(「訂正して消す」ができる)
- 初回訂正(既存corrections=`{}`)でのマージが正しく動くこと
- 2つの注文の訂正値が独立して保持されること(お互いに上書きしないこと)
- キャンセルボタンでmetafieldへの書き込みが発生しないこと
- 保存後、印字用データ(FR-17)にも訂正後の値が反映されること

**新たに判明した表示上の癖**: カードに訂正UIを追加した結果、ブロックの高さが
Adminの推奨値を超え「警告：このブロックは高すぎます」が表示されるようになった。
Adminはこの警告時、ブロック内容を複数カラムのレイアウトに詰めて表示する。
DOM順序自体は正しい(a11yツリーで確認済み)が、見た目上は「訂正するボタン」が
表書きと名入れの間に来るなど、視覚的な順序が入れ替わって見える。実害はなく
(クリック・保存とも正常に動く)、「さらに表示」を押せば1カラムに展開されて
解消する。ブロックの表示行数を減らす設計変更をしない限り、このカラム化自体は
Admin側の挙動なので消せない。

## 構成要素#7の実装結果（2026-08-15。Checkout UI Extension → Customer Account UI Extensionへ変更・実機確認済み）

Thank you ページ（Checkout UI Extension）で使える`Order` API は `isFirstOrder` / `number`
しか公開せず、熨斗情報（line item properties）を読む手段がないという制約は解消できない
ため、**拡張タイプそのものをCustomer Account UI Extension（注文ステータスページ）に
変更した**。詳細な調査経緯は `docs/requirements.md` の「構成要素#7の実現方式の再検討」を参照。

**実装した設計**: `extensions/noshi-order-status`（`customer_account_ui`テンプレートで
scaffold）。

- ターゲット: `customer-account.order-status.cart-line-item.render-after`
  （各商品行の直後に描画。行単位で1回ずつ実行される）
- 使用API: Cart Lines API の `shopify.target`（この拡張が紐づく`CartLine`そのものを返す）
  の`.attributes`（`{key, value}[]`。line item properties がそのまま載る）
- 表示ロジックは構成要素#5の`buildNoshiCards`と同じ「表書きが空でない行だけ拾う」判定を
  踏襲(`OrderStatusBlock.jsx`内に同じ`NOSHI_KEYS`定数を持つ。3ファイル目の重複だが、
  拡張間でモジュールを共有する標準的な手段がないため許容)
- Admin APIへの依存がなく、構成要素#5で踏んだ「保護対象顧客データの壁」は発生しない
- `api_access`・`network_access`とも有効化していない(Cart Lines APIだけで足りるため)

**実機確認（2026-08-15）**:

1. `chanoka-demo`の顧客アカウントは「新しい顧客アカウント」に設定済みだった
   （設定画面のURLが`shopify.com/{shop_id}/account`形式であることから確認。
   ユーザーによる設定変更は不要だった）
2. Customer Account拡張のdev previewは「その顧客アカウントが実際に注文を持っている」
   ことが前提(`no_order=true`で弾かれる)。ユーザーの実アカウント([redacted])
   でサインインし、テスト注文(#1008、銀行振込・実口座への振込不要なデモ決済)を
   実際に作成して検証した
3. `CartLine.attributes`のキー名はカート側の`表書き`/`名入れ`/`のし種別`と完全に一致した
4. 注文ステータスページで、Shopify標準のline item properties表示(「表書き: 御中元」等)とは
   別に、本拡張の「熨斗(のし)情報」カードが商品行の直後に正しく描画された
5. のし代・包装料の行(表書きを持たない)ではカードが描画されないことを確認(除外判定が
   正しく効いている)
6. コンソールエラーなし

**新たに判明した設計上の論点**: Shopify標準のline item properties表示が、この注文
ステータスページでも(Adminの注文詳細と同様に)キー名をそのままラベルとして
「表書き: 御中元」のように出す。本拡張のカードと内容が重複して見える。実害はなく
(標準表示は制御できないため受容している構成要素#5と同じ判断)、UIとしては「同じ情報が
2箇所に出る」冗長さがある点は認識しておく。

## CI化の実装結果（Functions の自動テスト、2026-08-16）

`.github/workflows/test.yml` として実装し、GitHub Actions上で実際にfixtureテスト7件が
緑になることを確認した。リポジトリは`kaito-gif/portfolio-chanoka-app`にprivateで作成し
push済み（公開前のリーク検査(ng-words.txt)は未実施のため、まだpublicにはしていない）。

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- working-directory: extensions/noshi-wrap-free
  run: npm test -- --run
```

実機確認で2つの罠が見つかり、両方このワークフローに反映済み:

1. **`node-version: 20`ではEBADENGINEで失敗する**。npm workspaces構成のため、
   `extensions/noshi-wrap-free`配下だけで`npm ci`してもリポジトリルートの
   `package.json`（依存: `@shopify/cli@4.6.1`、`engines.node >=22.12.0`）まで
   解決対象になる。`node-version: 22`に上げて解消した
2. **`npm ci`をサブディレクトリだけで実行すると`spawn shopify ENOENT`で失敗する**。
   fixtureテストは`shopify app function build`を内部で呼ぶため、npm workspacesの
   ルートにインストールされる`node_modules/.bin/shopify`が要る。ワークフロー内の
   `npm ci`をリポジトリルートで実行するよう変更して解消した

事前にドキュメント調査で記録していた懸念（javy/wasm-opt/trampolineバイナリのダウンロード
に外向き通信が要る・Alpineベースは避ける）は、`ubuntu-latest`ランナーを使ったことで
問題にならなかった（`github.com`/`cdn.shopify.com`への通信はGitHub Actionsのデフォルト
ランナーでは制限されない）。

## やらないこと

- チェックアウト内（情報・配送・支払いステップ）へのUI追加 … Shopify Plus 限定
- App Store への申請 … 実装力の証明とほぼ無関係で費用対効果が悪い
- 第1弾・第2弾との技術統合 … スタックを意図的に分けているのが3作品の構成意図

## 既知の不具合(修正済み・2026-08-14)

2026-08-14の設計レビューで検出したB-1〜B-3は同日中に修正・実機通し確認まで完了した。
詳細と実機確認の内容は `docs/design/03-detailed-design.md` の7章を参照。

| # | 不具合 | 対処 |
|---|---|---|
| B-1 | `/cart/add.js`・`/cart/update.js` のレスポンスを検証していなかった | `checkCartResponse` で検証。失敗時は例外にして能動整合はreloadせずエラー表示に倒す |
| B-2 | 親キーを持たない料金行が除去されなかった | `existingFeeLines` のフィルタから `_noshi_parent_key` の有無を外し、fee variantの行はすべて拾う |
| B-3 | `hideFeeRows` が添字だけで対象を決めていた | `data-quantity-line-key` で照合してから非表示化。一致しなければ何もしない |

未対応で残っているのは「アプリIDが2ファイルに分散している」(詳細設計書7.4)のみ。
NFR-03(設定値の単一管理)を厳密には満たせていないが、影響は軽微(アプリを作り直す
稀な場面に限られる)なので現状は受容している。

## 次にやること(優先順)

1. デモ資材の作成（構成要素#11）… フェーズ2の最後の完了条件。構成要素#5・#7実機確認時の
   スクリーンショット(熨斗カード・印字用データ・注文ステータスページ)を素材として使える
2. `README.md` の書き換え … 現在Shopifyテンプレートの雛形のままで、公開リポジトリの
   入口として実態と食い違っている。設計書への導線もない
3. 公開前のリーク検査(ng-words.txt)を実施し、GitHubリポジトリをpublicに切り替える
   （現在は`kaito-gif/portfolio-chanoka-app`にprivateで作成済み）

### 既知の未検証事項

- **名入れの値が消えたケースが1回だけ発生した**(2026-08-15)。カート・チェックアウトでは
  正しく保存されていたが、注文確定後に値が空文字になっていた。再現を試みたが2回目は
  発生せず、**日本語IME変換確定前に保存ボタンが押された可能性**を疑っている
  (`noshi-cart.js`はIME合成中の入力を特別扱いしていない)。実装バグと断定はできておらず、
  再現条件も未特定。次に似た事象が起きたら、IME入力の完了(確定)を待ってから保存する
  よう`compositionstart`/`compositionend`イベントでガードする対応を検討する
