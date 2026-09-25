"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: 40 }}>
      <h1>Analysis is temporarily unavailable</h1>
      <p>Your logs are safe. Please try again.</p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
      <Link className="btn" href="/">
        Back to dashboard
      </Link>
    </main>
  );
}
