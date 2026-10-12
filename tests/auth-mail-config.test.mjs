import { test } from "node:test";
import assert from "node:assert/strict";
import { accountMailConfig } from "../lib/auth/mail-config.ts";

test("Gmail is available only for local development", () => {
  const config = accountMailConfig({
    NODE_ENV: "development",
    EMAIL_ADDRESS: "fixture@example.invalid",
    EMAIL_PASSWORD: "fixture-app-password",
  });
  assert.equal(config.provider, "gmail");
  assert.equal(config.from, "fixture@example.invalid");
  assert.throws(
    () =>
      accountMailConfig({
        NODE_ENV: "production",
        EMAIL_ADDRESS: "fixture@example.invalid",
        EMAIL_PASSWORD: "fixture-app-password",
      }),
    /RESEND_API_KEY/,
  );
});
test("a fully configured Resend sender takes precedence over Gmail", () => {
  const config = accountMailConfig({
    RESEND_API_KEY: "fixture-key",
    AUTH_EMAIL_FROM: "FirstRep <accounts@example.invalid>",
    EMAIL_ADDRESS: "fixture@example.invalid",
    EMAIL_PASSWORD: "fixture-app-password",
  });
  assert.equal(config.provider, "resend");
});
test("missing verified sender or incomplete credentials fail without inventing a sender domain", () => {
  assert.throws(
    () => accountMailConfig({ RESEND_API_KEY: "fixture-key" }),
    /AUTH_EMAIL_FROM/,
  );
  assert.throws(
    () => accountMailConfig({ EMAIL_ADDRESS: "fixture@example.invalid" }),
    /app password/,
  );
  assert.throws(() => accountMailConfig({}), /Configure/);
});
