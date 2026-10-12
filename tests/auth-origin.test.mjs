import { test } from "node:test";
import assert from "node:assert/strict";
import { authOriginConfig, authRequestOrigins } from "../lib/auth/origin.ts";

test("auth origins normalize trailing slashes and share the passkey allowlist", () => {
  const config = authOriginConfig({
    BETTER_AUTH_URL: " https://firstrep.example/ ",
    AUTH_TRUSTED_ORIGINS:
      "https://www.firstrep.example/,https://firstrep.example",
  });
  assert.equal(config.baseURL, "https://firstrep.example");
  assert.equal(config.rpID, "firstrep.example");
  assert.deepEqual(config.trustedOrigins, [
    "https://firstrep.example",
    "https://www.firstrep.example",
  ]);
});

test("production resolves the stable Vercel domain even with copied localhost configuration", () => {
  const config = authOriginConfig({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    BETTER_AUTH_URL: "http://localhost:3000",
    VERCEL_PROJECT_PRODUCTION_URL: "firstrep.example",
    VERCEL_URL: "firstrep-abc.vercel.app",
  });
  assert.equal(config.baseURL, "https://firstrep.example");
  assert.equal(config.rpID, "firstrep.example");
  assert.deepEqual(config.trustedOrigins, [
    "https://firstrep.example",
    "https://firstrep-abc.vercel.app",
  ]);
  assert.ok(!config.trustedOrigins.includes("https://unrelated.vercel.app"));
});

test("preview uses its own deployment rather than silently sending users to production", () => {
  const config = authOriginConfig({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_PROJECT_PRODUCTION_URL: "firstrep.example",
    VERCEL_URL: "firstrep-preview.vercel.app",
  });
  assert.equal(config.baseURL, "https://firstrep-preview.vercel.app");
});
test("the FirstRep production hostname accepts sign-in on its initial Vercel deployment", () => {
  for (const configured of [undefined, "http://localhost:3000"])
    for (const productionDomain of [undefined, "fr-fitness.vercel.app"]) {
      const config = authOriginConfig({
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "production",
        BETTER_AUTH_URL: configured,
        VERCEL_PROJECT_PRODUCTION_URL: productionDomain,
        VERCEL_URL: "fr-fitness.vercel.app",
      });
      assert.equal(config.baseURL, "https://fr-fitness.vercel.app");
      assert.ok(
        config.trustedOrigins.includes("https://fr-fitness.vercel.app"),
      );
      assert.ok(!config.trustedOrigins.includes("http://localhost:3000"));
    }
});

test("explicit stable domain takes priority and local development stays supported", () => {
  assert.equal(
    authOriginConfig({
      BETTER_AUTH_URL: "https://fitness.example",
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "firstrep.vercel.app",
    }).baseURL,
    "https://fitness.example",
  );
  assert.equal(authOriginConfig({}).baseURL, "http://localhost:3000");
  assert.equal(
    authOriginConfig({ BETTER_AUTH_URL: "http://localhost:3025/" }).baseURL,
    "http://localhost:3025",
  );
});
test("a configured canonical domain does not exclude the verified Vercel production alias", () => {
  const config = authOriginConfig({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    BETTER_AUTH_URL: "https://fitness.example",
    VERCEL_PROJECT_PRODUCTION_URL: "fr-fitness.vercel.app",
    VERCEL_URL: "fr-fitness-release-aydan.vercel.app",
  });
  assert.equal(config.baseURL, "https://fitness.example");
  assert.ok(config.trustedOrigins.includes("https://fr-fitness.vercel.app"));
  assert.ok(!config.trustedOrigins.includes("https://unrelated.vercel.app"));
});

test("invalid origin configuration fails closed without trusting arbitrary hosts or wildcards", () => {
  for (const value of [
    "https://firstrep.example/api/auth",
    "https://firstrep.example?x=1",
    "https://user:password@firstrep.example",
    "http://firstrep.example",
    "not-a-url",
    "https://*.vercel.app",
  ])
    assert.throws(() => authOriginConfig({ BETTER_AUTH_URL: value }));
  assert.throws(() => authOriginConfig({ NODE_ENV: "production" }));
  assert.throws(() =>
    authOriginConfig({ VERCEL: "1", BETTER_AUTH_URL: "http://localhost:3000" }),
  );
  assert.throws(() =>
    authOriginConfig({ AUTH_TRUSTED_ORIGINS: "*.vercel.app" }),
  );
});

test("Apple's origin is allowed only for an enabled provider's POST callback", () => {
  const env = {
    BETTER_AUTH_URL: "https://fr-fitness.vercel.app",
    APPLE_CLIENT_ID: "fixture.service",
    APPLE_CLIENT_SECRET: "fixture.jwt",
  };
  const callback = {
    url: "https://fr-fitness.vercel.app/api/auth/callback/apple",
    method: "POST",
  };
  assert.ok(
    authRequestOrigins(callback, env).includes("https://appleid.apple.com"),
  );
  for (const request of [
    undefined,
    { ...callback, method: "GET" },
    {
      ...callback,
      url: "https://fr-fitness.vercel.app/api/auth/sign-in/email",
    },
    {
      ...callback,
      url: "https://fr-fitness.vercel.app/api/auth/callback/google",
    },
  ])
    assert.ok(
      !authRequestOrigins(request, env).includes("https://appleid.apple.com"),
    );
  assert.ok(
    !authRequestOrigins(callback, {
      ...env,
      APPLE_CLIENT_SECRET: undefined,
    }).includes("https://appleid.apple.com"),
  );
});
