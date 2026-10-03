export function GET() {
  const contact =
    process.env.SECURITY_CONTACT_EMAIL || process.env.SUPPORT_EMAIL;
  const url = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const lines = [
    contact ? "Contact: mailto:" + contact : "Contact: " + url + "/auth/help",
    "Expires: 2027-10-02T00:00:00Z",
    "Preferred-Languages: en",
    "Policy: " + url + "/legal/privacy",
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
