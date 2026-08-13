import type {
  CartTransformRunInput,
  CartTransformRunResult,
  ExpandedItem,
  Operation,
} from "../generated/api";

/**
 * のし代・包装料のダミー商品の variant ID。
 *
 * TODO: ストアごとに値が違うため、ここに直接書いたままにはしない。
 * アプリ側の設定（Metafield か Metaobject）へ移し、入力クエリで読む。
 * リスク1の検証を通すための暫定措置。
 */
const NOSHI_FEE_VARIANT_ID = "gid://shopify/ProductVariant/52828643590461";
const WRAP_FEE_VARIANT_ID = "gid://shopify/ProductVariant/52828643655997";

/** のし代・包装料の単価。variant 側の価格と同じ値を明示的に与えている。 */
const NOSHI_FEE_AMOUNT = "100";
const WRAP_FEE_AMOUNT = "300";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function cartTransformRun(
  input: CartTransformRunInput,
): CartTransformRunResult {
  const operations = input.cart.lines
    .map(buildExpandOperation)
    .filter((operation): operation is Operation => operation !== null);

  return operations.length > 0 ? { operations } : NO_CHANGES;
}

function buildExpandOperation(
  line: CartTransformRunInput["cart"]["lines"][number],
): Operation | null {
  // 熨斗の指定がない行は触らない。
  const noshiTitle = line.noshiTitle?.value?.trim();
  if (!noshiTitle) {
    return null;
  }

  // 商品以外（ギフトカード等）は対象外。
  if (line.merchandise.__typename !== "ProductVariant") {
    return null;
  }

  // expand の各コンポーネントの数量は「親1個あたり」であり、
  // 行の数量が掛かる。数量2の行なら のし代・包装料 も2つ分になる。
  // 価格は「全コンポーネントに fixedPricePerUnit を与える」か「1つも与えない」かの
  // どちらかにする。一部だけ与えると親商品の価格にフォールバックし、
  // のし代・包装料が加算されない。
  // 参照: Cart Transform Function API の Pricing adjustments
  //   "lineExpand: The final price is the sum of the individual component
  //    fixedPricePerUnit values, or the bundle product price, plus the adjustment"
  // そのため、親の単価も入力クエリから取って明示的に echo している。
  const expandedCartItems: ExpandedItem[] = [
    {
      merchandiseId: line.merchandise.id,
      quantity: 1,
      price: {
        adjustment: {
          fixedPricePerUnit: { amount: line.cost.amountPerQuantity.amount },
        },
      },
    },
    {
      merchandiseId: NOSHI_FEE_VARIANT_ID,
      quantity: 1,
      price: { adjustment: { fixedPricePerUnit: { amount: NOSHI_FEE_AMOUNT } } },
    },
    {
      merchandiseId: WRAP_FEE_VARIANT_ID,
      quantity: 1,
      price: { adjustment: { fixedPricePerUnit: { amount: WRAP_FEE_AMOUNT } } },
    },
  ];

  return {
    lineExpand: {
      cartLineId: line.id,
      expandedCartItems,
    },
  };
}
