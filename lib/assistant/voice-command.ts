import { db, HttpError } from "../database.ts";
import { voiceCommand } from "./voice.ts";
import { changeAction, type Actor } from "./actions.ts";
export async function handleVoiceCommand(
  user: Actor,
  conversationId: string,
  prompt: string,
  activeActionId?: string,
  payload?: unknown,
  sql = db(),
) {
  const operation = voiceCommand(prompt);
  if (!operation) return null;
  if (!activeActionId)
    return {
      replyText:
        "There is no reviewed draft selected. Review a draft before confirming.",
      pendingActions: [],
    };
  const [target] =
    await sql`SELECT id,status,kind FROM pending_log_actions WHERE id=${activeActionId} AND user_id=${user.id} AND conversation_id=${conversationId}`;
  if (!target) throw new HttpError("Draft not found.", 404);
  const pending =
    await sql`SELECT id,kind,status,payload,expires_at FROM pending_log_actions WHERE user_id=${user.id} AND conversation_id=${conversationId} AND status='pending' ORDER BY created_at,id`;
  if (target.status === "pending" && pending.at(-1)?.id !== activeActionId)
    return {
      replyText:
        "Please review the most recent draft. Saying yes applies only to that draft; use its card to confirm another.",
      pendingActions: pending,
    };
  const result = await changeAction(
    user,
    activeActionId,
    conversationId,
    operation,
    payload,
    sql,
    true,
  );
  const remaining =
    await sql`SELECT id,kind,status,payload,expires_at FROM pending_log_actions WHERE user_id=${user.id} AND conversation_id=${conversationId} AND (status='pending' OR id=${activeActionId}) ORDER BY created_at,id`;
  return {
    replyText:
      result.status === "confirmed"
        ? `Saved to your ${target.kind === "food" ? "food" : "workout"} log.${pending.length > 1 ? " Only the most recent draft was confirmed; the other card still needs confirmation." : ""}`
        : result.status === "cancelled"
          ? "Draft cancelled. Nothing was added."
          : "That draft has expired. Please send a new logging request.",
    pendingActions: remaining,
    actionResult: { id: activeActionId, ...result },
  };
}
