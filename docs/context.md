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

<!-- 以降、作業のたびに日付付きで追記する -->
