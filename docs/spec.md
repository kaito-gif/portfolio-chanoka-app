# 実装仕様書

**このファイルはリポジトリごと公開する前提で書く。** 実在の氏名・屋号・実ドメイン・単価は書かない。

自分向けの作業指示書。「何を作るか」「今どこまで実装済みか」「実装するときに必ず守ること」
を、調査の経緯を追わなくても分かる形にまとめる。調査の経緯・実測ログ・まだ決着していない
論点は `docs/requirements.md` に置く。**この2つは食い違うことがある**
（`requirements.md` が調査ログの積み上げで、確定するたびにここへ反映するため）。
実装で両者が食い違ったら、このファイルを正として `requirements.md` 側を追いつかせる。

最終更新: 2026-08-14（技術リスク10項目の検証完了・独立行化への切り替え完了）

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
│ Admin UI Extension（未実装・構成要素#5）
│  admin.order-details.block.render で熨斗情報を表示・訂正
└─────────────────────┘
```

設定値（variant ID・単価・しきい値）は shop metafield `$app:noshi_settings`
（type: json）に一元化し、Theme App Extension・両Functionが同じ値を参照する。

## データモデル

| データ | 置き場所 | 備考 |
|---|---|---|
| 熨斗の要否・表書き・名入れ・のし種別 | カート行の line item properties（キー: `表書き`／`名入れ`／`のし種別`） | 注文確定後は**読み取り専用**。編集する mutation は存在しない |
| のし代・包装料 | 通常のカート行（独立行）。非表示の `_noshi_parent_key` プロパティで親行のキーを保持 | ダミー商品2点（のし代・包装料）。**「オンラインストア」販売チャネルに公開している必要がある**（未公開だと `/cart/add.js` が422で失敗する） |
| 表書きの選択肢 | Metaobject（`app--{app_id}--noshi_title`） | マーチャントが管理画面から増減できる。7件投入済み（御中元・御歳暮・御祝・内祝・御礼・粗品・無地熨斗） |
| variant ID・単価・しきい値 | shop metafield `$app:noshi_settings`（type: json） | `{ noshiFeeVariantId, wrapFeeVariantId, noshiFeeAmount, wrapFeeAmount, freeWrapThreshold }`。`noshiFeeAmount`/`wrapFeeAmount` は独立行化後は未使用（残しても実害なし） |
| 出荷担当による訂正値（未実装） | Order メタフィールド（app-owned、名前未定） | line item properties は書き換えられないため、訂正は別データとして持つ。元の入力と訂正後の値を両方表示する設計にする |

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
| 5 | 受注画面での熨斗確認（Admin UI Extension） | ❌ 未着手。設計方針は下記「構成要素#5の実装方針」を参照 |

### フェーズ2（説得力の上乗せ。ここまでで公開）

| # | 要素 | 状態 |
|---|---|---|
| 6 | 一定金額以上で包装料を無料（Discount Function） | ✅ 実装済み |
| 7 | 購入後の贈答内容の確認表示（Checkout UI Extension） | ❌ 未着手。**プラン制約なしで作れるが、熨斗情報を直接読む手段がない**（下記「構成要素#7の制約」参照） |
| 8 | 熨斗の印字用データ出力 | ❌ 未着手。構成要素#5に含める |
| 9 | 受注後の熨斗の訂正 | ❌ 未着手。構成要素#5に含める |
| 10 | Functions の自動テスト | ✅ fixture ベースの単体テスト実装済み（`noshi-wrap-free` 7件）。CI化は未着手（下記「CI化の方針」参照） |
| 11 | デモ資材の作成 | ❌ 未着手 |

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

## 構成要素#5の実装方針（Admin UI Extension）

`admin.order-details.block.render` を使う。次の設計で進める:

1. `BlockExtensionApi.data` から注文のGIDを取得する（`data` はリソースIDの配列のみで、
   line item の中身は含まれない）
2. Standard API の `query()`（GraphQL Admin API への direct fetch。自動認証される）で
   `Order.lineItems.customAttributes` を取得し、熨斗情報（表書き・名入れ・のし種別）を
   カードに表示する
3. 訂正機能は、line item properties を書き換えるのではなく、**Order メタフィールドへ
   `metafieldsSet` で訂正値を保存する**。元の入力と訂正後の値を両方表示する
4. `shopify.app.toml` の `scopes` に `write_orders` を追加する

scaffold コマンド: `shopify app generate extension --template admin_block`

## 構成要素#7の制約（Checkout UI Extension）

Thank you ページの拡張自体はPlus限定ではなく全プランで使えるが、次の制約がある:

- Thank you ページで使える `Order` API は `isFirstOrder` / `number` しか公開せず、
  熨斗情報（line item properties）は取得できない
- Checkout UI Extension は Storefront API（`shopify:storefront` プロトコル）にはアクセス
  できるが、**Admin GraphQL API への直接アクセスはできない**
- 本アプリは extension-only（自前サーバーを持たない）ため、Admin API経由で熨斗情報を
  取得してThank youページに渡す標準的な手段がない

着手前に、Storefront API経由で読める形（例: 顧客が確認できるorder経由の何らかのデータ）に
持たせる設計を再検討すること。現時点では実現方式が未確定。

## CI化の方針（Functions の自動テスト）

`(cd extensions/noshi-wrap-free && npm test -- --run)` はそのままCIに載せられる。
`shopify app function build` はstore/Partnerログイン不要のローカルwasmビルドだが、

- 初回に javy / wasm-opt / trampoline バイナリを `github.com` / `cdn.shopify.com` から
  ダウンロードするため、CIランナーには外向き通信が要る（完全オフライン不可）
- **Alpine（musl）ベースのコンテナは避ける**。trampolineバイナリがglibc依存で、CLI
  3.73〜3.84時代にENOENTで失敗する既知の不具合があった（[Shopify/cli#6044](https://github.com/shopify/cli/issues/6044)、
  3.85.4で修正済み）。`ubuntu-latest` 等のglibcイメージを使う

GitHub Actions ワークフロー例（未作成・実機確認もまだ）:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: cd extensions/noshi-wrap-free && npm ci && npm test -- --run
```

## やらないこと

- チェックアウト内（情報・配送・支払いステップ）へのUI追加 … Shopify Plus 限定
- App Store への申請 … 実装力の証明とほぼ無関係で費用対効果が悪い
- 第1弾・第2弾との技術統合 … スタックを意図的に分けているのが3作品の構成意図

## 次にやること（優先順）

1. **構成要素#5（Admin UI Extension）の実装** … フェーズ1最後のピース。上記「実装方針」に沿って
   `shopify app generate extension --template admin_block` から着手
2. 構成要素#8・9（印字用データ出力・受注後の訂正）… #5と同じ拡張に統合する
3. 構成要素#7（Checkout UI Extension）の実現方式の再検討 … 着手前に必須
4. CI化（構成要素#10の残り） … GitHub Actions ワークフローの実機確認
5. デモ資材の作成（構成要素#11）… フェーズ2の完了条件
