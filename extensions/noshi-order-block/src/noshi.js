/*
 * 熨斗情報の判定・整形ロジック(純粋関数)。
 *
 * ■ キー名は extensions/noshi-cart/assets/noshi-cart.js と一致していなければならない
 * カート側(購入者の入力)と受注側(本ファイル)は別の拡張だが、同じ line item properties を
 * 読み書きする。キー名がずれると「片方だけ直して表示が黙って消える」事故になる。
 * 変更するときは両方のファイルを同時に直すこと。
 */
export const NOSHI_KEYS = {
  title: '表書き',
  name: '名入れ',
  type: 'のし種別',
};

/* fee 行(のし代・包装料)を親行に紐付けるための隠しプロパティ。
   noshi-cart.js が付与する。除外の判定にだけ使う(3.4.4 のコメント参照)。 */
export const PARENT_KEY_PROPERTY = '_noshi_parent_key';

/*
 * 注文の line item から熨斗カードを組み立てる。
 *
 * ■ 料金行(のし代・包装料)を除外するために shop metafield を引かない設計判断
 * のし代・包装料は注文にも独立した line item として載るが、それらは `_noshi_parent_key`
 * しか持たず「表書き」を持たない。したがって「表書きが空でない行だけ拾う」という
 * 主判定だけで、料金行の除外を兼ねられる。variant ID を shop metafield と突き合わせる
 * 方式は、metafield が読めない/未設定のときにカード表示そのものが壊れるため採らない
 * (表示機能が設定値に依存する筋の悪さ)。アプリ ID をこの拡張に持ち込まずに済む副産物もある。
 *
 * corrections は FR-18(受注後の訂正)の受け皿。今回は常に {} を渡す。
 * lineItemId をキーに { 表書き, 名入れ, のし種別 } を持たせる想定。
 */
export function buildNoshiCards(lineItemNodes, corrections = {}) {
  const cards = [];

  for (const item of lineItemNodes || []) {
    const attrs = {};
    for (const { key, value } of item.customAttributes || []) {
      attrs[key] = value ?? '';
    }

    /* 保険: 親キーを持つ行(fee 行)は表書きを持たないはずだが、念のため明示的にスキップする。 */
    if (Object.prototype.hasOwnProperty.call(attrs, PARENT_KEY_PROPERTY)) {
      continue;
    }

    const correction = corrections[item.id] || null;
    const title = (correction?.title ?? attrs[NOSHI_KEYS.title] ?? '').trim();

    /* 主判定: 表書きが空の行は「熨斗なし」の商品行、または料金行そのもの。カードにしない。 */
    if (!title) {
      continue;
    }

    const name = (correction?.name ?? attrs[NOSHI_KEYS.name] ?? '').trim();
    const type = (correction?.type ?? attrs[NOSHI_KEYS.type] ?? '').trim();

    const fields = [
      { i18nKey: 'title', value: title },
      { i18nKey: 'name', value: name },
      { i18nKey: 'type', value: type },
    ].filter((f) => f.value !== ''); // 値が空の項目は描画しない(「表書き: （空）」を出さない)

    cards.push({
      lineItemId: item.id,
      productLabel: [item.title, item.variantTitle].filter(Boolean).join(' / '),
      quantity: item.quantity,
      imageUrl: item.image?.url ?? null,
      fields,
      hasCorrection: Boolean(correction),
    });
  }

  return cards;
}

/*
 * FR-17: 印字用テキストを組み立てる。
 *
 * 値・ラベルとも日本語のリテラル固定(保存値をそのまま出す)。UI ラベルだけが
 * i18n で翻訳されるのに対し、この本文は常に日本語という非対称がある。
 * 受注側が読む印字用データの表記を、言語設定によらず一定に保つため(NFR-08)。
 */
export function buildPrintText(orderName, cards) {
  if (!cards || cards.length === 0) {
    return '';
  }

  const FIELD_LABELS = { title: '表書き', name: '名入れ', type: 'のし種別' };

  const blocks = cards.map((card, index) => {
    const heading = `${index + 1}) ${card.productLabel} / 数量 ${card.quantity}`;
    const lines = card.fields.map((f) => `   ${FIELD_LABELS[f.i18nKey]}: ${f.value}`);
    return [heading, ...lines].join('\n');
  });

  const header = `${orderName} 熨斗指示 ${cards.length}件`;
  return [header, '', blocks.join('\n\n')].join('\n');
}
