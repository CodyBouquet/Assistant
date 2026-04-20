import { db } from "@/db";
import {
  bills,
  budgets,
  manualTransactions,
  plaidAccounts,
  plaidItems,
  settings,
  transactions,
} from "@/db/schema";
import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { addDays, subDays, formatISO } from "date-fns";
import { sendSms } from "./twilio";

export type ToolContext = {
  userId: string;
  mode: "reactive" | "proactive";
};

type ToolFn = (
  input: Record<string, unknown>,
  ctx: ToolContext
) => Promise<unknown>;

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

const getBalances: ToolFn = async (_input, ctx) => {
  const rows = await db
    .select({
      id: plaidAccounts.id,
      name: plaidAccounts.name,
      mask: plaidAccounts.mask,
      type: plaidAccounts.type,
      subtype: plaidAccounts.subtype,
      current: plaidAccounts.currentBalance,
      available: plaidAccounts.availableBalance,
      currency: plaidAccounts.currency,
    })
    .from(plaidAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(eq(plaidItems.userId, ctx.userId));
  return rows;
};

const getTransactions: ToolFn = async (input, ctx) => {
  const days = num(input.days, 30);
  const category = str(input.category);
  const merchantContains = str(input.merchantContains);
  const limit = num(input.limit, 100);
  const since = formatISO(subDays(new Date(), days), { representation: "date" });

  const plaidConds = [
    eq(plaidItems.userId, ctx.userId),
    gte(transactions.date, since),
  ];
  if (category) plaidConds.push(eq(transactions.categoryPrimary, category));
  if (merchantContains)
    plaidConds.push(ilike(transactions.merchantName, `%${merchantContains}%`));

  const plaidRows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      name: transactions.name,
      merchant: transactions.merchantName,
      category: transactions.categoryPrimary,
      subcategory: transactions.categoryDetailed,
      pending: transactions.pending,
    })
    .from(transactions)
    .innerJoin(
      plaidAccounts,
      eq(plaidAccounts.id, transactions.plaidAccountId)
    )
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(and(...plaidConds))
    .orderBy(desc(transactions.date))
    .limit(limit);

  const manualConds = [
    eq(manualTransactions.userId, ctx.userId),
    gte(manualTransactions.date, since),
  ];
  if (category)
    manualConds.push(eq(manualTransactions.categoryPrimary, category));
  if (merchantContains)
    manualConds.push(
      ilike(manualTransactions.merchantName, `%${merchantContains}%`)
    );

  const manualRows = await db
    .select({
      date: manualTransactions.date,
      amount: manualTransactions.amount,
      name: manualTransactions.description,
      merchant: manualTransactions.merchantName,
      category: manualTransactions.categoryPrimary,
      subcategory: sql<string | null>`null`,
      pending: sql<boolean>`false`,
    })
    .from(manualTransactions)
    .where(and(...manualConds))
    .orderBy(desc(manualTransactions.date))
    .limit(limit);

  const plaidTagged = plaidRows.map((r) => ({ ...r, source: "bank" as const }));
  const manualTagged = manualRows.map((r) => ({
    ...r,
    source: "manual" as const,
  }));
  return [...plaidTagged, ...manualTagged]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
};

const getSpendingByCategory: ToolFn = async (input, ctx) => {
  const days = num(input.days, 30);
  const since = formatISO(subDays(new Date(), days), { representation: "date" });
  const plaidRows = await db
    .select({
      category: transactions.categoryPrimary,
      total: sql<string>`sum(${transactions.amount})`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(
      plaidAccounts,
      eq(plaidAccounts.id, transactions.plaidAccountId)
    )
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(
      and(eq(plaidItems.userId, ctx.userId), gte(transactions.date, since))
    )
    .groupBy(transactions.categoryPrimary);

  const manualRows = await db
    .select({
      category: manualTransactions.categoryPrimary,
      total: sql<string>`sum(${manualTransactions.amount})`,
      count: sql<number>`count(*)::int`,
    })
    .from(manualTransactions)
    .where(
      and(
        eq(manualTransactions.userId, ctx.userId),
        gte(manualTransactions.date, since)
      )
    )
    .groupBy(manualTransactions.categoryPrimary);

  const merged = new Map<string, { total: number; count: number }>();
  for (const r of [...plaidRows, ...manualRows]) {
    const k = r.category ?? "UNCATEGORIZED";
    const cur = merged.get(k) ?? { total: 0, count: 0 };
    cur.total += Number(r.total ?? 0);
    cur.count += r.count;
    merged.set(k, cur);
  }
  return Array.from(merged, ([category, v]) => ({
    category,
    total: v.total.toFixed(2),
    count: v.count,
  }));
};

const getBudget: ToolFn = async (_input, ctx) => {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);
  const since = formatISO(firstOfMonth, { representation: "date" });

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(eq(budgets.userId, ctx.userId));

  const plaidSpend = await db
    .select({
      category: transactions.categoryPrimary,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(
      plaidAccounts,
      eq(plaidAccounts.id, transactions.plaidAccountId)
    )
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(
      and(eq(plaidItems.userId, ctx.userId), gte(transactions.date, since))
    )
    .groupBy(transactions.categoryPrimary);

  const manualSpend = await db
    .select({
      category: manualTransactions.categoryPrimary,
      total: sql<string>`sum(${manualTransactions.amount})`,
    })
    .from(manualTransactions)
    .where(
      and(
        eq(manualTransactions.userId, ctx.userId),
        gte(manualTransactions.date, since)
      )
    )
    .groupBy(manualTransactions.categoryPrimary);

  const spendMap = new Map<string, number>();
  for (const r of [...plaidSpend, ...manualSpend]) {
    const k = r.category ?? "";
    spendMap.set(k, (spendMap.get(k) ?? 0) + Number(r.total ?? 0));
  }
  return budgetRows.map((b) => ({
    category: b.category,
    monthlyBudget: b.monthlyAmount,
    mtdSpend: (spendMap.get(b.category) ?? 0).toFixed(2),
    historicalMean: b.historicalMean,
    historicalStddev: b.historicalStddev,
    method: b.method,
  }));
};

const getUpcomingBills: ToolFn = async (input, ctx) => {
  const days = num(input.days, 14);
  const horizon = formatISO(addDays(new Date(), days), {
    representation: "date",
  });
  const rows = await db
    .select()
    .from(bills)
    .where(
      and(eq(bills.userId, ctx.userId), sql`${bills.nextDueDate} <= ${horizon}`)
    )
    .orderBy(bills.nextDueDate);
  return rows;
};

const getIncomeSchedule: ToolFn = async (_input, ctx) => {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, ctx.userId));
  return {
    payCadence: row?.payCadence ?? null,
    monthlyIncomeEstimate: row?.monthlyIncomeEstimate ?? null,
    // Next paycheck estimation is deferred to a proper Plaid Income pull;
    // return the cadence so Claude can reason about it.
  };
};

const getUserContext: ToolFn = async (_input, ctx) => {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, ctx.userId));
  return {
    zip: row?.zip ?? null,
    timezone: row?.timezone ?? "America/Chicago",
    todayIso: formatISO(new Date(), { representation: "date" }),
  };
};

const flagUnusualTransactions: ToolFn = async (input, ctx) => {
  const days = num(input.days, 3);
  const since = formatISO(subDays(new Date(), days), { representation: "date" });
  const budgetRows = await db
    .select({
      category: budgets.category,
      mean: budgets.historicalMean,
      stddev: budgets.historicalStddev,
    })
    .from(budgets)
    .where(eq(budgets.userId, ctx.userId));
  const stats = new Map(
    budgetRows.map((b) => [
      b.category,
      {
        mean: Number(b.mean ?? 0),
        stddev: Number(b.stddev ?? 0),
      },
    ])
  );
  const txRows = await db
    .select({
      date: transactions.date,
      name: transactions.name,
      merchant: transactions.merchantName,
      amount: transactions.amount,
      category: transactions.categoryPrimary,
    })
    .from(transactions)
    .innerJoin(
      plaidAccounts,
      eq(plaidAccounts.id, transactions.plaidAccountId)
    )
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(
      and(eq(plaidItems.userId, ctx.userId), gte(transactions.date, since))
    );
  return txRows
    .map((t) => {
      const s = stats.get(t.category ?? "");
      if (!s || s.stddev === 0) return null;
      const amt = Number(t.amount);
      const zscore = (amt - s.mean) / s.stddev;
      if (zscore < 2) return null;
      return { ...t, zscore: Math.round(zscore * 10) / 10 };
    })
    .filter(Boolean);
};

type ManualKind = "cash_spend" | "cash_income" | "cash_gift" | "other";
const MANUAL_KINDS: ManualKind[] = [
  "cash_spend",
  "cash_income",
  "cash_gift",
  "other",
];

const logManualTransaction: ToolFn = async (input, ctx) => {
  const amountRaw = input.amount;
  if (typeof amountRaw !== "number" || !Number.isFinite(amountRaw)) {
    throw new Error("amount must be a finite number");
  }
  if (Math.abs(amountRaw) > 1_000_000) {
    throw new Error("amount out of bounds");
  }
  const description = str(input.description);
  if (!description) throw new Error("description is required");

  const kindRaw = str(input.kind);
  const kind: ManualKind = MANUAL_KINDS.includes(kindRaw as ManualKind)
    ? (kindRaw as ManualKind)
    : "other";

  const today = formatISO(new Date(), { representation: "date" });
  const dateStr = str(input.date) ?? today;
  // Accept only YYYY-MM-DD; reject anything else to keep the column clean.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error("date must be YYYY-MM-DD");
  }

  const [row] = await db
    .insert(manualTransactions)
    .values({
      userId: ctx.userId,
      amount: amountRaw.toFixed(2),
      date: dateStr,
      description,
      merchantName: str(input.merchantName) ?? null,
      categoryPrimary: str(input.categoryPrimary) ?? null,
      kind,
      notes: str(input.notes) ?? null,
    })
    .returning();
  return {
    id: row.id,
    amount: row.amount,
    date: row.date,
    description: row.description,
    merchant: row.merchantName,
    category: row.categoryPrimary,
    kind: row.kind,
  };
};

const deleteManualTransaction: ToolFn = async (input, ctx) => {
  const idRaw = input.id;
  if (typeof idRaw === "number" && Number.isInteger(idRaw)) {
    const deleted = await db
      .delete(manualTransactions)
      .where(
        and(
          eq(manualTransactions.id, idRaw),
          eq(manualTransactions.userId, ctx.userId)
        )
      )
      .returning();
    if (deleted.length === 0) {
      return { deleted: false, reason: "no matching entry" };
    }
    return { deleted: true, entry: deleted[0] };
  }
  // No id: delete the most recent.
  const [latest] = await db
    .select()
    .from(manualTransactions)
    .where(eq(manualTransactions.userId, ctx.userId))
    .orderBy(desc(manualTransactions.createdAt))
    .limit(1);
  if (!latest) return { deleted: false, reason: "no manual entries" };
  await db
    .delete(manualTransactions)
    .where(eq(manualTransactions.id, latest.id));
  return { deleted: true, entry: latest };
};

const listManualTransactions: ToolFn = async (input, ctx) => {
  const days = num(input.days, 30);
  const limit = num(input.limit, 20);
  const since = formatISO(subDays(new Date(), days), { representation: "date" });
  const rows = await db
    .select()
    .from(manualTransactions)
    .where(
      and(
        eq(manualTransactions.userId, ctx.userId),
        gte(manualTransactions.date, since)
      )
    )
    .orderBy(desc(manualTransactions.createdAt))
    .limit(limit);
  return rows;
};

const sendSmsTool: ToolFn = async (input, ctx) => {
  if (ctx.mode !== "proactive") {
    throw new Error("send_sms is only available in proactive mode");
  }
  const message = str(input.message);
  if (!message) throw new Error("message is required");
  const sid = await sendSms(ctx.userId, message);
  return { sent: true, twilioSid: sid };
};

const registry: Record<string, ToolFn> = {
  get_balances: getBalances,
  get_transactions: getTransactions,
  get_spending_by_category: getSpendingByCategory,
  get_budget: getBudget,
  get_upcoming_bills: getUpcomingBills,
  get_income_schedule: getIncomeSchedule,
  get_user_context: getUserContext,
  flag_unusual_transactions: flagUnusualTransactions,
  log_manual_transaction: logManualTransaction,
  delete_manual_transaction: deleteManualTransaction,
  list_manual_transactions: listManualTransactions,
  send_sms: sendSmsTool,
};

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const fn = registry[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  return fn(input, ctx);
}
