import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  ProductDiscountCandidate,
} from "../generated/api";

/**
 * 包装料が無料になる小計のしきい値。
 *
 * TODO: variant ID や単価と同じく、アプリ側の設定へ移す。
 * リスク4の検証を通すための暫定措置。
 */
const FREE_WRAP_THRESHOLD = 3000;

/** 包装料の単価。Cart Transform 側と同じ値を持たせている。 */
const WRAP_FEE_AMOUNT = 300;

const NO_CHANGES: CartLinesDiscountsGenerateRunResult = { operations: [] };

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return NO_CHANGES;
  }

  const subtotal = Number(input.cart.cost.subtotalAmount.amount);
  if (!(subtotal >= FREE_WRAP_THRESHOLD)) {
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
        fixedAmount: { amount: WRAP_FEE_AMOUNT, appliesToEachItem: true },
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
