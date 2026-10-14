"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import content from "@/lib/content.json";
import { Card, Field, PageTitle } from "./ui";
export { ProgramLibrary as Programs } from "./program-library";
export function Guides() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("glossary");
  const terms = content.glossary.filter(([term, definition]) =>
    `${term} ${definition}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE KNOWLEDGE GOES A LONG WAY"
        title="Learn as you grow."
        description="Clear explanations for the language of training and nutrition."
      />
      <div className="tabs">
        <button
          className={tab === "glossary" ? "active" : ""}
          onClick={() => setTab("glossary")}
        >
          Glossary
        </button>
        <button
          className={tab === "guides" ? "active" : ""}
          onClick={() => setTab("guides")}
        >
          Training & nutrition guides
        </button>
      </div>
      {tab === "glossary" ? (
        <>
          <Field label="Find a term">
            <div className="search-field">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try RPE, progressive overload, macros…"
              />
            </div>
          </Field>
          <div className="glossary-grid">
            {terms.map(([term, definition]) => (
              <Card key={term}>
                <h3>{term}</h3>
                <p className="muted">{definition}</p>
              </Card>
            ))}
          </div>
          {!terms.length && (
            <p className="muted">No matching terms. Try another search.</p>
          )}
        </>
      ) : (
        <div className="stack">
          {Object.entries(content.guides)
            .filter(([name]) => name !== "Glossary")
            .map(([name, text]) => (
              <details key={name} className="card guide">
                <summary>{name}</summary>
                <div className="prose-copy">
                  {text.split("\n\n").map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </details>
            ))}
        </div>
      )}
    </>
  );
}
