import {
  parseCustomizationCropRegion,
  type CustomizationCropRegion,
} from "../domain/customization-value.ts";

/** Percent strings are local editor presentation state; draft values remain normalized. */
export interface ProductCustomizationCropEditorValues {
  readonly x: string;
  readonly y: string;
  readonly width: string;
  readonly height: string;
}

function toPercentageString(value: number): string {
  return String(value * 100);
}

function parsePercentage(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "." ? Number.NaN : Number(trimmed) / 100;
}

export function createProductCustomizationCropEditorValues(
  crop?: CustomizationCropRegion,
): ProductCustomizationCropEditorValues {
  const region = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: toPercentageString(region.x),
    y: toPercentageString(region.y),
    width: toPercentageString(region.width),
    height: toPercentageString(region.height),
  };
}

/** Delegates all normalized shape and bounds authority to the existing domain parser. */
export function parseProductCustomizationCropEditorValues(
  values: ProductCustomizationCropEditorValues,
) {
  return parseCustomizationCropRegion({
    x: parsePercentage(values.x),
    y: parsePercentage(values.y),
    width: parsePercentage(values.width),
    height: parsePercentage(values.height),
  });
}

export type ProductCustomizationCropPointerMode = "move" | "resize";

/**
 * Converts pointer movement to the same normalized crop facts consumed by the
 * domain parser and trusted server renderer. Invalid geometry is a no-op.
 */
export function applyProductCustomizationCropPointerDelta(input: {
  readonly crop: CustomizationCropRegion;
  readonly mode: ProductCustomizationCropPointerMode;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly boundsWidth: number;
  readonly boundsHeight: number;
}): CustomizationCropRegion {
  if (![input.deltaX, input.deltaY, input.boundsWidth, input.boundsHeight].every(Number.isFinite)
    || input.boundsWidth <= 0 || input.boundsHeight <= 0) return input.crop;
  const dx = input.deltaX / input.boundsWidth;
  const dy = input.deltaY / input.boundsHeight;
  const minimum = 0.02;
  const candidate = input.mode === "move"
    ? {
        ...input.crop,
        x: Math.min(Math.max(0, input.crop.x + dx), 1 - input.crop.width),
        y: Math.min(Math.max(0, input.crop.y + dy), 1 - input.crop.height),
      }
    : {
        ...input.crop,
        width: Math.min(Math.max(minimum, input.crop.width + dx), 1 - input.crop.x),
        height: Math.min(Math.max(minimum, input.crop.height + dy), 1 - input.crop.y),
      };
  const parsed = parseCustomizationCropRegion(candidate);
  return parsed.ok ? parsed.value : input.crop;
}
