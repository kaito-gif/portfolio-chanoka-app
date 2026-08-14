import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  ProductDiscountCandidate,
} from "../generated/api";

/**
 * shop metafield `$app:noshi_settings`（shopify.app.toml で定義）の値の形。
 * noshi-cart（Theme App Extension）と同じ設定を共有する。
 * variant ID・しきい値はストアごとに違うためコードに直書きしない。
 *
 * 2026-08-14: Cart Transform expand を廃止し、のし代・包装料を独立したカート行に
 * 変更したのに合わせて、単価（旧 wrapFeeAmount）は読まなくなった。包装料の行自体を
 * percentage 100% で直接ターゲットするため、単価を知る必要がない。単価の正は
 * ダミー商品（包装料）の Admin 上の variant 価格。
 */
type NoshiSettings = {
  wrapFeeVariantId: string;
  freeWrapThreshold: number;
};

function readNoshiSettings(input: CartInput): NoshiSettings | null {
  const value = input.shop.noshiSettings?.jsonValue as
    | Partial<NoshiSettings>
    | null
    | undefined;

  if (
    !value ||
    typeof value.wrapFeeVariantId !== "string" ||
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

  // のし代・包装料は独立したカート行なので、包装料の行そのものを直接ターゲットできる。
  // percentage 100% で全額オフにすれば「包装料無料」になり、割引が茶葉・のし代へ
  // 按分される問題（旧: バンドル行への固定額割引で発生していた）が起きない。
  const candidates: ProductDiscountCandidate[] = input.cart.lines
    .filter(
      (line) =>
        line.merchandise.__typename === "ProductVariant" &&
        line.merchandise.id === settings.wrapFeeVariantId,
    )
    .map((line) => ({
      message: "包装料無料",
      targets: [{ cartLine: { id: line.id } }],
      value: {
        percentage: { value: 100 },
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
