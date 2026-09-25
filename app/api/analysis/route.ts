import { requireUser, HttpError } from "@/lib/server";
import { getAnalysisData } from "@/lib/analysis/queries";
import { analysisOptions } from "@/lib/analysis/options";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const options = analysisOptions(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return Response.json(
      await getAnalysisData(
        user.id,
        options.range,
        options.timezone,
        options.unit,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Analysis is temporarily unavailable.",
      },
      { status: error instanceof HttpError ? error.status : 503 },
    );
  }
}
