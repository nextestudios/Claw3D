import { SHOPPING_ZONE } from "@/features/retro-office/core/district";
import { getItemBaseSize } from "@/features/retro-office/core/geometry";
import type {
  FacingPoint,
  FurnitureItem,
  ShopRoute,
} from "@/features/retro-office/core/types";

export const SHOP_ENTRY_TARGET: FacingPoint = {
  x: 900,
  y: SHOPPING_ZONE.minY + 40,
  facing: 0,
};

export const SHOP_AISLE_TARGET: FacingPoint = {
  x: 980,
  y: 910,
  facing: 0,
};

export const SHOP_TARGET: FacingPoint = {
  x: 180,
  y: 920,
  facing: 0,
};

export const resolveShopRoute = (
  item: FurnitureItem | null | undefined,
  x: number,
  y: number,
): ShopRoute => {
  if (!item) {
    return {
      stage: "checkout",
      targetX: SHOP_TARGET.x,
      targetY: SHOP_TARGET.y,
      facing: SHOP_TARGET.facing,
    };
  }
  const { width, height } = getItemBaseSize(item);
  const checkoutTarget = {
    x: item.x + width / 2,
    y: item.y + height + 44,
    facing: 0,
  };
  const closeToCheckout =
    Math.hypot(x - checkoutTarget.x, y - checkoutTarget.y) < 44;
  if (closeToCheckout) {
    return {
      stage: "checkout",
      targetX: checkoutTarget.x,
      targetY: checkoutTarget.y,
      facing: checkoutTarget.facing,
    };
  }

  const closeToAisle =
    y >= SHOPPING_ZONE.minY + 70 &&
    Math.hypot(x - SHOP_AISLE_TARGET.x, y - SHOP_AISLE_TARGET.y) < 90;
  if (closeToAisle) {
    return {
      stage: "checkout",
      targetX: checkoutTarget.x,
      targetY: checkoutTarget.y,
      facing: checkoutTarget.facing,
    };
  }

  const enteredStore =
    y >= SHOP_ENTRY_TARGET.y - 10 ||
    Math.hypot(x - SHOP_ENTRY_TARGET.x, y - SHOP_ENTRY_TARGET.y) < 70;
  if (enteredStore) {
    return {
      stage: "aisle",
      targetX: SHOP_AISLE_TARGET.x,
      targetY: SHOP_AISLE_TARGET.y,
      facing: SHOP_AISLE_TARGET.facing,
    };
  }

  return {
    stage: "entrance",
    targetX: SHOP_ENTRY_TARGET.x,
    targetY: SHOP_ENTRY_TARGET.y,
    facing: SHOP_ENTRY_TARGET.facing,
  };
};
