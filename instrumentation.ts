export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
      },
      beforeSend(event) {
        delete event.request;
        delete event.user;
        delete event.message;
        event.breadcrumbs = [];
        event.extra = {};
        for (const exception of event.exception?.values || [])
          exception.value = "Application error";
        return event;
      },
    });
  }
}

export const onRequestError: import("next").Instrumentation.onRequestError =
  async (error) => {
    if (process.env.SENTRY_DSN) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(error);
      await Sentry.flush(2000);
    }
  };
