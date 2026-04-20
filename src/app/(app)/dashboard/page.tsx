import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  bills,
  plaidAccounts,
  plaidItems,
  settings,
  transactions,
} from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { formatISO, subDays } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [setting] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId));

  const accountRows = await db
    .select({
      id: plaidAccounts.id,
      name: plaidAccounts.name,
      mask: plaidAccounts.mask,
      current: plaidAccounts.currentBalance,
    })
    .from(plaidAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(eq(plaidItems.userId, userId));

  const totalCash = accountRows.reduce(
    (acc, a) => acc + Number(a.current ?? 0),
    0
  );

  const since = formatISO(subDays(new Date(), 30), { representation: "date" });
  const [spend] = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
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
    );

  const upcoming = await db
    .select()
    .from(bills)
    .where(eq(bills.userId, userId))
    .orderBy(bills.nextDueDate)
    .limit(5);

  const needsSetup = !setting?.zip || !setting?.payCadence || !setting?.phone;
  const needsLink = accountRows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {(needsSetup || needsLink) && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-amber-900">
                Finish setting things up
              </div>
              <div className="text-sm text-amber-800">
                {needsSetup && "Add your zip, pay cadence, and phone. "}
                {needsLink && "Link a bank through Plaid."}
              </div>
            </div>
            <Link
              href="/setup"
              className="text-sm font-medium text-amber-900 underline"
            >
              Go to setup →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cash on hand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatMoney(totalCash)}
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Across {accountRows.length} linked account
              {accountRows.length === 1 ? "" : "s"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Last 30d spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatMoney(spend?.total)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next bills</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="text-sm text-neutral-500">None tracked yet.</div>
            ) : (
              <ul className="text-sm flex flex-col gap-1">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex justify-between">
                    <span>{b.name}</span>
                    <span className="text-neutral-500">
                      {b.nextDueDate} · {formatMoney(b.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accountRows.length === 0 ? (
            <div className="text-sm text-neutral-500">
              No accounts linked.{" "}
              <Link href="/setup" className="underline">
                Link one
              </Link>
              .
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {accountRows.map((a) => (
                <li key={a.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {a.name}
                    {a.mask ? (
                      <span className="text-neutral-400"> ··{a.mask}</span>
                    ) : null}
                  </span>
                  <span className="font-medium">{formatMoney(a.current)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
