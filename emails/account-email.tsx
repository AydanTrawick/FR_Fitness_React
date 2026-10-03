import * as React from "react";
export function AccountEmail({
  title,
  message,
  code,
  url,
}: {
  title: string;
  message: string;
  code?: string;
  url?: string;
}) {
  return (
    <html>
      <body
        style={{
          background: "#121212",
          color: "#f2f0eb",
          fontFamily: "Arial,sans-serif",
          padding: "32px",
        }}
      >
        <main
          style={{
            maxWidth: 520,
            margin: "auto",
            background: "#1b1b1d",
            padding: 32,
            borderRadius: 16,
          }}
        >
          <p style={{ color: "#5b8cff", letterSpacing: 3, fontWeight: 700 }}>
            FIRSTREP FITNESS
          </p>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          <p style={{ lineHeight: 1.7 }}>{message}</p>
          {code && (
            <p
              style={{
                fontSize: 32,
                letterSpacing: 8,
                fontFamily: "monospace",
              }}
            >
              {code}
            </p>
          )}
          {url && (
            <p>
              <a href={url} style={{ color: "#b7ccff" }}>
                Continue securely →
              </a>
            </p>
          )}
          <p style={{ fontSize: 12, color: "#9a9a9f", lineHeight: 1.6 }}>
            Never share a sign-in or recovery code. If you did not request this,
            visit FirstRep’s sign-in help page.
          </p>
        </main>
      </body>
    </html>
  );
}
