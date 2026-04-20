import { db } from "@/db";
import { budgets, plaidAccounts, plaidItems, transactions } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { formatISO, subDays } from "date-fns";

const EXCLUDED_CATEGORIES = new Set([
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
]);

// Derive per-category monthly budgets from the last 90 days of transactions.
// Stats (mean and stddev) are stored for unusual-spend detection.
export async function deriveBudgetsForUser(userId: string) {
  const since = formatISO(subDays(new Date(), 90), { representation: "date" });

  // Aggregate per month per category so we can compute mean/stddev across 3 months.
  const rows = await db
    .select({
      category: transactions.categoryPrimary,
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      total: sql<string>`sum(${transactions.amount})`,
      count: sql<number>`count(*)::int`,
      mean: sql<string>`avg(${transactions.amount})`,
      stddev: sql<string>`coalesce(stddev_pop(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(
      plaidAccounts,
      eq(plaidAccounts.id, transactions.plaidAccountId)
    )
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(
      and(
        eq(plaidItems.userId, userId),
        gte(transactions.date, since),
        sql`${transactions.amount} > 0`
      )
    )
    .groupBy(
      transactions.categoryPrimary,
      sql`to_char(${transactions.date}, 'YYYY-MM')`
    );

  // Fold per-month totals into per-category aggregate.
  const byCategory = new Map<
    string,
    { monthTotals: number[]; txMean: number; txStddev: number; count: number }
  >();
  for (const r of rows) {
    const cat = r.category ?? "UNCATEGORIZED";
    if (EXCLUDED_CATEGORIES.has(cat)) continue;
    const entry = byCategory.get(cat) ?? {
      monthTotals: [],
      txMean: 0,
      txStddev: 0,
      count: 0,
    };
    entry.monthTotals.push(Number(r.total));
    entry.txMean = Number(r.mean);
    entry.txStddev = Number(r.stddev);
    entry.count += r.count;
    byCategory.set(cat, entry);
  }

  const derivedAt = new Date();

  for (const [category, v] of byCategory) {
    if (v.count < 3) continue; // skip categories with too little signal
    const avgMonthly =
      v.monthTotals.reduce((a, b) => a + b, 0) / v.monthTotals.length;
    const monthlyAmount = Math.round(avgMonthly * 1.1 * 100) / 100; // +10% cushion
    await db
      .insert(budgets)
      .values({
        userId,
        category,
        monthlyAmount: monthlyAmount.toString(),
        method: "derived",
        historicalMean: v.txMean.toString(),
        historicalStddev: v.txStddev.toString(),
        derivedAt,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.category],
        set: {
          monthlyAmount: monthlyAmount.toString(),
          historicalMean: v.txMean.toString(),
          historicalStddev: v.txStddev.toString(),
          derivedAt,
          // Preserve `method` if user already switched to manual.
        },
      });
  }

  return byCategory.size;
}
