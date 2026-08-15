import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

/*
 * キー名は extensions/noshi-cart/assets/noshi-cart.js と
 * extensions/noshi-order-block/src/noshi.js の NOSHI_KEYS と一致していなければならない。
 * カート側の line item properties がそのまま Customer Account API の
 * CartLine.attributes に載る想定で、3箇所で同じキー名を使っている。
 */
const NOSHI_KEYS = {
  title: '表書き',
  name: '名入れ',
  type: 'のし種別',
};

function Extension() {
  const {i18n} = shopify;
  const t = (key) => i18n.translate(key);

  /*
   * このターゲット(cart-line-item.render-after)は商品行ごとに1回ずつレンダリングされる。
   * shopify.target がこの拡張が紐づく行そのものを返す(Order全体ではない)。
   */
  const line = shopify.target.value;

  const attrs = {};
  for (const attr of line.attributes ?? []) {
    attrs[attr.key] = attr.value ?? '';
  }

  const title = (attrs[NOSHI_KEYS.title] ?? '').trim();
  /* 主判定: 表書きが空の行は熨斗なしの商品行、または料金行そのもの。何も描画しない。
     構成要素#5(noshi-order-block)と同じ判定をここでも踏襲する。 */
  if (!title) {
    return null;
  }

  const name = (attrs[NOSHI_KEYS.name] ?? '').trim();
  const type = (attrs[NOSHI_KEYS.type] ?? '').trim();

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text type="strong">{t('heading')}</s-text>
        <s-stack direction="inline" gap="base">
          <s-text color="subdued">{t('field.title')}</s-text>
          <s-text>{title}</s-text>
        </s-stack>
        {name && (
          <s-stack direction="inline" gap="base">
            <s-text color="subdued">{t('field.name')}</s-text>
            <s-text>{name}</s-text>
          </s-stack>
        )}
        {type && (
          <s-stack direction="inline" gap="base">
            <s-text color="subdued">{t('field.type')}</s-text>
            <s-text>{type}</s-text>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}
