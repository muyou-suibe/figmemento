import { persistentDraftHttp } from "../../server/local-persistent-draft-http.server.ts";
export async function GET(request: Request) { return persistentDraftHttp(request, "restore"); }
export async function POST(request: Request) { return persistentDraftHttp(request, "create"); }
