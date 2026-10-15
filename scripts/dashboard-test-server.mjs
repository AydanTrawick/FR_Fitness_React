// Temporary UI fixture with mocked browser API responses; no auth bypass is
// shipped. The generated route is removed when this local server stops.
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
const directory = "app/testing-dashboard";
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/page.tsx`,
  `"use client";
import {notFound} from 'next/navigation';
import FirstRep from '@/components/firstrep';
export default function Preview() {
 if(process.env.NODE_ENV!=='development')notFound();
 return <FirstRep/>;
}
`,
  { flag: "wx" },
);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3027"],
  {
    stdio: "inherit",
    env: { ...process.env, FIRSTREP_BUILD_DIR: ".next/dashboard-tests" },
  },
);
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  await rm(`${directory}/page.tsx`, { force: true });
  await rm(directory, { recursive: false }).catch(() => {});
  // Another local Next dev process may also have indexed the temporary route.
  // Only remove generated validators that still reference our deleted fixture.
  for (const generated of [
    ".next/dev/types/validator.ts",
    ".next/types/validator.ts",
  ]) {
    try {
      const content = await readFile(generated, "utf8");
      if (content.includes("app/testing-dashboard/page"))
        await rm(generated, { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const path = "tsconfig.json";
  const text = await readFile(path, "utf8");
  const config = JSON.parse(text);
  const include = config.include.filter(
    (value) => !value.startsWith(".next/dashboard-tests/"),
  );
  if (include.length !== config.include.length)
    await writeFile(
      path,
      JSON.stringify({ ...config, include }, null, 2) + "\n",
    );
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await cleanup();
  process.exit(code ?? 1);
});
