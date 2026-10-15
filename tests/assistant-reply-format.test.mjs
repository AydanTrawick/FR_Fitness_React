import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAssistantReply } from "../lib/assistant/reply-format.ts";
import { spokenText } from "../lib/assistant/voice.ts";
import { assistantSystem } from "../lib/assistant/prompt.ts";
test("workout quantities, ranges and units become pronounceable prose", () => {
  assert.equal(
    formatAssistantReply("Do 3×10 at 225lbs, RPE 7.5. Rest 60–90 seconds!"),
    "Do three times ten at two hundred twenty five pounds, R P E seven point five. Rest sixty to ninety seconds.",
  );
  assert.equal(
    formatAssistantReply("Add 2.5kg or 5 lb. Target 80% of your 1RM."),
    "Add two point five kilograms or five pounds. Target eighty percent of your one rep maximum.",
  );
});
test("keeps comma separators, spells large and fractional numbers without rounding", () => {
  assert.equal(
    formatAssistantReply("10,000 kg. Sets 3, 4, and 5."),
    "ten thousand kilograms. Sets three, four, and five.",
  );
  assert.equal(
    formatAssistantReply("Use .5 g, -2.25 kg, and 1/2 a serving."),
    "Use zero point five grams, minus two point two five kilograms, and one over two a serving.",
  );
  assert.equal(
    formatAssistantReply("9007199254740993"),
    "nine quadrillion seven trillion one hundred ninety nine billion two hundred fifty four million seven hundred forty thousand nine hundred ninety three",
  );
  assert.equal(
    formatAssistantReply("Your 1st, 2nd, 3rd and 21st sets."),
    "Your first, second, third and twenty first sets.",
  );
});
test("only periods and commas survive, contractions expand and output is idempotent", () => {
  const reply = formatAssistantReply(
    "**You’re ready!**\n- Don’t rush: use a slow-tempo (controlled) rep.\n- [Next](https://example.com): 8–12 reps; you’ll improve.",
  );
  assert.equal(
    reply,
    "You are ready. Do not rush, use a slow tempo controlled rep. Next, eight to twelve reps. you will improve.",
  );
  assert.doesNotMatch(reply, /[^\p{L}\p{M}\s.,]/u);
  assert.equal(formatAssistantReply(reply), reply);
  assert.equal(
    formatAssistantReply("2026-10-15"),
    "October fifteenth, two thousand twenty six",
  );
  assert.equal(formatAssistantReply("½ a serving"), "one over two a serving");
  assert.equal(spokenText(reply), reply);
});
test("model instructions apply prose formatting without changing numeric tool arguments", () => {
  const system = assistantSystem("2026-10-15", "America/New_York", "lb", false);
  assert.match(system, /Spell every number fully/);
  assert.match(
    system,
    /Tool calls must retain their required JSON structure, numeric values/,
  );
});
