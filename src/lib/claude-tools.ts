import type Anthropic from "@anthropic-ai/sdk";

// Tool catalog Claude can call. Keep tool names stable — they're referenced by
// Claude across conversations.
export const tools: Anthropic.Tool[] = [
  {
    name: "get_balances",
    description:
      "Return current and available balances for every linked bank account. Use before answering anything about cash on hand or affordability.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_transactions",
    description:
      "Return recent transactions. Use `days` to control the window (default 30). Optional filters let you narrow by category or merchant substring.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
        category: {
          type: "string",
          description: "Exact Plaid primary category, e.g. FOOD_AND_DRINK",
        },
        merchantContains: {
          type: "string",
          description: "Case-insensitive merchant name substring",
        },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      },
    },
  },
  {
    name: "get_spending_by_category",
    description:
      "Sum spending by category over a time window. Returns one row per category with total and transaction count. Use for budget comparisons.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
      },
    },
  },
  {
    name: "get_budget",
    description:
      "Return the user's monthly budget per category, along with current month-to-date spend and historical mean/stddev. Use to answer budget questions or flag overages.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_upcoming_bills",
    description:
      "Return bills due within the next N days (default 14). Includes amount, due date, autopay status.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 120, default: 14 },
      },
    },
  },
  {
    name: "get_income_schedule",
    description:
      "Return the user's pay cadence, estimated monthly income, and next expected paycheck date. Use for affordability reasoning.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_user_context",
    description:
      "Return user profile context: zip code, city/region inferred from zip, timezone, and today's date. Use for cost-of-living reasoning.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "flag_unusual_transactions",
    description:
      "Return transactions from the last `days` that are statistically unusual (>2 stddev above the category's historical mean). You decide whether each is actually noteworthy given context (holidays, known one-offs, etc.).",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 30, default: 3 },
      },
    },
  },
  {
    name: "log_manual_transaction",
    description:
      "Log a transaction the user describes that will NOT appear in their linked bank accounts — cash spending, cash received (gifts, tips, odd jobs), or anything outside Plaid. Default `date` to today unless the user specifies otherwise. Pick a Plaid primary category so the entry rolls up into existing budgets. Use only when the user makes clear it's cash/manual; for ambiguous 'paid $X' mentions, DO NOT log — assume it's a bank transaction that will sync via Plaid.",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description:
            "Positive for money leaving the user's hands (spending), negative for money received (gifts, cash income).",
        },
        description: {
          type: "string",
          description: "Short natural-language description.",
        },
        merchantName: {
          type: "string",
          description:
            "Optional merchant or source of funds (e.g., 'Chipotle', 'Mom').",
        },
        categoryPrimary: {
          type: "string",
          description:
            "Plaid primary category. Pick the closest: FOOD_AND_DRINK, GENERAL_MERCHANDISE, ENTERTAINMENT, TRANSPORTATION, GENERAL_SERVICES, PERSONAL_CARE, HOME_IMPROVEMENT, RENT_AND_UTILITIES, LOAN_PAYMENTS, MEDICAL, TRAVEL, INCOME, TRANSFER_IN, TRANSFER_OUT, BANK_FEES, GOVERNMENT_AND_NON_PROFIT, OTHER.",
        },
        kind: {
          type: "string",
          enum: ["cash_spend", "cash_income", "cash_gift", "other"],
        },
        date: {
          type: "string",
          description: "ISO YYYY-MM-DD. Default to today if user didn't specify.",
        },
        notes: { type: "string" },
      },
      required: ["amount", "description", "kind"],
    },
  },
  {
    name: "delete_manual_transaction",
    description:
      "Delete a manual transaction the user logged. Use when the user says things like 'undo', 'delete the last one', 'scratch that', or names a specific entry. If no id is provided, deletes the user's most recently created manual entry.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description:
            "Specific manual transaction id. Omit to delete the most recent.",
        },
      },
    },
  },
  {
    name: "list_manual_transactions",
    description:
      "List recent manual transactions, newest first. Useful when the user asks 'what did I log?' or before confirming a delete.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: "send_sms",
    description:
      "Send an SMS to the user's registered phone. ONLY call this in proactive/scheduled contexts. Never call in response to an incoming SMS — that reply goes through the webhook response. Keep messages under 320 chars.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", minLength: 1, maxLength: 600 },
      },
      required: ["message"],
    },
  },
];

export type ToolName = (typeof tools)[number]["name"];
