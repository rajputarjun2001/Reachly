import { browserConnectInput } from "@server/domain/accounts";
import { describeError } from "@server/middleware/errorHandler";
import { getSession } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Replays the user's clicks and keystrokes in the streamed LinkedIn sign-in page.
 * A plain route (not a server action): actions run one at a time and re-render the page, which made
 * typing lag by a round trip per keystroke.
 */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isBackendConfigured()) return Response.json({ error: "Not found" }, { status: 404 });
  const session = await getSession();
  if (!session?.workspaceId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // The session cookie is SameSite=Lax, so other sites cannot send it with a POST; this is a second check.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { sessionId } = await params;
  try {
    const body: unknown = await request.json();
    const result = await browserConnectInput(
      { userId: session.userId, workspaceId: session.workspaceId, role: session.role },
      sessionId,
      body,
    );
    return Response.json(result);
  } catch (err) {
    const { status, message } = describeError(err);
    return Response.json({ error: status >= 500 ? "Could not send that to the sign-in page." : message }, { status });
  }
}
