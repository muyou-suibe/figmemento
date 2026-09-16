import { handleLocalReviewRequest } from "../../server/local-review-http.server.ts";

export async function GET(request: Request): Promise<Response> { return handleLocalReviewRequest(request); }
export async function POST(request: Request): Promise<Response> { return handleLocalReviewRequest(request); }
