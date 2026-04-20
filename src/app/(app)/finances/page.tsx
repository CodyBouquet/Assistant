import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  budgets,
  manualTransactions,
  plaidAccounts,
  plaidItems,
  transactions,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { formatISO, subDays } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export default async function FinancesPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const since = formatISO(subDays(new Date(), 30), { representation: "date" });

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(eq(budgets.userId, userId));

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
      and(eq(plaidItems.userId, userId), gte(transactions.date, since))
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
        eq(manualTransactions.userId, userId),
        gte(manualTransactions.date, since)
      )
    )
    .groupBy(manualTransactions.categoryPrimary);

  const spendMap = new Map<string, number>();
  for (const r of [...plaidSpend, ...manualSpend]) {
    const k = r.category ?? "";
    spendMap.set(k, (spendMap.get(k) ?? 0) + Number(r.total ?? 0));
  }

  const plaidRecent = await db
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
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(transactions.date))
    .limit(20);

  const manualRecent = await db
    .select({
      date: manualTransactions.date,
      name: manualTransactions.description,
      merchant: manualTransactions.merchantName,
      amount: manualTransactions.amount,
      category: manualTransactions.categoryPrimary,
    })
    .from(manualTransactions)
    .where(eq(manualTransactions.userId, userId))
    .orderBy(desc(manualTransactions.date))
    .limit(20);

  const recent = [
    ...plaidRecent.map((r) => ({ ...r, source: "bank" as const })),
    ...manualRecent.map((r) => ({ ...r, source: "cash" as const })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Budgets (this month)</CardTitle>
          <CardDescription>
            Monthly target vs. month-to-date spend per category. Includes
            both bank and{" "}
            <Link href="/manual" className="underline">
              manual cash
            </Link>{" "}
            entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {budgetRows.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No budgets yet — link a bank in Setup to derive them.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {budgetRows.map((b) => {
                const spent = spendMap.get(b.category) ?? 0;
                const budget = Number(b.monthlyAmount);
                const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
                const over = spent > budget;
                return (
                  <li key={b.id} className="py-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{b.category}</span>
                      <span className={over ? "text-red-600" : ""}>
                        {formatMoney(spent)} / {formatMoney(budget)}
                      </span>
                    </div>
                    <div className="h-1.5 mt-1.5 rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className={
                          over ? "h-full bg-red-500" : "h-full bg-neutral-900"
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>
            Bank transactions via Plaid plus any manual cash entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 text-left">
                <tr>
                  <th className="py-1">Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="py-2 text-neutral-500">{r.date}</td>
                    <td>{r.merchant ?? r.name}</td>
                    <td className="text-neutral-500">{r.category}</td>
                    <td className="text-neutral-500">
                      {r.source === "cash" ? "cash" : "bank"}
                    </td>
                    <td className="text-right font-medium">
                      {formatMoney(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
