import fs from "node:fs";
import path from "node:path";
export const metadata = { title: "Open-source licenses — FirstRep" };
export default function Licenses() {
  const packages = [
    "next",
    "react",
    "better-auth",
    "@better-auth/passkey",
    "drizzle-orm",
    "postgres",
    "lucide-react",
    "react-hook-form",
    "zod",
    "@zxcvbn-ts/core",
    "qrcode",
    "jszip",
    "resend",
  ];
  return (
    <>
      <h1>Open-source licenses</h1>
      <p>
        FirstRep web · version 0.1.0. These projects help power your toolkit.
      </p>
      <div className="help-faq">
        {packages.map((name) => {
          let license = "See the package’s distributed license for its terms.";
          try {
            const root = path.join(process.cwd(), "node_modules", name);
            const filename = fs
              .readdirSync(root)
              .find((f) => /^licen[sc]e(\.|$)/i.test(f));
            if (filename)
              license = fs.readFileSync(path.join(root, filename), "utf8");
          } catch {}
          return (
            <details key={name}>
              <summary>{name}</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 11,
                  color: "var(--muted)",
                  marginTop: 14,
                }}
              >
                {license}
              </pre>
            </details>
          );
        })}
      </div>
    </>
  );
}
