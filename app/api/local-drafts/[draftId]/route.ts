import { persistentDraftHttp } from "../../../server/local-persistent-draft-http.server.ts";
export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  return persistentDraftHttp(request, "read", (await context.params).draftId);
}
export async function PUT(request: Request, context: { params: Promise<{ draftId: string }> }) {
  return persistentDraftHttp(request, "save", (await context.params).draftId);
}
