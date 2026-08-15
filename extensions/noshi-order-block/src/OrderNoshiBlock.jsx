import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ORDER_NOSHI_QUERY, LINE_ITEMS_PAGE_SIZE } from './query.js';
import { buildNoshiCards, buildPrintText } from './noshi.js';

export default async () => {
  render(<OrderNoshiBlock />, document.body);
};

/*
 * 状態遷移: loading → (error | empty | ready)
 *
 * ■ 「await してから render」ではなく、即座に render してコンポーネント内で fetch する
 * ドキュメントの標準例は関数全体を async にして取得完了後に一度だけ render するが、
 * それだと (1) 取得中は画面に何も描かれず、マーチャントには「ブロックが壊れている」ように
 * 見える、(2) 失敗時に再試行ボタンを出すための状態を持てない。あえてここでは即 render し、
 * コンポーネント内の useEffect で取得する。
 */
function OrderNoshiBlock() {
  const { i18n, data } = shopify;
  const t = (key, vars) => i18n.translate(key, vars);

  const [state, setState] = useState({ status: 'loading' });

  const load = () => {
    setState({ status: 'loading' });

    const orderId = data?.selected?.[0]?.id;
    if (!orderId) {
      setState({ status: 'error', reason: 'generic' });
      return;
    }

    shopify
      .query(ORDER_NOSHI_QUERY, { variables: { id: orderId, first: LINE_ITEMS_PAGE_SIZE } })
      .then((result) => {
        if (result.errors && result.errors.length > 0) {
          const accessDenied = result.errors.some(
            (e) => e.extensions?.code === 'ACCESS_DENIED'
          );
          setState({ status: 'error', reason: accessDenied ? 'access' : 'generic' });
          return;
        }

        const order = result.data?.order;
        if (!order) {
          /* 60日より前で参照できない、または注文が見つからない。 */
          setState({ status: 'error', reason: 'notFound' });
          return;
        }

        const cards = buildNoshiCards(order.lineItems.nodes);
        const printText = buildPrintText(order.name, cards);
        setState({
          status: 'ready',
          cards,
          printText,
          truncated: order.lineItems.pageInfo.hasNextPage,
        });
      })
      .catch(() => {
        setState({ status: 'error', reason: 'generic' });
      });
  };

  useEffect(load, []);

  return (
    <s-admin-block
      heading={t('heading')}
      collapsedSummary={
        state.status === 'ready' ? t('summary', { count: state.cards.length }) : undefined
      }
    >
      {state.status === 'loading' && (
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-spinner accessibilityLabel={t('loading')} size="small-200" />
          <s-text>{t('loading')}</s-text>
        </s-stack>
      )}

      {state.status === 'error' && (
        <s-banner heading={t('error.heading')} tone="critical">
          <s-paragraph>{t(`error.${state.reason}`)}</s-paragraph>
          <s-button slot="primary-action" onClick={load}>
            {t('error.retry')}
          </s-button>
        </s-banner>
      )}

      {state.status === 'ready' && state.cards.length === 0 && (
        <s-paragraph>{t('empty')}</s-paragraph>
      )}

      {state.status === 'ready' && state.cards.length > 0 && (
        <s-stack direction="block" gap="base">
          {state.cards.map((card) => (
            <s-box key={card.lineItemId} padding="base" border="base" borderRadius="base">
              <s-stack direction="block" gap="small-200">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text type="strong">{card.productLabel}</s-text>
                  <s-badge tone="info">{t('quantity', { count: card.quantity })}</s-badge>
                </s-stack>
                {card.fields.map((f) => (
                  <s-stack key={f.i18nKey} direction="inline" gap="base">
                    <s-text color="subdued">{t(`field.${f.i18nKey}`)}</s-text>
                    <s-text>{f.value}</s-text>
                  </s-stack>
                ))}
              </s-stack>
            </s-box>
          ))}

          <s-divider />

          <s-text-area
            label={t('print.label')}
            details={t('print.help')}
            value={state.printText}
            readOnly
            rows={Math.min(state.printText.split('\n').length + 1, 16)}
          />

          {state.truncated && <s-banner tone="warning">{t('warning.truncated')}</s-banner>}
        </s-stack>
      )}
    </s-admin-block>
  );
}
