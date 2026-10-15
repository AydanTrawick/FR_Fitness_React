import { z } from "zod";
import { workoutInput, foodInput } from "./schema.ts";
export const assistantTools = [
  {
    name: "log_workout_set",
    description:
      "Propose workout sets only when the user requests logging. Creates a pending draft, never saves the real workout. Only include stated values; ask for missing reps or weight. Unit may use the profile default. Expand three sets into three items. The server resolves clear exercise names; use search_exercises only for ambiguous names. Custom names require the user to explicitly choose custom.",
    input_schema: z.toJSONSchema(workoutInput),
  },
  {
    name: "log_food",
    description:
      "Propose a food entry only when requested. Creates a pending draft, never saves the real food log. Leave all unstated nutrients and calories null or absent; protein does not imply calories. Estimate only when explicitly requested and label assistant_estimate.",
    input_schema: z.toJSONSchema(foodInput),
  },
  {
    name: "search_exercises",
    description:
      "Look up a name in the exercise catalog. Returns a confident match or up to three choices. Ask the user to pick if ambiguous, or offer a custom name. Never pick an arbitrary candidate.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_today_summary",
    description:
      "Read today’s saved workout and food logs only with history sharing enabled for this request and in Privacy settings. Otherwise returns history access is off. Does not write records.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
export type Block = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
};
export type ChatMessage = {
  role: "user" | "assistant";
  content: string | Block[];
};
export async function runToolLoop(options: {
  messages: ChatMessage[];
  call: (
    messages: ChatMessage[],
  ) => Promise<{ content: Block[]; stop_reason?: string }>;
  execute: (name: string, input: unknown, id: string) => Promise<unknown>;
}) {
  const messages = [...options.messages];
  for (let turn = 0; turn < 5; turn++) {
    const result = await options.call(messages);
    const calls = result.content.filter((b) => b.type === "tool_use");
    if (!calls.length) {
      const text = result.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
      if (!text.trim())
        throw new Error(
          "The assistant returned an empty response. Please try again.",
        );
      return text;
    }
    if (calls.length > 8)
      throw new Error(
        "Too many actions requested. Please log fewer items at once.",
      );
    messages.push({ role: "assistant", content: result.content });
    const results: Block[] = [];
    for (const call of calls) {
      try {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(
            await options.execute(call.name ?? "", call.input, call.id ?? ""),
          ),
        });
      } catch (e) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content:
            e instanceof z.ZodError
              ? "Invalid or missing logging details. Ask one short follow-up; do not guess or save."
              : e instanceof Error
                ? e.message
                : "Could not prepare that action.",
        });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(
    "Please narrow your request and try again. Nothing was saved to your logs.",
  );
}
