import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("auth imports without deployment credentials and fails closed only when initialized", () => {
  const env = { ...process.env };
  delete env.NEON_DATABASE_URL;
  delete env.BETTER_AUTH_SECRET;
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
  import assert from 'node:assert/strict';
  const module=await import('./lib/auth.ts');
  const {getAuth}=module.default||module;
  assert.equal(typeof getAuth,'function');
  assert.throws(()=>getAuth(),error=>error.status===503&&error.message.includes('NEON_DATABASE_URL'));
  process.env.NEON_DATABASE_URL='postgresql://unused.invalid/example';
  assert.throws(()=>getAuth(),error=>error.status===503&&error.message.includes('BETTER_AUTH_SECRET'));
 `,
    ],
    { env, stdio: "pipe", timeout: 30000 },
  );
});
