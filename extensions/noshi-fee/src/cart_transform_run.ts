import type {
  CartTransformRunInput,
  CartTransformRunResult,
  ExpandedItem,
  Operation,
} from "../generated/api";

/**
 * shop metafield `$app:noshi_settings`（shopify.app.toml で定義）の値の形。
 * noshi-wrap-free（Discount Function）と同じ設定を共有する。
 * variant ID・単価はストアごとに違うためコードに直書きしない。
 */
type NoshiSettings = {
  noshiFeeVariantId: string;
  wrapFeeVariantId: string;
  noshiFeeAmount: string;
  wrapFeeAmount: string;
};

function readNoshiSettings(
  input: CartTransformRunInput,
): NoshiSettings | null {
  const value = input.shop.noshiSettings?.jsonValue as
    | Partial<NoshiSettings>
    | null
    | undefined;

  if (
    !value ||
    typeof value.noshiFeeVariantId !== "string" ||
    typeof value.wrapFeeVariantId !== "string" ||
    typeof value.noshiFeeAmount !== "string" ||
    typeof value.wrapFeeAmount !== "string"
  ) {
    return null;
  }

  return value as NoshiSettings;
}

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function cartTransformRun(
  input: CartTransformRunInput,
): CartTransformRunResult {
  const settings = readNoshiSettings(input);
  // 設定が未投入・壊れている場合は何もしない（blockOnFailure: false と同じ考え方で、
  // カートは通す代わりに のし・包装料は加算しない）。
  if (!settings) {
    return NO_CHANGES;
  }

  const operations = input.cart.lines
    .map((line) => buildExpandOperation(line, settings))
    .filter((operation): operation is Operation => operation !== null);

  return operations.length > 0 ? { operations } : NO_CHANGES;
}

function buildExpandOperation(
  line: CartTransformRunInput["cart"]["lines"][number],
  settings: NoshiSettings,
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
      merchandiseId: settings.noshiFeeVariantId,
      quantity: 1,
      price: {
        adjustment: { fixedPricePerUnit: { amount: settings.noshiFeeAmount } },
      },
    },
    {
      merchandiseId: settings.wrapFeeVariantId,
      quantity: 1,
      price: {
        adjustment: { fixedPricePerUnit: { amount: settings.wrapFeeAmount } },
      },
    },
  ];

  return {
    lineExpand: {
      cartLineId: line.id,
      expandedCartItems,
    },
  };
}
