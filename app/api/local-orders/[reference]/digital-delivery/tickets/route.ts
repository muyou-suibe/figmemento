import { handleLocalPersistentDigitalTicketIssue } from "../../../../../server/local-persistent-digital-ticket.server.ts";
interface RouteContext { params: Promise<{ reference: string }> }
export async function POST(request:Request,context:RouteContext):Promise<Response>{const{reference}=await context.params;return handleLocalPersistentDigitalTicketIssue(request,reference);}
