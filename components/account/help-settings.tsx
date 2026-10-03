"use client";
import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { FAQ } from "@/lib/auth/faq";
import { useAccount } from "./settings-context";
import { api } from "@/lib/client";
export function FaqSearch({ faqs }: { faqs: FAQ[] }) {
  const [query, setQuery] = useState("");
  const matches = faqs.filter((f) =>
    (f.question + " " + f.answer).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="account-form">
        <label htmlFor="faq-search">Find an answer</label>
        <input
          id="faq-search"
          type="search"
          placeholder="Try “passkey”, “email”, or “units”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="help-faq">
        {matches.map((f) => (
          <details key={f.id}>
            <summary>{f.question}</summary>
            <ReactMarkdown>{f.answer}</ReactMarkdown>
          </details>
        ))}
        {!matches.length && (
          <p className="account-muted">
            No matching answers. Try a different search or contact us below.
          </p>
        )}
      </div>
    </>
  );
}
export function HelpSettings({ faqs }: { faqs: FAQ[] }) {
  const { working, perform } = useAccount();
  const [topic, setTopic] = useState("Account");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [fileError, setFileError] = useState("");
  async function attach(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 350000
    ) {
      setFileError("Choose a JPG, PNG, or WebP under 350 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(String(reader.result));
      setFileError("");
    };
    reader.readAsDataURL(file);
  }
  return (
    <>
      <section className="settings-card">
        <h2>How can we help?</h2>
        <FaqSearch faqs={faqs} />
      </section>
      <section className="settings-card">
        <h2>Contact FirstRep</h2>
        <p className="account-muted">
          Tell us what happened. We include your account ID, app version, and
          browser so we can help.
        </p>
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await api("account/contact", {
                topic,
                message,
                browser: navigator.userAgent,
                ...(screenshot ? { screenshot } : {}),
              });
              setMessage("");
              setScreenshot("");
            }, "Your message was sent.");
          }}
        >
          <label htmlFor="support-topic">Topic</label>
          <select
            id="support-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            {[
              "Sign-in",
              "Security",
              "Account",
              "Training",
              "AI plans",
              "Billing",
              "Other",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label htmlFor="support-message">Message</label>
          <textarea
            id="support-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            minLength={10}
            maxLength={5000}
            required
          />
          <label htmlFor="support-screenshot">Screenshot (optional)</label>
          <input
            id="support-screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void attach(e.target.files?.[0])}
          />
          {fileError && (
            <p className="field-error" role="alert">
              {fileError}
            </p>
          )}
          <p className="account-hint">
            Please leave passwords, verification codes, and sensitive health
            details out of your message.
          </p>
          <div className="settings-footer">
            <button
              className="account-button primary"
              disabled={working || message.trim().length < 10}
            >
              Send message
            </button>
          </div>
        </form>
      </section>
      <section className="settings-card">
        <h2>About FirstRep</h2>
        <div className="stack" style={{ marginTop: 18 }}>
          <Link className="text-link" href="/auth/help">
            I can’t sign in
          </Link>
          <a className="text-link" href="/.well-known/security.txt">
            Report a security issue
          </a>
          <Link className="text-link" href="/legal/terms">
            Terms of use
          </Link>
          <Link className="text-link" href="/legal/privacy">
            Privacy Policy
          </Link>
          <Link className="text-link" href="/legal/licenses">
            Open-source licenses
          </Link>
          <p className="account-hint">FirstRep web · version 0.1.0</p>
        </div>
      </section>
    </>
  );
}
