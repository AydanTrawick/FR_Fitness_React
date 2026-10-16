import { usageFetch } from "./ratelimit/usage-client.ts";
import { requestError } from "./ratelimit/client.ts";
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await usageFetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw requestError(response, data);
  return data;
}
export async function apiBlob(path: string, body: unknown): Promise<Blob> {
  const response = await usageFetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (
    !response.ok ||
    response.headers.get("content-type")?.includes("application/json")
  ) {
    const data = await response.json().catch(() => ({}));
    throw requestError(response, data);
  }
  return response.blob();
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
