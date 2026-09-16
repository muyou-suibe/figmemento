import type { ImageCustomizationFieldConstraints } from "./customization-field.ts";
import type { CustomizationResolvedImageMetadata } from "./customization-validation.ts";

/**
 * A deterministic statement about configured image dimensions only. It is not
 * an assessment of visual quality, print suitability, or image content.
 */
export type CustomizationImageDimensionState =
  | "below_minimum"
  | "below_recommended"
  | "meets_recommendation";

export interface CustomizationImageDimensionClassification {
  state: CustomizationImageDimensionState;
}

type TrustedImageDimensions = Pick<
  CustomizationResolvedImageMetadata,
  "width" | "height"
>;

function isBelow(
  image: TrustedImageDimensions,
  threshold: { width: number; height: number },
): boolean {
  return image.width < threshold.width || image.height < threshold.height;
}

/**
 * Classifies only trusted decoded width and height against parsed field
 * thresholds. Callers must validate the image metadata and field configuration
 * before invoking this pure helper.
 */
export function classifyCustomizationImageDimensions(
  constraints: ImageCustomizationFieldConstraints,
  image: TrustedImageDimensions,
): CustomizationImageDimensionClassification {
  if (isBelow(image, constraints.minDimensions)) {
    return { state: "below_minimum" };
  }

  if (
    constraints.recommendedDimensions !== undefined
    && isBelow(image, constraints.recommendedDimensions)
  ) {
    return { state: "below_recommended" };
  }

  return { state: "meets_recommendation" };
}
