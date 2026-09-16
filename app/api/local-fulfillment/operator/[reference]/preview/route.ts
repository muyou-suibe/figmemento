import { persistentPreviewHttp } from "../../../../../server/local-persistent-preview-http.server.ts";

export async function POST(request:Request,context:{params:Promise<{reference:string}>}) {
  return persistentPreviewHttp(request,(await context.params).reference);
}
