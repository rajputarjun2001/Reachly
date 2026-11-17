import { createHash } from "crypto";
import { browserConnectFrame } from "@server/domain/accounts";
import { getSession } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Current picture of the streamed LinkedIn sign-in page. The viewer asks again as soon as each one
 * arrives and sends the tag of the picture it already has, so an unchanged page costs a few bytes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isBackendConfigured()) return new Response(null, { status: 404 });
  const session = await getSession();
  if (!session?.workspaceId) return new Response(null, { status: 401 });
  const { sessionId } = await params;
  try {
    // The signed session cookie names the workspace; the session is only visible to that workspace.
    const frame = await browserConnectFrame(
      { userId: session.userId, workspaceId: session.workspaceId, role: session.role },
      sessionId,
    );
    const tag = `"${createHash("sha1").update(frame).digest("hex")}"`;
    const headers = { ETag: tag, "Cache-Control": "no-store" };
    if (request.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(frame), { headers: { ...headers, "Content-Type": "image/jpeg" } });
  } catch {
    // Finished, failed, expired or another workspace's session: the viewer stops asking.
    return new Response(null, { status: 404 });
  }
}
