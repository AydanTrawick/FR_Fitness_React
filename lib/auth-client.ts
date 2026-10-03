"use client";
import { createAuthClient } from "better-auth/react";
import {
  emailOTPClient,
  twoFactorClient,
  usernameClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import type { FirstRepAuth } from "./auth";
// Reload at identity transitions so cached data from a prior account is discarded.
export function reloadAccountPage(path: string) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin)
    throw new Error("Invalid account redirect.");
  window.location.assign(url.href);
}
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<FirstRepAuth>(),
    emailOTPClient(),
    usernameClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const target = new URL(window.location.href).searchParams.get(
          "returnTo",
        );
        reloadAccountPage(
          "/auth?step=two-factor" +
            (target ? "&returnTo=" + encodeURIComponent(target) : ""),
        );
      },
    }),
    passkeyClient(),
  ],
});
