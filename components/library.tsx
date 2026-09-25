"use client";
import { useState } from "react";
import { ArrowLeft, Clock, Download, Dumbbell, Search } from "lucide-react";
import content from "@/lib/content.json";
import { download } from "@/lib/client";
import { Card, Field, PageTitle } from "./ui";
export function Programs() {
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState(0);
  const program = content.programs.find((p) => p.id === selected);
  const selectedDay = program?.schedule[day];
  return (
    <>
      <PageTitle
        eyebrow="THE FIRSTREP PROGRAM LIBRARY"
        title={program ? program.title : "A plan to show up for."}
        description={
          program
            ? program.description
            : "Five original programs. Find the routine that fits your week."
        }
      />
      {program ? (
        <>
          <div className="row between wrap">
            <button className="btn secondary" onClick={() => setSelected(null)}>
              <ArrowLeft size={16} /> All programs
            </button>
            <button
              className="btn secondary"
              onClick={() =>
                download(
                  `${program.id}.md`,
                  `# ${program.title}\n\n${program.description}\n\n` +
                    program.schedule
                      .map(
                        (d) =>
                          `## ${d.day}: ${d.title} (${d.duration} min)\n\n` +
                          d.exercises
                            .map(
                              (e) =>
                                `- ${e.name}: ${e.sets} sets × ${e.reps}; ${e.equipment}; ${e.rest}s rest`,
                            )
                            .join("\n"),
                      )
                      .join("\n\n") +
                    "\n\nWarm up before training. Adapt exercise selection to your experience and needs.",
                )
              }
            >
              <Download size={16} /> Download program
            </button>
          </div>
          <div className="day-tabs">
            {program.schedule.map((d, i) => (
              <button
                className={day === i ? "active" : ""}
                key={d.day}
                onClick={() => setDay(i)}
              >
                <small>{d.day}</small>
                {d.title}
              </button>
            ))}
          </div>
          {selectedDay && (
            <Card>
              <div className="section-top">
                <div>
                  <p className="eyebrow">{selectedDay.day.toUpperCase()}</p>
                  <h3>{selectedDay.title}</h3>
                </div>
                <span className="chip">
                  <Clock size={14} /> {selectedDay.duration} min
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Sets</th>
                      <th>Reps / duration</th>
                      <th>Muscle</th>
                      <th>Equipment</th>
                      <th>Rest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDay.exercises.map((e, i) => (
                      <tr key={`${e.name}-${i}`}>
                        <td>
                          <strong>{e.name}</strong>
                        </td>
                        <td>{e.sets}</td>
                        <td>{e.reps}</td>
                        <td>{e.muscle}</td>
                        <td>{e.equipment}</td>
                        <td>{e.rest ? `${e.rest}s` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <p className="footnote">
            Warm up before training. These are the original FirstRep routines;
            adapt them to your experience, available equipment, and recovery.
          </p>
        </>
      ) : (
        <div className="program-grid">
          {content.programs.map((p, i) => (
            <button
              className={`card program-card program-${i}`}
              key={p.id}
              onClick={() => {
                setSelected(p.id);
                setDay(0);
              }}
            >
              <div className="program-art">
                <span className="program-number">0{i + 1}</span>
                <Dumbbell size={55} strokeWidth={1} />
                <span className="chip">{p.schedule.length} DAYS / WEEK</span>
              </div>
              <p className="eyebrow">
                {
                  [
                    "BUILD A FOUNDATION",
                    "FIND YOUR BALANCE",
                    "FOCUS YOUR TRAINING",
                    "MIX IT UP",
                    "BUILD ENDURANCE",
                  ][i]
                }
              </p>
              <h3>{p.title}</h3>
              <p className="muted">{p.description}</p>
              <div className="row between">
                <span>
                  <Clock size={14} />{" "}
                  {Math.min(...p.schedule.map((d) => d.duration))}–
                  {Math.max(...p.schedule.map((d) => d.duration))} min
                </span>
                <span className="accent">View program ↗</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
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
