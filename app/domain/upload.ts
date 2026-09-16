/** @deprecated Compatibility-only shape for the replaced prototype browser route. */
export type UploadReceipt = {
  bucket: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
};

export type UploadResponse = Partial<UploadReceipt> & {
  error?: string;
};
