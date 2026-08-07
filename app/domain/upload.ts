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
