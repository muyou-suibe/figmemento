export const maximumUploadBytes = 10 * 1024 * 1024;
export const allowedUploadTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type UploadCandidate = {
  type: string;
  size: number;
};

export type UploadValidationResult =
  | { valid: true }
  | { valid: false; status: 400; error: string };

export function validateUploadCandidate(candidate: UploadCandidate): UploadValidationResult {
  if (!allowedUploadTypes.has(candidate.type)) {
    return { valid: false, status: 400, error: "Only JPG, PNG, and WEBP images are supported." };
  }
  if (candidate.size === 0 || candidate.size > maximumUploadBytes) {
    return { valid: false, status: 400, error: "Please choose an image under 10MB." };
  }
  return { valid: true };
}

export async function storeValidatedUpload<T>(
  candidate: UploadCandidate,
  store: () => Promise<T>,
): Promise<UploadValidationResult | { valid: true; stored: T }> {
  const validation = validateUploadCandidate(candidate);
  if (!validation.valid) return validation;
  return { valid: true, stored: await store() };
}
