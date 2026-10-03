import { readTestMail } from "@/lib/auth/test-mailbox";
export function GET(request: Request) {
  if (
    process.env.AUTH_TEST_MODE !== "true" ||
    process.env.NODE_ENV !== "development" ||
    !process.env.AUTH_TEST_MAILBOX_SECRET ||
    request.headers.get("x-test-mailbox-key") !==
      process.env.AUTH_TEST_MAILBOX_SECRET
  )
    return new Response(null, { status: 404 });
  const to = new URL(request.url).searchParams.get("email") || "";
  if (!/^firstrep-test-[a-z0-9-]+@example\.invalid$/.test(to))
    return new Response(null, { status: 404 });
  return Response.json(
    { messages: readTestMail(to) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
