import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";
import type {
  CustomizationCropRegion,
  CustomizationValues,
} from "../domain/customization-value.ts";

export interface OrderCustomizationUploadReference {
  readonly fieldId: string;
  readonly fieldCode: string;
  readonly imagePosition: number;
  readonly receiptId: string;
  readonly crop?: CustomizationCropRegion;
}

export interface OrderCustomizationCompatibilityProjection {
  readonly customerInput: {
    readonly configurationRevision: string;
    readonly values: CustomizationValues;
  };
  readonly uploadReferences: readonly OrderCustomizationUploadReference[];
}

function cloneValues(values: CustomizationValues): CustomizationValues {
  return values.map((value) => {
    if (value.kind !== "image") return { ...value };
    return {
      ...value,
      images: value.images.map((image) => ({
        ...image,
        ...(image.crop ? { crop: { ...image.crop } } : {}),
      })),
    };
  });
}

function createUploadReferences(
  values: CustomizationValues,
): readonly OrderCustomizationUploadReference[] {
  const references: OrderCustomizationUploadReference[] = [];
  for (const value of values) {
    if (value.kind !== "image") continue;
    value.images.forEach((image, imagePosition) => {
      references.push({
        fieldId: value.fieldId,
        fieldCode: value.fieldCode,
        imagePosition,
        receiptId: image.receiptId,
        ...(image.crop ? { crop: { ...image.crop } } : {}),
      });
    });
  }
  return references;
}

/**
 * Projects one already accepted handoff into the narrow customer-input
 * compatibility shape consumed by later order-boundary work. It performs no
 * authority checks and has no persistence or external-service capability.
 */
export function mapConfiguredItemToOrderCustomizationCompatibility(
  handoff: ConfiguredItemHandoff,
): OrderCustomizationCompatibilityProjection {
  const values = cloneValues(handoff.customizationValues);
  return {
    customerInput: {
      configurationRevision: handoff.configurationRevision,
      values,
    },
    uploadReferences: createUploadReferences(values),
  };
}
