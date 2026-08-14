# 詳細設計書

**システム名**: chanoka のし・ギフト対応アプリ（`noshi-gift-app`）
**版**: 1.0（2026-08-14）
**前提文書**: [要件定義書](./01-requirements.md) / [基本設計書](./02-basic-design.md)

---

## 1. 本書の位置づけ

[基本設計書](./02-basic-design.md)で決めた方式を、**ファイル単位・関数単位の仕様**まで
落とし込む。実装済みのコンポーネント（C-01・C-02）は実装の実物を反映し、
未実装のコンポーネント（C-03）は設計のみを記す。

---

## 2. ファイル構成

```
portfolio-chanoka-app/
├── shopify.app.toml                    アプリ設定・スコープ・Metaobject/Metafield 定義
├── extensions/
│   ├── noshi-cart/                     C-01: Theme App Extension
│   │   ├── shopify.extension.toml
│   │   ├── blocks/
│   │   │   └── noshi_options.liquid    熨斗入力ブロック本体
│   │   ├── snippets/
│   │   │   └── noshi-title-options.liquid   表書きの <option> 生成
│   │   ├── assets/
│   │   │   ├── noshi-cart.js           カート操作・料金行の整合
│   │   │   └── noshi-cart.css
│   │   └── locales/
│   │       ├── ja.json
│   │       └── en.default.json
│   └── noshi-wrap-free/                C-02: Discount Function
│       ├── shopify.extension.toml
│       ├── schema.graphql
│       ├── locales/
│       │   └── en.default.json         拡張の表示名。toml の t:name を解決する
│       ├── src/
│       │   ├── index.ts
│       │   ├── cart_lines_discounts_generate_run.ts       ロジック
│       │   └── cart_lines_discounts_generate_run.graphql  入力クエリ
│       ├── generated/                  ★ビルド生成物（Git 管理外）
│       │   └── api.ts                  スキーマから生成される型定義
│       ├── tests/
│       │   ├── default.test.js         fixture 走行テスト
│       │   └── fixtures/*.json         入力と期待出力の組（7 件）
│       ├── vite.config.js
│       ├── vitest.config.js
│       └── package.json
└── docs/
    ├── design/                         本設計書一式
    ├── requirements.md                 技術検証の実測ログ
    ├── spec.md                         実装者向け作業指示書
    └── context.md                      背景・開発ストアの状態
```

---

## 3. C-01: noshi-cart（Theme App Extension）

### 3.1 拡張定義

| 項目 | 値 |
|---|---|
| 種別 | `theme`（Theme App Extension） |
| ブロック名 | のし入力 |
| ターゲット | `section`（セクション内に設置するアプリブロック） |
| 設置場所 | カートテンプレートの `cart-footer` セクション |

### 3.2 `blocks/noshi_options.liquid`

#### 3.2.1 設定値の読み出し

```liquid
{%- assign noshi_settings = shop.metafields['app--{app_id}']['noshi_settings'].value -%}
{%- assign noshi_fee_variant_id = noshi_settings.noshiFeeVariantId | split: '/' | last | default: '' -%}
{%- assign wrap_fee_variant_id = noshi_settings.wrapFeeVariantId | split: '/' | last | default: '' -%}
```

| 処理 | 理由 |
|---|---|
| 名前空間にアプリ ID を直書きする | Liquid では `shop.metafields.app.*` / `shop.metafields['$app:*']` の短縮記法が値を解決しない（6.1 参照） |
| `split: '/' \| last` で末尾を取り出す | metafield が持つのは GID 形式（`gid://shopify/ProductVariant/123`）だが、Liquid の `item.variant_id` は数値のみのため、比較できる形に揃える |
| `default: ''` を付ける | 設定が未投入でもエラーにせず、料金行の管理機能だけ無効化する（NFR-04） |

#### 3.2.2 描画仕様

| 条件 | 描画内容 |
|---|---|
| カートが空 | 「カートに商品がありません。」を表示 |
| 商品行が料金行（のし代・包装料）である | **その行をスキップ**する（料金行に熨斗入力を出さない） |
| 上記以外 | 行ごとの熨斗入力欄を描画 |
| 保存済みの表書きがある | チェックボックスを ON、入力欄を展開して表示 |
| 保存済みの表書きがない | チェックボックスを OFF、入力欄を `hidden` |
| 行の数量が 2 以上 | 「この商品 N 点すべてに同じ熨斗が付きます。」の注記を表示 |

#### 3.2.3 DOM 構造と data 属性

```html
<div class="noshi-cart" data-noshi-root
     data-noshi-fee-variant-id="…" data-wrap-fee-variant-id="…">
  <h2 class="noshi-cart__heading">熨斗（のし）のご指定</h2>
  <ul class="noshi-cart__list" role="list">
    <li class="noshi-cart__item" data-noshi-line
        data-line-key="…" data-line-index="…" data-variant-id="…" data-quantity="…"
        data-message-select-title="…" data-message-save-failed="…">
      <div class="noshi-cart__product">商品名／バリエーション／数量</div>
      <label class="noshi-cart__toggle">
        <input type="checkbox" data-noshi-enabled> <span>熨斗をつける</span>
      </label>
      <div class="noshi-cart__fields" data-noshi-fields [hidden]>
        <p class="noshi-cart__note">…（数量 2 以上のときのみ）</p>
        <select data-noshi-field="title">…</select>
        <input type="text" data-noshi-field="name" maxlength="40">
        <fieldset>
          <input type="radio" name="noshi-type-{uid}" data-noshi-field="type" value="外のし">
          <input type="radio" name="noshi-type-{uid}" data-noshi-field="type" value="内のし">
        </fieldset>
      </div>
      <div class="noshi-cart__actions">
        <button type="button" data-noshi-save disabled>この商品の熨斗を保存</button>
        <p data-noshi-status role="status" aria-live="polite"></p>
      </div>
    </li>
  </ul>
</div>
```

| 属性 | 保持する値 | 用途 |
|---|---|---|
| `data-noshi-root` | — | JavaScript から設定値を読み出す起点 |
| `data-noshi-fee-variant-id` | のし代の variant ID（数値） | 料金行の判定 |
| `data-wrap-fee-variant-id` | 包装料の variant ID（数値） | 料金行の判定 |
| `data-noshi-line` | — | 行要素の目印 |
| `data-line-key` | 商品行のキー | 行特定の第 1 候補 |
| `data-line-index` | **カート配列上の添字**（0 始まり）。描画順ではない | 行特定の第 2 候補 |
| `data-variant-id` | 商品の variant ID | 第 2 候補の照合に使う |
| `data-quantity` | 描画時の数量 | 参考値。**送信時には使わない**（3.4.6 参照） |
| `data-message-*` | 翻訳済みエラーメッセージ | JavaScript にメッセージを持たせないため |
| `data-noshi-dirty` | `true` | 未保存の変更があることを示す（JavaScript が付与） |

**`uid` の生成**: `{ブロック ID}-{行の連番}` で構成する。同一ページ内でラジオボタンの
`name` が衝突しないようにするため。

> ⚠️ **`data-line-index` を「描画順の連番」に振り直してはならない。**
> ループは料金行をスキップして描画するため、描画された行数と添字は一致しない
> （例: カートの 0 番目が料金行なら、最初に描画される商品行の `data-line-index` は 1 になる）。
> この値が**カート配列上の添字**であることが、行特定の第 2 候補（3.4.5）が
> `カート[添字]` で目的の行を引ける唯一の根拠である。
> 「連番が飛んでいて不自然だから」と直すと、**行特定が黙って壊れ、保存が不発になる**。

#### 3.2.4 のし種別の値を翻訳しない設計

ラジオボタンの `value` は `外のし` / `内のし` に**固定**し、翻訳するのは表示ラベルのみとする。
値まで翻訳すると、言語切替時に保存済みの値と一致しなくなり、
受注側が読む印字用データの表記も揺れるため（NFR-08）。

### 3.3 `snippets/noshi-title-options.liquid`

| 項目 | 内容 |
|---|---|
| 引数 | `selected` … 現在選ばれている表書き（空なら placeholder が選択される） |
| 出力 | `<option>` 群（先頭に選択を促す disabled な placeholder を 1 件） |
| 並び順 | `display_order` の昇順 |

**このスニペットを分離している理由**: Metaobject の型名 `app--{app_id}--noshi_title` に
含まれるアプリ ID を局所化するため。当初は「リポジトリ内でこのファイルだけが知っている」
状態を意図していた。

> ⚠️ **現状はこの意図を満たしていない。** 実機検証で Liquid の短縮記法が使えないことが判明し
> （6.1）、`blocks/noshi_options.liquid` 側でも Shop Metafield の名前空間に
> 同じアプリ ID を直書きする必要が生じた。**現在アプリ ID を知っているのは 2 ファイル**
> （本スニペットとブロック本体）であり、NFR-03 が求める「単一の場所」を満たしていない。
>
> 1 ファイルに戻せない理由: Liquid の `{% render %}` は変数スコープが独立しており、
> スニペット内で `assign` した値を呼び出し元へ返せない。値を返せる `{% include %}` は
> 非推奨のため採用しない。
>
> **アプリを作り直す際は 2 ファイルとも修正する必要がある**（`grep` でアプリ ID を
> 検索して漏れを防ぐこと）。恒久対応は 7.4 で扱う。

**「熨斗なし」の選択肢を持たない理由**: 熨斗の要否は行ごとのチェックボックスが担う。
選択肢に混ぜると同じ意味の操作が 2 箇所に現れ、どちらが正か分からなくなる。

### 3.4 `assets/noshi-cart.js`

即時実行関数で全体を包み、`window.__noshiCartInitialized` で二重初期化を防ぐ。

#### 3.4.1 定数

| 定数 | 値 | 用途 |
|---|---|---|
| `PROPERTY_KEYS` | `{ title: '表書き', name: '名入れ', type: 'のし種別' }` | line item properties のキー名 |
| `PARENT_KEY_PROPERTY` | `_noshi_parent_key` | 料金行が持つ親行キーの属性名 |
| `FEE_VARIANT_IDS` | `{ noshi, wrap }` | ルート要素の data 属性から取得 |
| `FEE_VARIANT_LIST` | 上記のうち空でないものの配列 | 空配列なら料金行の管理機能を無効化する |

#### 3.4.2 関数一覧

| 関数 | 引数 | 戻り値 | 責務 |
|---|---|---|---|
| `sameVariant(a, b)` | ID 2 つ | boolean | 文字列化して比較（数値と文字列の混在に対応） |
| `isFeeVariant(variantId)` | variant ID | boolean | 料金行の variant かを判定 |
| `lineOf(el)` | 要素 | 要素 \| null | 直近の行要素を辿る |
| `readFields(line)` | 行要素 | `{title, name, type}` | 入力値を読む。熨斗 OFF なら 3 つとも空文字を返す |
| `setBusy(line, busy)` | 行要素, boolean | — | 行内の入力要素を一括で活性／非活性にする |
| `showError(line, msg)` / `clearError(line)` | 行要素, 文字列 | — | 行内のステータス領域にメッセージを表示 |
| `resolveLine(cart, line)` | カート, 行要素 | 商品行 \| null | 対象の商品行を特定（3.4.5） |
| `computeWantedFeeLines(cart)` | カート | 配列 | 「あるべき料金行」を算出 |
| `existingFeeLines(cart)` | カート | 配列 | 現存する料金行を抽出 |
| `findMatch(list, variantId, parentKey)` | 配列, ID, キー | 要素 \| undefined | variant と親キーの両方が一致する要素を探す |
| `reconcileFeeLines(cart)` | カート | `Promise<boolean>` | 料金行の差分を反映（3.4.4）。戻り値は変更の有無 |
| `hideFeeRows(cart)` | カート | — | 料金行を画面から非表示にする |
| `fetchCart()` | — | `Promise<カート>` | `GET /cart.js` |
| `passiveReconcile()` | — | — | 受動整合（非表示化＋差分反映のみ。再読み込みしない） |
| `save(line)` | 行要素 | — | 能動整合（属性更新＋差分反映＋再読み込み） |
| `markDirty(line)` | 行要素 | — | 未保存状態にし、保存ボタンを活性化する |

#### 3.4.3 「あるべき料金行」の算出（`computeWantedFeeLines`）

```
wanted = []
for item in cart.items:
    if isFeeVariant(item.variant_id):        # 料金行自身は対象外
        continue
    if item.properties['表書き'] が空:         # 熨斗なしの行は対象外
        continue
    for variantId in [のし代, 包装料]:
        wanted.push({
            variantId: variantId,
            parentKey: item.key,             # その時点の親行キー
            quantity:  item.quantity         # 親行と同数
        })
```

**保存済みの状態を別途持たず、毎回カートから再計算する**のが本設計の要点。
親行の属性を変更するとキーが変わるため、古いキーを指す料金行は次の算出で
自動的に「不要」と判定される。追跡のための特別な処理を持たない。

#### 3.4.4 差分の算出と反映（`reconcileFeeLines`）

```
wanted   = computeWantedFeeLines(cart)
existing = existingFeeLines(cart)      # カート内のすべての料金行（※1）

toRemove = existing のうち wanted に一致がないもの        → 数量 0（＝削除）
toUpdate = existing のうち wanted に一致があり数量が違うもの → wanted 側の数量へ
toAdd    = wanted   のうち existing に一致がないもの       → 新規追加

# 一致の判定は variantId と parentKey の両方が等しいこと
# ※1 親キーを持たない料金行は parentKey が空 → wanted と決して一致しない
#     → 必ず toRemove に入る（不正に追加された料金行の除去。7.2 参照）

if 3 つとも空:
    return false                        # 通信を発生させない

if toRemove または toUpdate:
    res = POST /cart/update.js { updates: { 行キー: 数量, … } }
    if res が失敗:  throw                # ※2

if toAdd:
    res = POST /cart/add.js { items: [ { id, quantity, properties: { _noshi_parent_key } }, … ] }
    if res が失敗:  throw                # ※2

return true
```

| 操作 | 使用 API | 理由 |
|---|---|---|
| 削除・数量変更 | `/cart/update.js` | 複数行の数量を 1 リクエストでまとめて変更できる。属性は変わらないためこれで足りる |
| 追加 | `/cart/add.js` | `items` 配列で複数行をまとめて追加できる |

**※2 レスポンス検証を必須とする理由**: ブラウザの `fetch` は HTTP 4xx / 5xx を
**エラーとして扱わない**（通信自体が成立していれば成功として解決する）。
検証を省くと、6.2 に挙げた「料金商品が未公開のとき `/cart/add.js` が 422 を返す」ケースで
**料金行が追加されないまま「成功」と判定され、購入者には熨斗が保存された画面が出るのに
のし代・包装料が課金されない**という、要件（FR-07・FR-08）の根幹を崩す壊れ方をする。

`status` フィールドの有無、または HTTP ステータスコードで明示的に判定し、
失敗時は例外として呼び出し元へ伝播させる。呼び出し元の扱いは
[基本設計書 9 章](./02-basic-design.md#9-エラー処理フェイルセーフ方針)に従い、
**能動整合では再読み込みせずエラーを表示**、受動整合ではコンソール出力にとどめて
次の整合契機に委ねる。

> ⚠️ **現在の実装はこのレスポンス検証を行っていない**（既知の不具合。7.1 参照）。

#### 3.4.5 行の特定（`resolveLine`）— 2 段構え

```
1. data-line-key と一致する行をカートから探す        → 見つかればそれ
2. 見つからない場合:
     candidate = cart.items[data-line-index]
     candidate の variant ID が data-variant-id と一致すれば candidate
3. どちらでも取れなければ null → 呼び出し側でページを再読み込み
```

**キーだけに頼ってはいけない理由**: 属性を変更すると行キーが変わる。さらに、
描画された HTML が変更前の状態を返すことがあり、その場合ブロックが保持する
`data-line-key` は既に存在しない古いキーになる。キー照合だけだと
「行が見つからない」と誤判定し、**保存が黙って不発になる**。

第 2 候補が成立する前提は、`data-line-index` が**カート配列上の添字そのもの**であること
（描画順の連番ではない。3.2.3 の警告を参照）。料金行は描画時にスキップされるため
描画順とは一致しないが、添字はカート配列に対応しているので `カート[添字]` で引ける。

variant ID が食い違う場合はカートの内容自体が変わっているため、拾わずに諦める。
この照合があるため、添字がずれていても**無関係な行を誤って更新することはない**。

#### 3.4.6 属性更新時の送信仕様（`save`）

```
POST /cart/change.js
{
  id:         サーバー側で実在を確認した行キー,   ← ブロックが持つキーではない
  quantity:   サーバーから取り直した現在の数量,   ← 省略してはならない
  properties: { 表書き, 名入れ, のし種別 }        ← 常に 3 つまとめて送る
}
```

| 仕様 | 理由 |
|---|---|
| `quantity` を必ず添える | **省略すると数量が黙って 1 に落ちる**。`quantity` だけを送る場合は属性が保たれるという非対称な挙動があり、気付きにくい |
| 数量を `data-quantity` から取らない | テーマ標準の数量変更ボタンは本ブロックの外側だけを描き替えるため、`data-quantity` は容易に古くなる。送信直前に `GET /cart.js` で取り直す |
| 行の指定に `id`（キー）を使う | 行番号は「後から追加した行が先頭」で追加順と一致しない |
| 属性を 3 つまとめて送る | 属性は**全置換**。一部だけ送ると他のキーが消える |

#### 3.4.7 料金行の非表示化（`hideFeeRows`）

```
for (item, index) in cart.items:
    if isFeeVariant(item.variant_id):
        document.getElementById('CartItem-' + (index + 1)).style.display = 'none'
```

Dawn のカート商品行が `CartItem-{連番}` という ID を持つ規則に依存する
（テーマは**読むだけで改変しない**。この依存は CON-08 として明示している）。

**前提**: 取得したカート配列の並び順と、画面に描画済みの行の並び順が一致していること。

> ⚠️ **この前提が崩れると、無関係な商品行を非表示にする。**
> `display:none` を戻す処理を持たないため、**購入者の画面から商品が消える**。
> 料金の加算漏れより症状が重い。
>
> 前提が崩れる具体的な経路: 受動整合（3.4.8）は「カートを取得 → 非表示化 → 差分反映 →
> **再取得 → 再度非表示化**」と進むが、最後の非表示化が対象とする DOM は
> 差分反映**前**に描画されたものである。差分反映で行の追加・削除が起きると
> カート配列の長さと並びが変わるため、添字と DOM 行の対応が崩れる。
>
> **対策方針**: 添字のみで対象を決めず、`data-variant-id` 等で
> 「その DOM 行が本当に料金行か」を照合してから非表示にする。
> 照合できない場合は非表示化を行わない（料金行が見えてしまう方が、
> 商品が消えるより軽微であるため安全側に倒す）。
> 現在の実装は未対応（既知の不具合。7.3 参照）。

#### 3.4.8 イベントバインドと状態遷移

| イベント | 対象 | 動作 |
|---|---|---|
| `change` | `[data-noshi-enabled]` | 入力欄の表示／非表示を切り替え、未保存状態にする |
| `change` | `[data-noshi-field]` | 未保存状態にする |
| `input` | `[data-noshi-field="name"]` | 入力の途中でも未保存状態にする（フォーカスが外れる前に気付けるように） |
| `click` | `[data-noshi-save]` | `save(line)` を実行 |
| DOM 変化 | `#main-cart-items` 配下 | `passiveReconcile()` を実行 |

```
[初期表示]  保存ボタン: 非活性
    │
    ├─ 入力を変更 ──→ [未保存]  保存ボタン: 活性
    │                     │
    │                     ├─ 保存成功 ──→ ページ再読み込み → [初期表示]
    │                     └─ 保存失敗 ──→ [未保存]（入力内容は保持・エラー表示）
```

**再入防止**: 受動整合は `reconciling` フラグで多重実行を防ぐ。
能動整合は `setBusy` で行内の操作を止める。

**DOM 監視方式の選定理由**: テーマ内部のイベント機構は実装詳細に依存するため使わず、
DOM の変化そのものを監視する。整合処理自体は DOM を書き換えず通信のみ行うため、
監視対象への再帰的な発火（無限ループ）は起きない。

### 3.5 `locales/`

| キー | 日本語 |
|---|---|
| `noshi.heading` | 熨斗（のし）のご指定 |
| `noshi.cart_empty` | カートに商品がありません。 |
| `noshi.enable` | 熨斗をつける |
| `noshi.quantity` | 数量 {{ qty }} |
| `noshi.same_for_all` | この商品 {{ qty }} 点すべてに同じ熨斗が付きます。 |
| `noshi.title_label` / `noshi.title_placeholder` | 表書き / 選択してください |
| `noshi.name_label` / `noshi.name_placeholder` | 名入れ / 例: 山田 |
| `noshi.type_label` / `noshi.type_outer` / `noshi.type_inner` | のしの種類 / 外のし / 内のし |
| `noshi.save` | この商品の熨斗を保存 |
| `noshi.error_select_title` | 表書きを選択してください。 |
| `noshi.error_save_failed` | カートを更新できませんでした。時間をおいて再度お試しください。 |

英語版は `en.default.json` に同一キーで定義する。
**プレースホルダの氏名は架空名**を使う（公開ガードレール）。

---

## 4. C-02: noshi-wrap-free（Discount Function）

### 4.1 拡張定義

| 項目 | 値 |
|---|---|
| 種別 | `function` |
| ターゲット | `cart.lines.discounts.generate.run` |
| エクスポート名 | `cart-lines-discounts-generate-run` |
| API バージョン | 2026-07 |
| 実装言語 | TypeScript（WebAssembly にコンパイル） |

### 4.2 入力クエリ

```graphql
query CartInput {
  shop {
    noshiSettings: metafield(namespace: "$app", key: "noshi_settings") {
      jsonValue
    }
  }
  cart {
    cost { subtotalAmount { amount } }
    lines {
      id
      quantity
      merchandise {
        __typename
        ... on ProductVariant { id }
      }
    }
  }
  discount { discountClasses }
}
```

**Function の入力クエリでは `$app:` の短縮記法が使える**（Liquid とは異なる）。

### 4.3 ロジック

```
1. 割引種別に「商品割引」が含まれないなら何もしない
2. 熨斗設定が読めない、または wrapFeeVariantId / freeWrapThreshold が
   期待する型でないなら何もしない
3. 小計 < しきい値 なら何もしない
4. カート行のうち merchandise が包装料の variant である行を抽出
5. 該当行が 0 件なら何もしない
6. 該当行それぞれを 100% 割引の候補にする
   - message: 「包装料無料」
   - targets: [{ cartLine: { id } }]
   - value:   { percentage: { value: 100 } }
7. selectionStrategy: All で全候補を適用
```

**設定値の検証**: `wrapFeeVariantId` が文字列であること、`freeWrapThreshold` が数値であることを
実行時に確認する。型が違う場合は「設定なし」と同じ扱いにして割引を出さない（NFR-04）。

**しきい値の比較を `!(subtotal >= threshold)` と書く理由**: 小計が `NaN` になった場合に
比較結果が `false` になり、`!` を通して「割引しない」側へ倒れる。安全側の挙動になる。

### 4.4 単価を持たない設計

Function は包装料の**金額を一切知らない**。行そのものを 100% 割引にするため、
金額を参照する必要がない。単価の正はダミー商品の Admin 上の価格であり、
Function 側に単価を持たせると二重管理になる。

---

## 5. C-03: Admin UI Extension（未実装・設計のみ）

### 5.1 拡張定義（予定）

| 項目 | 値 |
|---|---|
| ターゲット | `admin.order-details.block.render` |
| 生成コマンド | `shopify app generate extension --template admin_block` |
| 追加スコープ | `write_orders` |
| 前提設定 | `shopify.app.toml` の `[access.admin]` で `direct_api_mode = "online"` かつ `embedded_app_direct_api_access = true`（設定済み）。**この設定がないと 5.2 の「管理 API を直接呼ぶ」設計が成立しない** |

### 5.2 処理設計

```
1. 拡張の data から注文の ID を取得する
   （data はリソース ID の配列のみで、商品行の中身は含まれない）
2. Admin GraphQL API を直接呼び、注文の商品行と属性を取得する
   query { order(id: …) { lineItems { … customAttributes { key value } } } }
3. 熨斗情報（表書き・名入れ・のし種別）を商品ごとのカードとして表示する
4. 訂正値が Order Metafield に存在すれば、元の入力値と併記する
5. 訂正操作は metafieldsSet で Order Metafield に保存する
```

### 5.3 訂正を別データとして持つ理由（FR-18 / CON-05）

注文確定後の商品行の属性を変更する API は存在しない。
注文レベルの属性を更新する mutation はあるが、それは**商品行の属性ではない**。

したがって訂正は「元の入力値を上書きする」のではなく、
**Order Metafield に訂正値を追加で保持し、表示時に併記する**方式とする。

**保持できるのは 2 世代であることに注意**: メタフィールドへの書き込みは上書きであるため、
この方式で残るのは「購入者が入力した原本」と「最新の訂正値」の 2 つだけである。
2 回訂正すれば 1 回目の訂正値は失われる。要件 FR-18 が求めるのは
**訂正前の元の入力値が失われないこと**であり、全訂正履歴の保持ではない（この範囲で足りる）。

全世代の履歴が必要になった場合は、メタフィールドの値を単一値ではなく
訂正の配列として持つ設計へ変更する。

### 5.4 注意事項

| 項目 | 内容 |
|---|---|
| 60 日制限 | Admin GraphQL API は既定で直近 60 日の注文しか参照できない。それ以前を扱うには `read_all_orders` が別途必要。実装時に「直近の注文だけで足りるか」を先に判断する |
| 空属性の表示 | 熨斗を解除した行は属性が空文字で残る。受注画面に「表書き: （空）」が出ないよう、値が空の項目は描画しない |

---

## 6. 実装上の制約・既知の注意点

実装・改修の際に踏みやすい罠を集約する。いずれも実機検証で判明したもの。

### 6.1 Liquid から アプリ所有の Metafield / Metaobject を読む記法

`shop.metafields.app.noshi_settings` および `shop.metafields['$app:noshi_settings']` は
**値を解決せず常に空を返す**。名前空間にアプリ ID を直接指定する記法のみが機能する。

```liquid
{%- comment -%} ✅ 機能する {%- endcomment -%}
shop.metafields['app--{app_id}']['noshi_settings'].value
metaobjects['app--{app_id}--noshi_title'].values

{%- comment -%} ❌ 空を返す {%- endcomment -%}
shop.metafields.app.noshi_settings
shop.metafields['$app:noshi_settings']
```

Metafield 側の設定（ストアフロントからの読み取り許可）は正しくても発生する。
**Function の入力クエリでは `$app:` が使える**ため、経路によって記法が異なる。

### 6.2 料金商品の販売チャネル公開が必須

のし代・包装料の商品を「オンラインストア」チャネルに公開していないと、
`/cart/add.js` が `422` で失敗する。公開には `write_publications` スコープが要る。

以前のバンドル方式ではこの制約がなかったため、独立行方式へ変更した際に新たに顕在化した。

### 6.3 開発時のプレビュー経路

開発サーバー起動中でも、ブラウザで**ストアの本番 URL を直接開くと**
Theme App Extension のアセット URL が古いバージョンを指したまま `404` になることがある。
一度発生すると開発サーバーの再起動や強制リロードでも解消しない。

**開発サーバーが案内するローカルプロキシ経由でストアを開くこと。**
ただしプロキシ経由はカートのセッションが本番ドメインと別になるため、
検証のたびにカートを作り直す必要がある。

具体的な URL と起動コマンドは、環境に依存する運用手順のため
[`docs/spec.md`](../spec.md) の「dev preview での動作確認」に記載する。

### 6.4 属性が完全一致する行は自動的にマージされる

属性を変更した結果、既存の行と属性が完全一致すると、
Shopify が 2 行を 1 行にマージし数量を合算する。仕様どおりの挙動だが、
**行数が減る**ためブロック側の再描画が必要になる（保存後に再読み込みする理由の一つ）。

### 6.5 テーマ側の描画 HTML が遅れて返ることがある

商品行の属性を変更した直後は、サーバーが返す描画用 HTML が変更前の状態を返す。
一方 `GET /cart.js` が返すデータは常に正しい。
**データは即座に正しく、描画用 HTML だけが遅れる**という非対称がある。

数量変更では最新の HTML が返るため、テーマ標準の数量変更ボタンは正常に動作する。
この非対称が原因の切り分けを難しくする。

---

## 7. 既知の不具合

本章は**本設計書が定める仕様と、実装の食い違い**を記録する。
いずれも設計レビュー（2026-08-14）で検出し、同日中に修正・実機通し確認まで完了した
（7.1〜7.3）。7.4 のみ未対応で残っている。

### 7.1 料金行の追加・更新の失敗を検知していない（修正済み・2026-08-14）

| 項目 | 内容 |
|---|---|
| 該当 | `reconcileFeeLines`（3.4.4） |
| 症状 | `/cart/add.js` や `/cart/update.js` が 4xx を返しても成功として扱い、`save` が再読み込みまで進む。**購入者には熨斗が保存された画面が出るが、のし代・包装料が課金されない** |
| 原因 | `fetch` は 4xx を拒否しないため、レスポンスを検証しないと失敗を検知できない。商品行の更新（`/cart/change.js`）だけは検証しており、料金行側のみ無検証という非対称になっている |
| 影響要件 | FR-07・FR-08（請求漏れが起きないこと） |
| あるべき仕様 | 3.4.4 の ※2 |
| 対処 | `checkCartResponse` を追加し、`/cart/update.js`・`/cart/add.js` の両方のレスポンスを検証して失敗時は例外にした。能動整合（`save`）は再読み込みせずエラー表示に倒す（既存の `catch` がそのまま機能する） |
| 実機確認 | のし代商品を一時的に非公開にして 422 を意図的に再現。「カートを更新できませんでした」のエラー表示が出て reload されず、カート合計も課金されないまま（¥2,400）であることを確認した |

### 7.2 不正に追加された料金行が除去されない（修正済み・2026-08-14）

| 項目 | 内容 |
|---|---|
| 該当 | `existingFeeLines`（3.4.4） |
| 症状 | 親キーを持たない料金行が「現存する料金行」の集合に入らず、孤児と判定されない。**除去されないまま画面上では非表示にされるため、購入者から見えない状態で課金される** |
| 経路 | 料金商品は CON-04 によりオンラインストアに公開されている。商品ページの URL を直接開けば誰でもカートに追加できる |
| 影響要件 | FR-11（料金行の保護） |
| あるべき仕様 | 3.4.4 の ※1。親キーの有無で絞り込まず、料金 variant の行はすべて対象にする。親キーを持たない行は `wanted` と一致しないため自動的に除去対象になる |
| 対処 | `existingFeeLines` のフィルタ条件から `_noshi_parent_key` の有無を外し、fee variant の行はすべて拾うようにした。`parentKey` は `\|\| ''` で既定値を与え、空文字は `wanted` と決して一致しないため自動的に `toRemove` へ回る |
| 実機確認 | のし代を親行なしで単独追加し、次のページ読み込み（受動整合）で自動的に除去され、合計金額も変化しないことを確認した |
| 補足 | 独立行方式が構造的に負う弱点であり、[基本設計書 3.2](./02-basic-design.md#32-料金加算方式の選定独立行方式への変更) の代替手段の表に対応する行を設けている |

### 7.3 非表示化が添字のみに依存している（修正済み・2026-08-14）

| 項目 | 内容 |
|---|---|
| 該当 | `hideFeeRows`（3.4.7） |
| 症状 | カート配列の添字と描画済み DOM の並びがずれた場合、**無関係な商品行を `display:none` にする**。復帰処理がないため購入者の画面から商品が消える |
| 経路 | 受動整合の 2 回目の非表示化は、差分反映**前**に描画された DOM を対象にする。差分反映で行が増減すると添字の対応が崩れる |
| 影響要件 | 購入導線そのもの（NFR-04 の趣旨に反する） |
| あるべき仕様 | 3.4.7 の対策方針。`data-variant-id` 等で照合してから非表示にし、照合できなければ非表示化しない |
| 対処 | Dawn の数量入力が持つ `data-quantity-line-key`（`main-cart-items.liquid` で確認。テーマは読むだけで改変していない）で、index が指す DOM 行が本当にその fee 行かを照合してから隠すようにした。一致しない場合は非表示化をスキップする |
| 実機確認 | 数量2→3の変更（Dawn標準の数量+ボタン）で受動整合が2回走る経路を実機で通し、商品行（抹茶）が誤って隠れないこと・fee行の非表示は維持されることを確認した |

### 7.4 アプリ ID が 2 ファイルに分散している（未対応）

| 項目 | 内容 |
|---|---|
| 該当 | `blocks/noshi_options.liquid`・`snippets/noshi-title-options.liquid`（3.3） |
| 症状 | アプリを作り直すと 2 ファイルの修正が必要。片方を忘れると設定値または表書きの選択肢が黙って空になる |
| 原因 | Liquid の短縮記法が使えず（6.1）、`{% render %}` は値を呼び出し元へ返せないため 1 ファイルに寄せられない |
| 影響要件 | NFR-03（設定値の単一管理） |
| 対処 | 現時点では受容し、修正箇所を本書に明記することで代替する。恒久対応するならブロック本体で読んだ設定値を `{% render %}` の引数としてスニペットへ渡す構成に組み替える |

## 8. テスト仕様

### 8.1 単体テスト（Discount Function）

fixture 1 件につきテスト 1 件を自動生成する方式。fixture は
「入力 JSON」と「期待する出力 JSON」を 1 ファイルに持つ。

**検証内容**:

1. 入力クエリがスキーマに適合すること
2. 入力 fixture がスキーマに適合すること
3. 出力 fixture がスキーマに適合すること
4. Function を実行した結果が期待出力と一致すること

**fixture 一覧（7 件）**:

| fixture | 条件 | 期待結果 |
|---|---|---|
| `below-threshold.json` | 小計 2,800（しきい値未満） | 割引なし |
| `above-threshold-with-noshi.json` | 小計 3,000（**しきい値ちょうど**） | 包装料の行を 100% 割引 |
| `above-threshold-quantity-2.json` | 小計 5,600・数量 2 | 包装料の行を 100% 割引 |
| `above-threshold-no-noshi.json` | 小計 5,000・料金行が存在しない | 割引なし |
| `mixed-lines-only-noshi-discounted.json` | 小計 5,000・商品行と料金行が混在 | **包装料の行だけ**割引 |
| `order-class-only.json` | 割引種別が注文割引のみ | 割引なし |
| `settings-missing.json` | 熨斗設定が未投入 | 割引なし |

境界値（しきい値ちょうど）と異常系（設定欠損・割引種別違い）を含める方針とする。

### 8.2 実行方法

```bash
cd extensions/noshi-wrap-free
npm test -- --run
```

fixture とソースの変更を検知して再実行する設定にしている。

### 8.3 CI での実行

| 項目 | 内容 |
|---|---|
| 認証 | **不要**。Function のビルドはローカルの WebAssembly コンパイルであり、ストアへのログインを要求しない |
| ネットワーク | **必要**。初回ビルド時にコンパイラ等のバイナリを外部から取得する。完全オフライン環境では動作しない |
| 実行環境 | **glibc ベースのイメージを使う**（Ubuntu 系など）。musl ベース（Alpine）ではビルド用バイナリが動作しない不具合が過去に発生している |

### 8.4 結合テスト（実機での通し確認）

金額を動かす変更を加えた場合は、[基本設計書 11 章](./02-basic-design.md#11-テスト方針)の
通し確認 8 項目を開発ストアで実行する。**自動テストだけでは属性の表示・料金行の
追随といった画面側の挙動を担保できない**ため、両方を必須とする。
