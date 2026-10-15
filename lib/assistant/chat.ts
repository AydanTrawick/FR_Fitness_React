import { formatAssistantReply } from "./reply-format.ts";
import { z } from "zod";
import { handleVoiceCommand } from "./voice-command.ts";
import { spokenText } from "./voice.ts";
import { assistantSystem } from "./prompt.ts";
import { db, HttpError } from "../database.ts";
import { providerFetch } from "../server";
import { matchAssistantExercise } from "./exercise.ts";
import { assistantTools, runToolLoop, type Block } from "./tools.ts";
import { chatInput, dateInZone, type PendingAction } from "./schema.ts";
import { createAction, repeatPayload, type Actor } from "./actions.ts";
export async function assistantChat(user: Actor, raw: unknown) {
  const result = await buildAssistantReply(user, raw);
  return { ...result, replyText: formatAssistantReply(result.replyText) };
}
async function buildAssistantReply(user: Actor, raw: unknown) {
  const body = chatInput.parse(raw),
    sql = db(),
    timezone = user.timezone || "UTC";
  const today = dateInZone(new Date(), timezone);
  const keyPrefix = `${user.id}:${body.conversationId}:${body.requestId}:`;
  await sql`UPDATE pending_log_actions SET status='expired' WHERE user_id=${user.id} AND status='pending' AND expires_at<=NOW()`;
  if (body.mode === "voice") {
    const command = await handleVoiceCommand(
      user,
      body.conversationId,
      body.prompt,
      body.activeActionId,
      body.confirmationPayload,
      sql,
    );
    if (command) return command;
  }
  const existing =
    await sql`SELECT id,kind,status,payload,expires_at FROM pending_log_actions WHERE user_id=${user.id} AND conversation_id=${body.conversationId} AND starts_with(idempotency_key,${keyPrefix}) ORDER BY created_at,id`;
  if (existing.length)
    return {
      replyText:
        "Here is the draft from that request. Review it before saving.",
      pendingActions: existing,
    };
  const consent =
    await sql`SELECT preferences FROM firstrep_user_settings WHERE user_id=${user.id}`;
  const historyAllowed =
    body.includeTrainingHistory &&
    consent[0]?.preferences?.aiDataOptIn === true;
  // A new request supersedes unconfirmed drafts in this transient chat. Drafts
  // created together below remain separate cards and can each be confirmed.
  await sql`UPDATE pending_log_actions SET status='cancelled' WHERE user_id=${user.id} AND conversation_id=${body.conversationId} AND status='pending'`;
  if (/^(?:same again|another set)[.!?]?$/i.test(body.prompt)) {
    const [previous] =
      await sql`SELECT kind,payload FROM pending_log_actions WHERE user_id=${user.id} AND conversation_id=${body.conversationId} AND status='confirmed' ORDER BY confirmed_at DESC,id DESC LIMIT 1`;
    if (!previous)
      return {
        replyText:
          "Log and confirm a set in this chat first, then I can repeat it.",
        pendingActions: [],
      };
    const action = await createAction(
      user,
      body.conversationId,
      keyPrefix + "repeat",
      previous.kind,
      repeatPayload(previous.kind, previous.payload),
      sql,
      body.mode,
    );
    return {
      replyText:
        "Here is another draft based on your last confirmed entry in this chat. Confirm to save it.",
      pendingActions: [action],
    };
  }
  if (!process.env.ANTHROPIC_API_KEY)
    throw new HttpError(
      "The training assistant is unavailable. Check its server configuration.",
      503,
    );
  let draftIndex = 0;
  const pendingActions: PendingAction[] = [],
    exerciseChoices: { id: string; name: string }[] = [];
  const system =
    assistantSystem(today, timezone, user.weightUnit, historyAllowed) +
    (body.mode === "voice"
      ? " Reply in one or two short spoken sentences, plain text only, no markdown or lists. For clear exercise names call log_workout_set directly; the server resolves them. Use search_exercises only for ambiguous names. Tell the user to tap confirm or say yes. With multiple drafts, say yes saves only the most recent."
      : "");
  const replyText = await runToolLoop({
    messages: [...body.history, { role: "user", content: body.prompt }],
    call: async (messages) => {
      const res = await providerFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 1800,
          system,
          tools: assistantTools,
          messages,
        }),
      });
      const result = (await res.json()) as {
        content: Block[];
        stop_reason: string;
      };
      if (!Array.isArray(result.content) || result.stop_reason === "max_tokens")
        throw new HttpError(
          "The assistant could not finish. Try a shorter request.",
          502,
        );
      return result;
    },
    execute: async (name, input) => {
      if (name === "search_exercises") {
        const { name: query } = z
          .object({ name: z.string().trim().min(1).max(300) })
          .strict()
          .parse(input);
        const catalog = await sql<
          { id: string; name: string }[]
        >`SELECT id,name FROM exercises`;
        const found = matchAssistantExercise(query, catalog);
        if (!found.match) exerciseChoices.push(...found.candidates.slice(0, 3));
        return { ...found, candidates: found.candidates.slice(0, 3) };
      }
      if (name === "get_today_summary") {
        z.object({}).strict().parse(input);
        if (!historyAllowed)
          return {
            error:
              "history access is off. Enable sharing in Privacy settings and include history in this request.",
          };
        const workouts =
          await sql`SELECT exercise,sets,reps,weight_kg,weight_as_entered,weight_unit,rpe FROM firstrep_workout_entries WHERE user_id=${user.id} AND date=${today}`;
        const foods =
          await sql`SELECT food,protein_g,carbs_g,fat_g,calories FROM firstrep_food_entries WHERE user_id=${user.id} AND date=${today}`;
        return {
          date: today,
          workouts,
          foods,
          totals: {
            sets: workouts.reduce((n, w) => n + Number(w.sets), 0),
            protein_g: foods.reduce((n, f) => n + Number(f.protein_g ?? 0), 0),
            carbs_g: foods.reduce((n, f) => n + Number(f.carbs_g ?? 0), 0),
            fat_g: foods.reduce((n, f) => n + Number(f.fat_g ?? 0), 0),
            calories: foods.reduce((n, f) => n + Number(f.calories ?? 0), 0),
          },
          note: "Totals include known values only. Null nutrients/calories are unknown, not zero.",
        };
      }
      if (name === "log_workout_set" || name === "log_food") {
        const action = await createAction(
          user,
          body.conversationId,
          keyPrefix + `draft-${draftIndex++}`,
          name === "log_food" ? "food" : "workout_set",
          input,
          sql,
          body.mode,
        );
        if (!pendingActions.some((a) => a.id === action.id))
          pendingActions.push(action);
        return {
          status: action.status,
          draft: action,
          message:
            "Draft created, awaiting user confirmation. Nothing saved to the logs.",
        };
      }
      throw new Error("Unknown tool. No action performed.");
    },
  });
  return {
    replyText: body.mode === "voice" ? spokenText(replyText) : replyText,
    pendingActions,
    exerciseChoices,
  };
}
