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
- 構成要素(すべて `extensions/` 配下):
  - `noshi-cart`(Theme App Extension) … カートページの熨斗入力ブロック。のし代・包装料は
    `/cart/add.js` で独立したカート行として追加する(Cart Transform expandは2026-08-14に廃止済み)
  - `noshi-wrap-free`(Discount Function) … 一定金額以上で包装料の行を100%割引
  - `noshi-order-block`(Admin UI Extension、`admin.order-details.block.render`) …
    受注画面に熨斗情報カード・印字用データを表示し、受注後の訂正を受け付ける
  - `noshi-order-status`(Customer Account UI Extension、
    `customer-account.order-status.cart-line-item.render-after`) … 購入者の注文ステータス
    ページに熨斗情報カードを表示
- 表書きのマスタは **Metaobject** で持つ。**選択肢をコードにハードコードしない**
- ローカル起動: `shopify app dev --store chanoka-demo.myshopify.com --theme 190518362429`
  (`--theme` を省くと第1弾のliveテーマが壊れる。詳細は `docs/context.md` 参照)
- GitHub: `kaito-gif/portfolio-chanoka-app`(2026-08-16 public化済み)。
  `.github/workflows/test.yml` でfixtureテストをCI実行する

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

## 現在地(2026-08-16 時点)

**フェーズ1・フェーズ2とも完了し、リポジトリはpublic化済み。** 構成要素#1〜#11すべて
実装・実機検証済み（購入者のカート熨斗指定→料金加算→包装料無料化→注文確定→受注画面での
確認・訂正→購入者の注文ステータスページでの確認、まで一通り成立）。デモ資材(`docs/demo/`)・
README.mdの書き換え・GitHub Actions(CI)・設計書三層の実装状況への追随まで完了している。
詳しい実装状況は `docs/spec.md`、日付順の進捗は `docs/context.md` の進捗ログを見ること
（**本セクションは要点だけを持ち、詳細を重複して書かない**）。

GitHubリポジトリ `kaito-gif/portfolio-chanoka-app` は2026-08-16にpublic化した。
public化直前、ng-words.txtでは検出されないカテゴリ（ユーザーの実Gmailアドレス、
検証用にサインインした際の記述）がGit履歴に残っているのを見つけ、
`git filter-repo --replace-text` で全履歴を書き換えてforce-pushしてから公開した。
**教訓**: ng-words.txtは氏名・屋号・実ドメイン中心のリストで、メールアドレスのような
別カテゴリの実在情報は拾わない。public化前の最終チェックでは、ng-words.txt検査に加えて
「その他の個人を特定しうる情報（メールアドレス・電話番号等）」を別途目視確認すること。

### 未解決のまま残っている既知の問題

2026-08-16、以下2件とも原因を特定して修正・実機検証済み（コミット済み・push済み）。
詳細は `docs/spec.md` の「解消済みの既知の問題」、経緯は `docs/context.md` の該当ログ参照。

- 名入れの値が1回だけ注文確定後に空文字になった事象(2026-08-15)。IME変換確定前の
  保存クリックに対するガード(`compositionstart`/`compositionend`)を追加したが、
  元の事象自体の再現条件は特定できておらず根本原因と断定はできない（再発時は経過観察）
- `reconcileFeeLines`が数量変更に追随しないケース(2026-08-16観測)。原因(`passiveReconcile`の
  実行中呼び出し握りつぶし)を特定し、1回分キューして再実行するよう修正した

### 恒久的に踏襲すべき実装上の注意(構成要素#1関連)

`/cart/change.js` で properties を更新するときは、**その行の現在の数量を `quantity` に
明示して送る**。省略すると数量が黙って1に落ちて商品が消える。行の指定は `line` ではなく
`id`(行キー)を使う。属性は全置換なので表書き・名入れ・のし種別は常にまとめて送る。
検証は `http://127.0.0.1:9293` 経由で行う(直接ストアURLだとTheme App Extensionの
アセットが古いバージョンを指して404になることがある)。

### 保護対象顧客データの壁(構成要素#5・Admin UI Extension関連)

注文(Order)は Shopify の「保護対象顧客データ」に該当し、スコープの承認だけでは読めない
（`"This app is not approved to access the Order object."`）。Dev Dashboard発行のアプリでは
これを要求するUIがPartner/Dev Dashboardのどちらにも見当たらない既知の未解決事象。
**実際に効いた回避策**: Dev Dashboardのアプリ概要ページ→「アプリをインストール」ボタンから
正規のOAuthインストールフローを踏む(`shopify app dev`のセッション認可とは別経路)。
配布方法(Custom distribution)の選択も前提として必要で、これは**不可逆な操作**なので
ユーザー自身に実施してもらった(実施済み)。詳細は `docs/design/03-detailed-design.md` の
5.1.1を参照。**この回避策は既に実施済みで、以後のセッションで再実施する必要はない。**
一方 `noshi-order-status`(Customer Account UI Extension)はAdmin APIを経由しないため、
この壁の対象外。

### アプリIDが2ファイルに分散(未対応・影響軽微)

Liquidの短縮記法(`shop.metafields.app.*`)が値を解決しないため、namespaceにアプリIDを
直書きする箇所が2ファイル(`extensions/noshi-cart/blocks/noshi_options.liquid`と
`extensions/noshi-cart/snippets/noshi-title-options.liquid`)に分散している。
`{% render %}` はスコープが独立していて値を返せないため1ファイルに寄せられない。
アプリを作り直したら `grep -rn '410001276929' extensions/` で両方直すこと。

## 次にやること

`docs/spec.md` の「次にやること」を参照(このファイルには重複して書かない)。
2026-08-16時点、フェーズ1・2は完了・public化済みで、残タスクは無い。
フェーズ3(配送希望日時・メッセージカード文面等)は要件定義時点で「当面やらない」と
決めている。必要が生じない限り着手しない。

## セッション開始時の手順

1. `docs/context.md` の「開発ストア `chanoka-demo` の現状」と進捗ログ末尾を読む。
   **variant ID・Function の登録・テーマID・GitHubリポジトリの状態など、コードに
   現れない状態がそこにある**
2. `docs/spec.md` の実装状況表と「次にやること」で最新状況を確認する
3. テストを走らせて緑を確認する
   ```
   (cd extensions/noshi-wrap-free && npm test -- --run)
   ```
4. 実機を触るなら、**ホストテーマを必ず指定して**起動する
   ```
   shopify app dev --store chanoka-demo.myshopify.com --theme 190518362429
   ```
   `--theme` を省くと live の第1弾テーマがホストに選ばれ、`templates/*.json` を
   書き換えてしまう
5. 画面確認は `claude --chrome` で起動したセッションから行う。**カートページの検証は
   `http://127.0.0.1:9293` 経由でアクセスする**(直接ストアURLはTheme App Extensionの
   アセットが古いバージョンを指して404になることがある)
6. Customer Account UI Extension(`noshi-order-status`)のdev previewを見るには、
   顧客アカウントへのサインインと、そのアカウントが実際に注文を持っていることが前提
   （`no_order=true`で弾かれる）。テスト注文の作成が要ることがある

設計書三層(`docs/design/`)を編集した・実装状況が変わったときは、コンポーネント番号
（C-01〜C-07。詳細設計書で新しい構成要素を追加するときは既存の番号と衝突していないか
基本設計書のコンポーネント一覧と照合すること）とFR番号の対応が3文書で揃っているか
確認すること(2026-08-16、FR-16/FR-18の実装完了が要件定義書・基本設計書に反映されておらず、
かつC-04の番号衝突が発生した実例があるため)。
