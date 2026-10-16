import "server-only";
import { after } from "next/server";
import { createRateLimits } from "./core";

export const limits = createRateLimits({
  defer(pending) {
    // Keep Upstash analytics alive after the serverless response completes.
    after(() => pending);
  },
});
