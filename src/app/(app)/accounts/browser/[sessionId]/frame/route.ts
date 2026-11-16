import { browserConnectFrame } from "@server/domain/accounts";
import { getSession } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Current picture of the streamed LinkedIn sign-in page. The viewer requests it again after each one loads. */
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
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
    return new Response(new Uint8Array(frame), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch {
    // Finished, failed, expired or another workspace's session: the viewer stops asking.
    return new Response(null, { status: 404 });
  }
}
