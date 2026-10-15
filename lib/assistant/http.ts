import { z } from "zod";
import { HttpError } from "../database";
export const assistantResponse = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export function assistantError(error: unknown) {
  if (error instanceof HttpError)
    return assistantResponse({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return assistantResponse(
      {
        error:
          "Check the entry details: " +
          error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
      },
      400,
    );
  return assistantResponse(
    { error: "Unable to complete this assistant request. Please try again." },
    500,
  );
}
