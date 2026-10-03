import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
for (const path of [".env", ".env.local"]) {
  try {
    loadEnvFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3025"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      AUTH_TEST_MODE: "true",
      AUTH_TEST_MAILBOX_SECRET:
        process.env.AUTH_TEST_MAILBOX_SECRET || "firstrep-local-tests-only",
      BETTER_AUTH_URL: "http://localhost:3025",
      FIRSTREP_BUILD_DIR: ".next-auth-tests",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
