import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { HttpError } from "./database";
export async function serverSession(allowDeleted = false) {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session || (!allowDeleted && session.user.deletedAt)) return null;
  return session;
}
export async function requirePageSession(returnTo = "/", allowDeleted = false) {
  const session = await serverSession(true);
  if (!session) redirect("/auth?returnTo=" + encodeURIComponent(returnTo));
  if (!allowDeleted && session.user.deletedAt) redirect("/auth/restore");
  if (!allowDeleted && returnTo !== "/onboarding" && !session.user.onboarded)
    redirect("/onboarding?returnTo=" + encodeURIComponent(returnTo));
  return session;
}
export async function requireAccountSession(
  request: Request,
  allowDeleted = false,
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || (!allowDeleted && session.user.deletedAt))
    throw new HttpError("Sign in to continue.", 401);
  return session;
}
export function requireFresh(session: {
  session: { createdAt: Date | string };
}) {
  if (Date.now() - new Date(session.session.createdAt).getTime() > 600000)
    throw new HttpError(
      "Confirm it’s you by signing in again before continuing.",
      403,
    );
}
