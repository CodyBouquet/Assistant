import Anthropic from "@anthropic-ai/sdk";
import { tools } from "./claude-tools";
import { runTool, type ToolContext } from "./claude-dispatch";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";

export type Mode = "reactive" | "proactive";

const reactiveSystem = `You are the user's personal assistant, accessed via web chat or SMS. You help with schedules, finances, bills, and todos.

For money questions, always pull fresh data (balances, transactions, budget, upcoming bills, income schedule) before answering. Do not guess. Spending-analysis tools already include both bank (Plaid) and manually-logged cash entries.

When reasoning about affordability, account for: remaining balance after upcoming bills, typical spending pace for the remainder of the month, and when the next paycheck lands. Give a clear yes/no/tight answer first, then a one-line reason.

**Manual transaction logging.** When the user describes a cash purchase, cash received as a gift, cash tip given, or anything else that will NOT appear in their linked bank accounts, call log_manual_transaction. Rules:
- Positive amount = money leaving their hands; negative = money received.
- Default date to today unless they specify otherwise. Accept natural phrasing like "yesterday" — convert to YYYY-MM-DD.
- Pick the closest Plaid primary category (FOOD_AND_DRINK, ENTERTAINMENT, TRANSPORTATION, INCOME, etc.) so budgets roll up correctly.
- DO NOT log ambiguous "paid $X" mentions without a clear cash/gift/manual cue — those are likely bank transactions that will sync via Plaid, and logging would duplicate.
- After logging, confirm concisely: "Logged $X at Merchant · category." No follow-up questions unless something was genuinely unclear.
- If the user says "undo," "delete that," "scratch it," or similar right after a log, call delete_manual_transaction with no id.

Tone: direct, brief, friendly. For SMS, keep replies under 320 characters. Never call send_sms from reactive mode — the reply is returned as text and sent automatically.`;

const proactiveSystem = `You are running a scheduled check on the user's finances. Your job is to text the user ONLY if something is noteworthy.

Noteworthy means: a bill due within 3 days they might forget, a category that just went over budget, or a genuinely unusual transaction (large, out of pattern, and not explained by known context like a holiday or recurring annual bill).

Workflow:
1. Call flag_unusual_transactions, get_upcoming_bills, and get_budget.
2. Judge whether anything deserves a text. If nothing does, produce a final message of exactly the word SILENT and do not call send_sms.
3. If something does, call send_sms with a single, short, clear message (under 320 chars). Do not call send_sms more than once per run.

Never send marketing fluff, pep talks, or vague reminders. If in doubt, stay silent.`;

const systemFor = (mode: Mode) =>
  mode === "reactive" ? reactiveSystem : proactiveSystem;

export async function runClaude(opts: {
  mode: Mode;
  ctx: ToolContext;
  messages: Anthropic.MessageParam[];
  maxTurns?: number;
}): Promise<{ finalText: string; messages: Anthropic.MessageParam[] }> {
  const maxTurns = opts.maxTurns ?? 8;
  const messages: Anthropic.MessageParam[] = [...opts.messages];

  // Reactive mode: all read/write tools except send_sms (the response is the reply).
  // Proactive mode: read-only tools + send_sms. No manual-tx writes/deletes in
  // proactive mode — the user didn't ask for them, so Claude has no business
  // mutating data during a scheduled run.
  const writeOnlyManualTools = new Set([
    "log_manual_transaction",
    "delete_manual_transaction",
  ]);
  const availableTools =
    opts.mode === "reactive"
      ? tools.filter((t) => t.name !== "send_sms")
      : tools.filter((t) => !writeOnlyManualTools.has(t.name));

  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemFor(opts.mode),
      tools: availableTools,
      messages,
    });

    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") {
      const finalText = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { finalText, messages };
    }

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      try {
        const result = await runTool(
          use.name,
          use.input as Record<string, unknown>,
          opts.ctx
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: err instanceof Error ? err.message : String(err),
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    finalText: "(assistant stopped after reaching max tool-use turns)",
    messages,
  };
}
