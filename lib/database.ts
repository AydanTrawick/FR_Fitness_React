import postgres from "postgres";

let connection: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.NEON_DATABASE_URL)
    throw new HttpError(
      "Account storage is not connected yet. Please try again shortly.",
      503,
    );
  return (connection ??= postgres(process.env.NEON_DATABASE_URL, {
    ssl: "require",
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
    types: {
      date: {
        to: 1082,
        from: [1082, 1184, 1114],
        serialize: (v: unknown) => String(v),
        parse: (v: string) => v,
      },
    },
  }));
}
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
