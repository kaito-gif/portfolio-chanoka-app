import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ORDER_NOSHI_QUERY, SET_NOSHI_CORRECTION_MUTATION, LINE_ITEMS_PAGE_SIZE } from './query.js';
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
  /* 訂正フォームの状態。表示(state)とは別に持つ。編集中は最大1件(同時に複数行を
     編集させると、保存の衝突(後勝ちで前の訂正が消える)を考える必要が出るため避けた)。 */
  const [editing, setEditing] = useState(null); // { lineItemId, draft: {title, name, type} } | null
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = () => {
    setState({ status: 'loading' });
    setEditing(null);
    setSaveError(null);

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

        const corrections = order.noshiCorrection?.jsonValue ?? {};
        const cards = buildNoshiCards(order.lineItems.nodes, corrections);
        const printText = buildPrintText(order.name, cards);
        setState({
          status: 'ready',
          orderId: order.id,
          corrections,
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

  const startEdit = (card) => {
    setSaveError(null);
    setEditing({ lineItemId: card.lineItemId, draft: { ...card.values } });
  };

  const cancelEdit = () => {
    setSaveError(null);
    setEditing(null);
  };

  const updateDraft = (fieldKey, value) => {
    setEditing((prev) => (prev ? { ...prev, draft: { ...prev.draft, [fieldKey]: value } } : prev));
  };

  const saveCorrection = () => {
    if (!editing || state.status !== 'ready') return;

    setSaving(true);
    setSaveError(null);

    const nextCorrections = {
      ...state.corrections,
      [editing.lineItemId]: {
        title: editing.draft.title.trim(),
        name: editing.draft.name.trim(),
        type: editing.draft.type.trim(),
      },
    };

    shopify
      .query(SET_NOSHI_CORRECTION_MUTATION, {
        variables: { ownerId: state.orderId, value: JSON.stringify(nextCorrections) },
      })
      .then((result) => {
        const userErrors = result.data?.metafieldsSet?.userErrors ?? [];
        if ((result.errors && result.errors.length > 0) || userErrors.length > 0) {
          setSaving(false);
          setSaveError(t('correction.saveError'));
          return;
        }

        setSaving(false);
        setEditing(null);
        /* 訂正値を書いた直後の表示を確実に最新化するため、注文をまるごと再取得する。 */
        load();
      })
      .catch(() => {
        setSaving(false);
        setSaveError(t('correction.saveError'));
      });
  };

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
          {state.cards.map((card) => {
            const isEditing = editing?.lineItemId === card.lineItemId;
            return (
              <s-box key={card.lineItemId} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text type="strong">{card.productLabel}</s-text>
                    <s-badge tone="info">{t('quantity', { count: card.quantity })}</s-badge>
                    {card.hasCorrection && (
                      <s-badge tone="attention">{t('correction.badge')}</s-badge>
                    )}
                  </s-stack>

                  {!isEditing &&
                    card.fields.map((f) => (
                      <s-stack key={f.i18nKey} direction="inline" gap="base">
                        <s-text color="subdued">{t(`field.${f.i18nKey}`)}</s-text>
                        <s-text>{f.value}</s-text>
                      </s-stack>
                    ))}

                  {!isEditing && (
                    <s-button
                      variant="tertiary"
                      onClick={() => startEdit(card)}
                      disabled={editing !== null}
                    >
                      {t('correction.edit')}
                    </s-button>
                  )}

                  {isEditing && (
                    <s-stack direction="block" gap="small-200">
                      <s-text-field
                        label={t('field.title')}
                        value={editing.draft.title}
                        onInput={(e) => updateDraft('title', e.currentTarget.value)}
                      />
                      <s-text-field
                        label={t('field.name')}
                        value={editing.draft.name}
                        onInput={(e) => updateDraft('name', e.currentTarget.value)}
                      />
                      <s-text-field
                        label={t('field.type')}
                        value={editing.draft.type}
                        onInput={(e) => updateDraft('type', e.currentTarget.value)}
                      />
                      {saveError && (
                        <s-banner tone="critical">
                          <s-paragraph>{saveError}</s-paragraph>
                        </s-banner>
                      )}
                      <s-stack direction="inline" gap="base">
                        <s-button variant="primary" onClick={saveCorrection} loading={saving}>
                          {t('correction.save')}
                        </s-button>
                        <s-button variant="tertiary" onClick={cancelEdit} disabled={saving}>
                          {t('correction.cancel')}
                        </s-button>
                      </s-stack>
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            );
          })}

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
