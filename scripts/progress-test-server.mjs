// Isolated test-only Anthropic fixture service. Never imported by the app.
import http from "node:http";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
for (const path of [".env", ".env.local"]) {
  try {
    loadEnvFile(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
function emitMessage(res, blocks, stop = "end_turn") {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const event = (type, data) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event("message_start", {
    message: {
      id: "msg_" + randomUUID(),
      type: "message",
      role: "assistant",
      model: "fixture-model",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 1 },
    },
  });
  blocks.forEach((block, index) => {
    event("content_block_start", {
      index,
      content_block:
        block.type === "text"
          ? { type: "text", text: "" }
          : { ...block, input: {} },
    });
    event("content_block_delta", {
      index,
      delta:
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : {
              type: "input_json_delta",
              partial_json: JSON.stringify(block.input),
            },
    });
    event("content_block_stop", { index });
  });
  event("message_delta", {
    delta: { stop_reason: stop, stop_sequence: null },
    usage: { output_tokens: 30 },
  });
  event("message_stop", {});
  res.end();
}
const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    const body = JSON.parse(raw);
    if (["tool", "any"].includes(body.tool_choice?.type)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Forced tool use is not supported by Sonnet 5.5.",
          },
        }),
      );
      return;
    }
    const tool = (name, input) => ({
      type: "tool_use",
      id: "tool_" + randomUUID(),
      name,
      input,
    });
    const last = body.messages.at(-1).content;
    if (body.tools?.[0]?.name === "submit_result") {
      const data = JSON.parse(last);
      const restrictions = [
        ...new Set([
          ...(data.retainedRestrictions || []),
          ...(data.changes?.request.toLowerCase().includes("pork")
            ? ["no pork"]
            : []),
        ]),
      ];
      const exercise =
        data.catalog.find((e) => e.id === "bench") || data.catalog[0];
      const plan = {
        training: Array.from(
          { length: data.profile.days_per_week },
          (_, i) => ({
            day: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ][i],
            name: `Strength day ${i + 1}`,
            description:
              "Add one rep with good form, then increase weight. Rest between sessions.",
            exercises: [
              {
                exerciseId: exercise.id,
                sets: 3,
                mode: "reps",
                reps: "8-12",
                duration: 30,
                weight: null,
                rest: 90,
                notes: "Move with control",
              },
            ],
          }),
        ),
        nutrition: {
          diet_restrictions: restrictions,
          calories: 2600,
          protein_g: 140,
          carbs_g: 340,
          fat_g: 75,
          note: "Estimated targets. Balanced meals without pork.",
          meals: ["Breakfast", "Lunch", "Dinner"].map((name) => ({
            name,
            ingredients: ["Tofu 150 g", "Rice 100 g", "Vegetables 200 g"],
          })),
          groceries: ["Tofu", "Rice", "Vegetables"],
        },
        habits: [
          {
            title: "Sleep consistently",
            action: "build",
            note: "Aim for a steady bedtime",
          },
          {
            title: "Take a daily walk",
            action: "build",
            note: "Start with ten minutes",
          },
          {
            title: "Stop skipping recovery",
            action: "drop",
            note: "Keep rest days",
          },
        ],
        tips: [
          {
            title: "Move with control",
            note: "Use a comfortable range of motion",
          },
          {
            title: "Recover well",
            note: "Give yourself rest between hard sessions",
          },
        ],
      };
      emitMessage(res, [tool("submit_result", plan)], "tool_use");
    } else if (Array.isArray(last))
      emitMessage(res, [
        {
          type: "text",
          text: "Review the card below. Your plan changes only when you confirm it.",
        },
      ]);
    else if (/pork|edit|swap/i.test(last))
      emitMessage(
        res,
        [
          tool("propose_adjustment", {
            request: "Remove pork from my meal plan",
            reason: "Respect your dietary preference",
          }),
        ],
        "tool_use",
      );
    else
      emitMessage(
        res,
        [
          tool("set_goal", {
            type: "gain_weight",
            focus_areas: ["chest"],
            target_weight_kg: 80,
            timeline_weeks: 12,
            diet_restrictions: [],
            injuries: "None stated",
            food_budget: "Moderate",
          }),
        ],
        "tool_use",
      );
  } catch {
    res.writeHead(500);
    res.end();
  }
});
server.listen(3031, "127.0.0.1", () =>
  console.log("Progress fixture provider ready"),
);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3026"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      AUTH_TEST_MODE: "true",
      AUTH_TEST_MAILBOX_SECRET: "firstrep-local-tests-only",
      BETTER_AUTH_URL: "http://localhost:3026",
      FIRSTREP_BUILD_DIR: ".next-progress-tests",
      ANTHROPIC_API_KEY: "test-fixture-key",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:3031",
      PROGRESS_R2_BUCKET_NAME: "",
      PROGRESS_R2_API_TOKEN: "",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill(signal);
    server.close();
  });
child.on("exit", (code) => {
  server.close();
  process.exit(code ?? 1);
});
