import { handlePersistentAdminTimeout } from '../../../../../server/local-persistent-admin-timeout.server.ts';

export async function POST(request: Request, context: {params: Promise<{reference:string}>}) {
  return handlePersistentAdminTimeout(request,(await context.params).reference);
}
