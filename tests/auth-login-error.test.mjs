import { test } from "node:test";
import assert from "node:assert/strict";
import { loginErrorMessage } from "../lib/auth/login-error.ts";

test("deployment origin failures cannot masquerade as an incorrect password", () => {
  const message = loginErrorMessage({
    code: "INVALID_ORIGIN",
    status: 403,
    message: "Invalid origin",
  });
  assert.match(message, /website address/);
  assert.match(message, /redeploy/);
  assert.doesNotMatch(message, /password is incorrect/);
});
test("cold-start and rate-limit failures stay distinguishable from credential failures", () => {
  assert.match(loginErrorMessage({ status: 503 }), /temporarily unavailable/);
  assert.match(loginErrorMessage({ status: 429 }), /wait/);
  assert.match(
    loginErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }),
    /Email or password is incorrect/,
  );
  assert.doesNotMatch(
    loginErrorMessage({ status: 401, message: "User does not exist" }),
    /does not exist/,
  );
});
