import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  ProductDiscountCandidate,
} from "../generated/api";

/**
 * shop metafield `$app:noshi_settings`（shopify.app.toml で定義）の値の形。
 * noshi-fee（Cart Transform）と同じ設定を共有する。
 * しきい値・単価はストアごとに違うためコードに直書きしない。
 */
type NoshiSettings = {
  wrapFeeAmount: string;
  freeWrapThreshold: number;
};

function readNoshiSettings(input: CartInput): NoshiSettings | null {
  const value = input.shop.noshiSettings?.jsonValue as
    | Partial<NoshiSettings>
    | null
    | undefined;

  if (
    !value ||
    typeof value.wrapFeeAmount !== "string" ||
    typeof value.freeWrapThreshold !== "number"
  ) {
    return null;
  }

  return value as NoshiSettings;
}

const NO_CHANGES: CartLinesDiscountsGenerateRunResult = { operations: [] };

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return NO_CHANGES;
  }

  const settings = readNoshiSettings(input);
  // 設定が未投入・壊れている場合は割引を出さない（cart-transform 側と同じ考え方）。
  if (!settings) {
    return NO_CHANGES;
  }

  const subtotal = Number(input.cart.cost.subtotalAmount.amount);
  if (!(subtotal >= settings.freeWrapThreshold)) {
    return NO_CHANGES;
  }

  // Discount Function から見えるのは Cart Transform で expand されたあとの
  // バンドル行であり、のし代・包装料のコンポーネントを個別には狙えない。
  // そのため「包装料の分だけ固定額をバンドル行から引く」形で無料を表現する。
  const candidates: ProductDiscountCandidate[] = input.cart.lines
    .filter((line) => Boolean(line.noshiTitle?.value?.trim()))
    .map((line) => ({
      message: "包装料無料",
      targets: [{ cartLine: { id: line.id } }],
      value: {
        // appliesToEachItem: true で、数量分の包装料をまとめて相殺する。
        fixedAmount: {
          amount: Number(settings.wrapFeeAmount),
          appliesToEachItem: true,
        },
      },
    }));

  if (candidates.length === 0) {
    return NO_CHANGES;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
