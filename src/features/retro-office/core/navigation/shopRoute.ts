import { getItemBaseSize } from "@/features/retro-office/core/geometry";
import type {
  FacingPoint,
  FurnitureItem,
  ShopRoute,
} from "@/features/retro-office/core/types";

export const SHOP_TARGET: FacingPoint = {
  x: 80,
  y: 415,
  facing: Math.PI / 2,
};

export const resolveShopRoute = (
  item: FurnitureItem | null | undefined,
  x: number,
  y: number,
): ShopRoute => {
  if (!item) {
    return {
      stage: "counter",
      targetX: SHOP_TARGET.x,
      targetY: SHOP_TARGET.y,
      facing: SHOP_TARGET.facing,
    };
  }
  const { width, height } = getItemBaseSize(item);
  const centerY = item.y + height / 2;
  const approachTarget = {
    x: item.x - 28,
    y: centerY,
    facing: Math.PI / 2,
  };
  const counterTarget = {
    x: item.x + width * 0.4,
    y: centerY,
    facing: Math.PI / 2,
  };

  const atCounter =
    x >= approachTarget.x - 6 || Math.hypot(x - approachTarget.x, y - approachTarget.y) < 18;
  if (atCounter) {
    return {
      stage: "counter",
      targetX: counterTarget.x,
      targetY: counterTarget.y,
      facing: counterTarget.facing,
    };
  }

  return {
    stage: "approach",
    targetX: approachTarget.x,
    targetY: approachTarget.y,
    facing: approachTarget.facing,
  };
};
