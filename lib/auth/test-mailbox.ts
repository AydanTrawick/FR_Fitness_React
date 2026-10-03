// An in-memory, opt-in transport for disposable local acceptance tests. It is
// unavailable in production and never captures real account email addresses.
type TestMail = {
  to: string;
  title: string;
  message: string;
  code?: string;
  url?: string;
};
const root = globalThis as typeof globalThis & {
  firstrepTestMailbox?: TestMail[];
};
export function captureTestMail(mail: TestMail) {
  if (
    process.env.AUTH_TEST_MODE !== "true" ||
    process.env.NODE_ENV !== "development"
  )
    throw new Error("Test transport unavailable.");
  (root.firstrepTestMailbox ??= []).push(mail);
}
export function readTestMail(to: string) {
  return (root.firstrepTestMailbox || []).filter((m) => m.to === to);
}
