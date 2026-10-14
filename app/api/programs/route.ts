import { z } from "zod";
import { revalidateTag } from "next/cache";
import { checkOrigin, requireUser, HttpError } from "@/lib/server";
import {
  programAction,
  programState,
  mutateProgram,
} from "@/lib/program-server";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    if (request.method !== "GET") checkOrigin(request);
    const user = await requireUser();
    const state =
      request.method === "GET"
        ? await programState(user)
        : await mutateProgram(user, programAction.parse(await request.json()));
    if (request.method !== "GET")
      revalidateTag(`analysis-${user.id}`, { expire: 0 });
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 500;
    if (status === 500)
      console.error(
        "Program storage request failed",
        error instanceof Error ? error.name : "UnknownError",
        typeof error === "object" && error && "code" in error ? error.code : "",
      );
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : status === 400
              ? "Check the submitted workout values."
              : "Your program could not be saved. Please try again.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export { handle as GET, handle as POST };
