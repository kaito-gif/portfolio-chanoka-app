/* line item のページサイズ。Admin API の上限は 250 だが、熨斗が絡む注文(贈答用)は
   そもそも行数が少ないため、1往復で足りる想定で 100 に設定する。
   超えた場合は pageInfo.hasNextPage を見て警告バナーを出す(黙って切り捨てない)。
   カーソルで追加取得する実装が要る場合は、ここに after 引数を足す。 */
export const LINE_ITEMS_PAGE_SIZE = 100;

export const ORDER_NOSHI_QUERY = `
  query OrderNoshi($id: ID!, $first: Int!) {
    order(id: $id) {
      id
      name
      noshiCorrection: metafield(namespace: "$app", key: "noshi_correction") {
        jsonValue
      }
      lineItems(first: $first) {
        nodes {
          id
          title
          variantTitle
          quantity
          image {
            url
            altText
          }
          customAttributes {
            key
            value
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  }
`;

/*
 * FR-18(受注後の訂正)。訂正値は line item 単位ではなく Order metafield に
 * 「lineItemId をキーにした訂正値のJSON」としてまとめて持つ(詳細設計 5.3)。
 * 1行訂正するだけでも、既存の訂正値とマージしたオブジェクト全体を書き直す。
 */
export const SET_NOSHI_CORRECTION_MUTATION = `
  mutation SetNoshiCorrection($ownerId: ID!, $value: String!) {
    metafieldsSet(metafields: [
      { ownerId: $ownerId, key: "noshi_correction", type: "json", value: $value }
    ]) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;
