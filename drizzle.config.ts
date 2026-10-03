import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./lib/auth-schema.ts",
  out: "./database/auth-generated",
  dialect: "postgresql",
});
