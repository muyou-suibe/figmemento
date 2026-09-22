/** Advisory inspection vocabulary. Never a purchase, receipt or upload-admission authority. */
export interface CustomerImageClarityGuidance {
  readonly profileVersion: "local-clarity-v1";
  readonly state: "clear" | "soft_warning" | "strong_warning" | "inconclusive" | "unavailable";
}

/** Future model capabilities remain explicitly unactivated until licensed local models exist. */
export interface CustomerImageModelGuidance {
  readonly status: "not_activated" | "unavailable";
  readonly pose?: "frontal" | "pose_risk" | "inconclusive" | "not_applicable";
  readonly occlusion?: "clear" | "occlusion_risk" | "inconclusive" | "not_applicable";
  readonly personCount?: "match" | "mismatch" | "inconclusive" | "not_applicable";
}

export const UNACTIVATED_IMAGE_MODEL_GUIDANCE: CustomerImageModelGuidance = Object.freeze({ status: "not_activated" });
