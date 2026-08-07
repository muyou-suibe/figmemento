import { getSupabaseServerClient } from "../../lib/supabase-server";

const maxFileSize = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Please choose an image file." }, { status: 400 });
    }
    if (!allowedTypes.has(file.type)) {
      return Response.json({ error: "Only JPG, PNG, and WEBP images are supported." }, { status: 400 });
    }
    if (file.size === 0 || file.size > maxFileSize) {
      return Response.json({ error: "Please choose an image under 10MB." }, { status: 400 });
    }

    const bucket = process.env.SUPABASE_UPLOAD_BUCKET || "photogift-uploads";
    const storageKey = `drafts/${crypto.randomUUID()}.${extensionByType[file.type]}`;
    const supabase = getSupabaseServerClient();

    // Create the private bucket on first use. An existing bucket is safe to reuse.
    const { error: bucketError } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: `${maxFileSize}B`,
      allowedMimeTypes: [...allowedTypes],
    });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      throw bucketError;
    }

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storageKey, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;
    return Response.json({
      bucket,
      storageKey,
      originalFilename: file.name,
      contentType: file.type,
      fileSizeBytes: file.size,
    });
  } catch (error) {
    console.error("Photo upload failed", error);
    return Response.json({ error: "We could not save that photo. Please try again." }, { status: 500 });
  }
}
