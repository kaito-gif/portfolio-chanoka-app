# 背景メモ

指示ではなく事実・背景を置く。作業ルールは `CLAUDE.md` を見ること。

**このファイルはリポジトリごと公開する前提で書く。** クライアント名・案件の詳細・
単価・非公開資料の中身は書かない。それらは `~/.claude/portfolio/`（git管理外）にある。

## このリポジトリの位置づけ

副業案件の獲得に使うポートフォリオ用Shopifyアプリ。クライアント案件ではない。

第1弾 `portfolio-demo-store`（Shopifyテーマ実装）、第2弾 `portfolio-booking-app`
（Laravel/Filamentによる外部バックエンド）に続く第3弾。3作品は同じ架空ブランド
`chanoka`（茶の香、日本茶D2C）で世界観がつながっている連作。

第3弾は「Shopifyのアプリ拡張領域」を担当する。中心機能は日本の贈答EC特有の
のし・ギフト対応（熨斗の要否・表書き・名入れ・外のし／内のし）。企画の経緯・
検討の詳細は横断リポジトリ `portfolio-mentor` の会話ログに残っており、確定した
実装範囲は `docs/requirements.md` にまとめてある。

## 企画の変遷（要点）

- 当初は「商品ページの簡易診断App Block」＋「まとめ買い割引」で企画していたが、
  診断は発注者の困りごとではなく差し替えた（詳細は `docs/requirements.md` の
  「何を作るか」参照）
- 実装範囲の確定後、別セッションによる第三者レビューを実施。「成果物の見せ方が
  要件にない」「数量2以上の行の熨斗指定が未定義」等の指摘を受けて
  `docs/requirements.md` に反映済み

## 開発ストア `chanoka-demo` の現状（リポジトリに現れない状態）

2026-08-14 時点。**これらはコードに含まれないため、リポジトリを読むだけでは分からない。**
新しいセッションで実機を触る前にここを見ること。

### アプリ

- Org: `Katayama`（`shopify organization list` で確認できる）
- アプリ名 `noshi-gift-app` / Client ID `be04894d1a1df2c1033f874658422347`
- インストールは `shopify app dev` の**開発プレビューのみ**。恒久インストールは未実施
- 付与済みスコープ: `write_cart_transforms` / `write_discounts` / `write_products`

### 商品・コレクション・Metaobject・Metafield

| 種別 | 内容 |
|---|---|
| ダミー商品 | のし代 variant `52828643590461`（¥100） / 包装料 variant `52828643655997`（¥300）。いずれも在庫追跡なし・配送不要・販売チャネル未公開 |
| コレクション | 軽減税率対象(飲食料品) `554660430141`（日本茶6商品・手動・未公開） |
| Metaobject | `app--410001276929--noshi_title` にエントリー7件（`ochugen` / `oseibo` / `oiwai` / `uchiiwai` / `orei` / `soshina` / `muji`） |
| Shop Metafield | `$app:noshi_settings`（`gid://shopify/Metafield/46694357107005`、type: json）。**現在の値は3キー**（`noshiFeeVariantId` / `wrapFeeVariantId` / `freeWrapThreshold`＝3,000）。`noshi-cart`（Liquid・JS）と `noshi-wrap-free`（Function）が参照する。**単価は持たない**（独立行化以降、単価の正はダミー商品のvariant価格＝のし代¥100・包装料¥300。旧 `noshiFeeAmount`/`wrapFeeAmount` は廃止）。詳細は `docs/requirements.md` の「設定値の一元化」を参照 |

### Function の登録（ストア側にオブジェクトが作られている）

- `cartTransformCreate` 済み … `gid://shopify/CartTransform/167641405`（`blockOnFailure: false`）
- `discountAutomaticAppCreate` 済み … 「包装料無料(一定金額以上)」`gid://shopify/DiscountAutomaticNode/1790134223165`（ACTIVE / PRODUCT）

**アプリを作り直すと、これらは Function ID とひも付かなくなる。** その場合は
両方を作り直すこと（手順はリスク1・4の検証結果に残っている）。

### テーマ

- live: `Dawn 15.5.0 baseline` `190188192061` … **第1弾の証明。触らない**
- 検証用ホスト: `noshi-app dev host` `190518362429`（baseline の複製・未公開）
  - のし入力ブロックは **カートフッター**（`templates/cart.json` の `cart-footer` セクション、
    `subtotal` より前）に配置済み（2026-08-14、宿題3完了）。サイト共通フッターからは外した
  - `shopify app dev` は必ず `--theme 190518362429` を付けて起動する

### 税設定

基本税 日本 10% / 商品の優先適用 8%（軽減税率対象コレクション）/ 税込表示 ON。
事業体は米国のまま。詳細は `docs/requirements.md` の「リスク9」。

### カート描画固着の対策（次のセッションでまず引き継ぐこと）

方針は決着し、コード実装も完了した（2026-08-14）。**Cart Transform の expand を廃止し、
のし代・包装料を独立したカート行にする**方式へ切り替えた。`extensions/noshi-fee` は
削除済み。詳細は `docs/requirements.md` の「決着: 選択肢2（expand廃止・独立行化）を採用」
を参照。

**残作業は2026-08-14に両方完了した**（詳細は `docs/requirements.md` の
「独立行化後に新たに判明した3つの罠」「独立行化後の実測」を参照）:

1. 実機での通し確認8項目 → 完了。描画固着は再現せず、独立行化の対策が効いていることを確認
2. 旧 Cart Transform（`gid://shopify/CartTransform/167641405`）の削除 → 確認したところ
   既に存在しなかった（`noshi-fee` 拡張を削除した時点で自動的に消えていたとみられる）。
   削除作業自体は不要だった

なお shop metafield `$app:noshi_settings` は変更不要（`noshiFeeVariantId` /
`wrapFeeVariantId` は独立行化前から既に投入済みのため。`noshiFeeAmount` /
`wrapFeeAmount` は使われなくなったが残しておいても実害はない）。

**実機再検証で新たに3つの罠が見つかり、対処済み**:

- Liquid の `shop.metafields.app.noshi_settings` 短縮記法が値を解決せず、
  namespace を `app--410001276929` で直書きする形に直した
  （`extensions/noshi-cart/blocks/noshi_options.liquid`）
- のし代・包装料ダミー商品が「オンラインストア」チャネル未公開だと `/cart/add.js` が
  422 で失敗する。`publishablePublish` で両商品を公開し、`write_publications`
  スコープを `shopify.app.toml` に追加した
- `shopify app dev` 実行中でも、ブラウザで直接ストアの本番URLを開くと Theme App
  Extension のアセットURLが古いバージョンを指したまま 404 になることがある。
  `http://127.0.0.1:9293`（ローカルプロキシ）経由でアクセスすると解消する。
  以後のカートページ検証はこちらを使うこと

## 進捗

2026-08-13: 実装範囲の確定、CLAUDE.md・docs/requirements.md の整備、git初期化・
初回コミットまで完了。

2026-08-13: リスク6（開発ストアへのインストール）を検証。`shopify app init --template none`
でプロジェクトを生成しリポジトリ直下へ配置、`shopify app dev` で `chanoka-demo` に接続して
管理画面の「インストール済み」に出るところまで確認した。結果は `docs/requirements.md` の
「検証結果」を参照。

2026-08-13: テンプレートが同梱するデモ内容（App Home / App Tools / FAQ Metaobject）を
すべて削除し、拡張0個の状態で `shopify app dev` が通ることを確認。判断の根拠と、
この判断が依存している未検証点は `docs/requirements.md` の「テンプレート同梱物の扱い」を参照。

2026-08-13: リスク5の前半（表書きマスタを管理画面から増減できるか）を検証し、できることを
確認したため App Home 削除の判断を確定。開発ストアには表書きのエントリーを7件投入済み
（御中元・御歳暮・御祝・内祝・御礼・粗品・無地熨斗、ハンドルはすべて英字）。
後半（Liquidからの読み出し）も `shopify theme console` で確認し、書き方が確定した。
残るのは app block としてカートページに実際にレンダリングする確認のみ。
検証用ホストテーマとして baseline を複製した未公開テーマ `noshi-app dev host` を作成した
（第1弾の証明用テーマを改変しないため）。

2026-08-13: app block のレンダリングまで確認し、リスク5は決着。表書き7件が
`display_order` 順にストアフロントへ出た。あわせて、Dawn の `main-cart-items` が
app block を受け入れないという構成要素#1に効く制約が判明した。詳細は
`docs/requirements.md` の「Dawn のカートセクションが app block を受け入れるか」
「app block の設置とレンダリング」を参照。

検証用ホストテーマ `noshi-app dev host` には、現状サイト共通のフッターに検証用ブロックが
入ったままになっている（本来の置き場所はカートフッター）。

2026-08-13: リスク2を完了。開発ストアに「のし代」「包装料」の2商品を作成した
（在庫追跡なし・配送不要・販売チャネル未公開）。variant ID は
`docs/requirements.md` の「リスク2」に記録してある。

2026-08-13: リスク1を完了。`extensions/noshi-fee`（Cart Transform）を実装し、
fixture テスト4件と開発ストアでの通し確認を通した。料金設計は維持できる。
`cartTransformCreate` で開発ストアに CartTransform を1件作成済み。
詳細と、価格指定のハマりどころは `docs/requirements.md` の「リスク1」を参照。

2026-08-13: リスク4を完了。`extensions/noshi-wrap-free`（Discount Function）を実装し、
fixture テスト6件と実機確認を通した。開発ストアに自動割引
「包装料無料(一定金額以上)」を1件作成済み。コンポーネント単位の割引はできず、
バンドル行への固定額割引で代替している。詳細は `docs/requirements.md` の「リスク4」を参照。

2026-08-13: リスク9を完了。税務の解釈（茶葉8% / のし・包装料10%）が国税庁の資料と
整合することを確認し、開発ストアに税設定を入れて実測した（基本税10%＋優先適用8%＋
税込表示ON。設定はユーザーが管理画面で実施）。バンドルでも税の優先適用は無視されず、
確定事項の税区分は成立する。一方で、リスク4の包装料無料の割引が税額計算上は
バンドル全体に按分されることが判明し、フェーズ2の判断事項として記録した。
なお事業体は米国のまま変更していない（変更には実在の氏名・生年月日・住所の入力が
必要で、本プロジェクトのガードレールと衝突するため）。

2026-08-13: 技術リスク10項目のうち6つ(1・2・4・5・6・9)が完了。重い項目
(料金設計・税区分)は全部片付き、確定事項の設計は崩れないことを確認した。
残りはリスク3・7・8・10と、実装フェーズ前の宿題5件(CLAUDE.md「次にやること」参照)。

2026-08-14: 実装フェーズ前の宿題1(設定値の一元化)を完了。variant ID・単価・
しきい値を shop metafield `$app:noshi_settings` へ一元化し、`noshi-fee`・
`noshi-wrap-free` の両 Function から参照する形にした。fixture テストは12件
(4→5＋6→7)。開発ストアに実測値を投入し、実機で熨斗あり×1(¥2,800)・
熨斗あり×2(¥5,600→割引¥600→¥5,000)とも一元化前と同じ結果が出ることを確認した。
詳細は `docs/requirements.md` の「設定値の一元化」を参照。

2026-08-14: リスク3(カート上での line item properties の後編集)を完了。実機で
`/cart/change.js` を直接叩いて挙動を確定させた。**`properties` を送るときに
`quantity` を省略すると数量が黙って1に落ちる**という、構成要素#1に直撃する罠が
見つかった(逆に `quantity` だけ送る場合は properties が保たれる、という非対称)。
属性の全置換・キーを削除できないこと・行キーが毎回変わること・行の並び順が
「後から追加した行が先頭」であることも確定した。詳細は `docs/requirements.md` の
「リスク3」を参照。技術リスクは10項目中7つが完了。

2026-08-14: 構成要素#1(のし入力ブロック)を実装し、宿題2(アプリIDのハードコード)・
宿題3(app blockの置き場所)・宿題4(無料化の範囲)も片付けた。カートフッターに
行ごとの熨斗入力を出し、保存すると のし代・包装料が加算されるところまで実機で確認済み。
一方で**プロパティ変更後にカートの描画HTMLが古い状態で固着する**問題が見つかり、未解決。
金額は常に正しく、表書き等のテキスト表示だけが遅れる。未公開テーマのプレビュー特有の
挙動である可能性があるが切り分けは未実施(第1弾のliveテーマを置き換えるリスクを避けた)。
詳細は `docs/requirements.md` の「構成要素#1: のし入力ブロックの実装」を参照。

2026-08-14: 構成要素#1の通し確認を8項目すべて完了。熨斗OFFで空ラベルが出ないこと、
数量2の行の表書きを変えても数量が2のまま保たれること、属性が完全一致した行が
数量を合算してマージされ商品が消えないこと、コンソールにエラーが出ないことを実測した。
検証の過程で、描画固着によりブロックの `data-line-key` が古くなると**保存自体が
不発になる**(表示だけの問題ではない)ことが判明したため、行の特定を
key→index＋variant の2段構えに直した。

2026-08-14: カート描画固着の原因を切り分けた。**Cart Transform の expand で
展開されている行だけが、カートページ上でプロパティ表示を更新しない**。同じカート・
同じ行で展開の有無だけを切り替えて再現(展開なし→最新、展開あり→古い、展開なしに
戻す→最新)。未公開テーマのプレビュー・app devの実行有無・本アプリのブロックとJSは
いずれも原因ではないことを、liveテーマとapp dev停止状態で確認して除外した。
Functionの入力クエリに名入れ・のし種別を足す対策は効果がなく差し戻した。
アプリ側からの回避策は未発見で、選択肢はShopifyへの報告か、expandをやめて
料金を独立した行にするかの2つ。後者はリスク9の税額按分も同時に解消するため、
フェーズ2でまとめて再検討する。詳細は `docs/requirements.md` の「原因の切り分け」を参照。

2026-08-14: カート描画固着への対策として、Cart Transform expand を廃止し
のし代・包装料を独立したカート行にする方式（`docs/requirements.md` の2択の選択肢2）を
実装した。`extensions/noshi-fee` を削除、`noshi-cart.js` に `/cart/add.js` での
fee行追加・`reconcileFeeLines`（親行への追随・孤児の自動除去）・DOM非表示化を追加、
`noshi-wrap-free` は割引対象を包装料行そのものへ直接ターゲットする方式に変更した
（副産物としてリスク9の税額按分問題も解消）。fixtureテスト7件は緑。**実機での
通し確認と、開発ストアに残る旧Cart Transformオブジェクトの削除はこのセッションでは
未実施**（ストア認可のOAuthがタイムアウト）。次のセッションでまず終わらせること。

2026-08-15: 独立行化(前日の対策)を実機通し確認8項目で再検証し、描画固着が再現しないことを
確認。実機検証で見つかった B-1〜B-3（料金行の追加失敗の未検知・親キーを持たない孤児料金行が
除去されない・非表示化が添字だけに依存していた不具合）を同日中に修正・実機再確認まで完了した。
詳細は `docs/design/03-detailed-design.md` の7章、コミット履歴を参照。旧Cart Transform
（`gid://shopify/CartTransform/167641405`）は`cartTransformDelete`で確認したところ既に
存在せず、削除作業自体が不要だった。

2026-08-15: 構成要素#5（受注画面の熨斗カード）を実装し、フェーズ1が完了した。
`extensions/noshi-order-block`（Admin UI Extension、`admin.order-details.block.render`）。
FR-15（熨斗情報カード表示）・FR-17（印字用データ出力）を実装。FR-18（受注後の訂正）は
書き込み系のため次段に分離した。実機で注文3件（熨斗あり×2、熨斗なし×1）を作成し、
通し確認項目8・12・13（受注画面表示・熨斗あり/なしの出し分け・印字用データの書式）を
クリアした。

**着手時に踏んだ最大の壁: 注文（Order）が Shopify の「保護対象顧客データ」に該当し、
`read_orders` スコープの承認だけでは読めなかった。** `"This app is not approved to
access the Order object."` というエラーになる。このアプリのような Dev Dashboard
発行のアプリでは、保護対象顧客データへのアクセスを要求する UI が Partner Dashboard・
Dev Dashboard のどちらにも見当たらない既知の未解決事象（Shopifyコミュニティで複数報告、
解決時期不明）。実際に解消した手順は、Dev Dashboard のアプリ概要ページ →
「アプリをインストール」ボタンから正規の OAuth インストールフローを踏む
（`shopify app dev` のセッション認可とは別の経路）。配布方法（Custom distribution）の
選択も前提として必要で、これは Partner Dashboard の「アプリ配布」から実施した
（不可逆な選択のため、ユーザー自身に実施してもらった）。

その他、実機で新たに判明した事項（詳細は `docs/design/03-detailed-design.md` 5.1.1/5.4）:
- Admin ブロックは注文ごとに手動で「+ ブロック」から追加する必要がある（ページ単位の
  ピン留めではない）
- Shopify標準の注文詳細表示には、Dawnの「先頭`_`のプロパティを非表示にする」規則が効かず、
  `_noshi_parent_key` がそのまま見える（実害なし）
- 名入れの値が1回だけ注文確定後に空文字になる事象が発生（再現せず、日本語IME変換確定前に
  保存された可能性を疑っているが未確定）。詳細は `docs/spec.md` の「既知の未検証事項」

`shopify.app.toml` の `scopes` に `read_orders` を追加した（構成要素#9でFR-18を実装する際に
`write_orders` へ差し替える）。

<!-- 以降、作業のたびに日付付きで追記する -->
