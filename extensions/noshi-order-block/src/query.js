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
 * FR-18(受注後の訂正)を実装するときは、上のクエリに
 *   order {
 *     noshiCorrection: metafield(namespace: "$app", key: "noshi_correction") { jsonValue }
 *   }
 * を足して order 直下から訂正値を読み、buildNoshiCards の corrections 引数へ渡す。
 * Admin GraphQL では $app: が使える(Liquid だけが使えない。詳細設計 6.1 参照)。
 * 書き込みは metafieldsSet + write_orders スコープ(詳細設計 5.3)。
 */
