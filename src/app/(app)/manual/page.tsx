import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { manualTransactions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { formatISO } from "date-fns";

const PLAID_CATEGORIES = [
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "ENTERTAINMENT",
  "TRANSPORTATION",
  "GENERAL_SERVICES",
  "PERSONAL_CARE",
  "HOME_IMPROVEMENT",
  "RENT_AND_UTILITIES",
  "LOAN_PAYMENTS",
  "MEDICAL",
  "TRAVEL",
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "BANK_FEES",
  "GOVERNMENT_AND_NON_PROFIT",
  "OTHER",
];

type ManualKind = "cash_spend" | "cash_income" | "cash_gift" | "other";
const KINDS: ManualKind[] = ["cash_spend", "cash_income", "cash_gift", "other"];

export default async function ManualPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const entries = await db
    .select()
    .from(manualTransactions)
    .where(eq(manualTransactions.userId, userId))
    .orderBy(desc(manualTransactions.date), desc(manualTransactions.createdAt))
    .limit(100);

  async function addEntry(formData: FormData) {
    "use server";
    const sess = await auth();
    if (!sess?.user?.id) return;
    const amountRaw = Number(formData.get("amount"));
    if (!Number.isFinite(amountRaw) || Math.abs(amountRaw) > 1_000_000) return;
    const description = String(formData.get("description") ?? "").trim();
    if (!description) return;
    const kindInput = String(formData.get("kind") ?? "other") as ManualKind;
    const kind: ManualKind = KINDS.includes(kindInput) ? kindInput : "other";
    const dateStr =
      String(formData.get("date") ?? "") ||
      formatISO(new Date(), { representation: "date" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    await db.insert(manualTransactions).values({
      userId: sess.user.id,
      amount: amountRaw.toFixed(2),
      date: dateStr,
      description,
      merchantName: String(formData.get("merchantName") ?? "").trim() || null,
      categoryPrimary:
        String(formData.get("categoryPrimary") ?? "").trim() || null,
      kind,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    revalidatePath("/manual");
  }

  async function deleteEntry(formData: FormData) {
    "use server";
    const sess = await auth();
    if (!sess?.user?.id) return;
    const id = Number(formData.get("id"));
    if (!Number.isInteger(id)) return;
    await db
      .delete(manualTransactions)
      .where(
        and(
          eq(manualTransactions.id, id),
          eq(manualTransactions.userId, sess.user.id)
        )
      );
    revalidatePath("/manual");
  }

  const today = formatISO(new Date(), { representation: "date" });

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Add a manual entry</CardTitle>
          <CardDescription>
            Cash spending, gifts received, tips given — anything outside your
            linked bank accounts. Positive amount = money out, negative =
            money in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addEntry} className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>Amount</span>
              <Input
                name="amount"
                type="number"
                step="0.01"
                required
                placeholder="12.00"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Date</span>
              <Input name="date" type="date" defaultValue={today} />
            </label>
            <label className="flex flex-col gap-1 text-sm col-span-2">
              <span>Description</span>
              <Input
                name="description"
                required
                placeholder="Lunch at Chipotle"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Merchant / source</span>
              <Input name="merchantName" placeholder="Chipotle or Mom" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Kind</span>
              <select
                name="kind"
                defaultValue="cash_spend"
                className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
              >
                <option value="cash_spend">Cash spend</option>
                <option value="cash_income">Cash income</option>
                <option value="cash_gift">Cash gift</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm col-span-2">
              <span>Category</span>
              <select
                name="categoryPrimary"
                defaultValue="FOOD_AND_DRINK"
                className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
              >
                {PLAID_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm col-span-2">
              <span>Notes (optional)</span>
              <Input name="notes" />
            </label>
            <div className="col-span-2">
              <Button type="submit">Log entry</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent manual entries</CardTitle>
          <CardDescription>
            These roll up into spending analysis and budgets alongside your
            bank transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No manual entries yet. Text the assistant &ldquo;spent $12 cash
              on lunch&rdquo; or add one above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 text-left">
                <tr>
                  <th className="py-1">Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Kind</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-100">
                    <td className="py-2 text-neutral-500">{e.date}</td>
                    <td>
                      {e.description}
                      {e.merchantName ? (
                        <span className="text-neutral-400"> · {e.merchantName}</span>
                      ) : null}
                    </td>
                    <td className="text-neutral-500">{e.categoryPrimary}</td>
                    <td className="text-neutral-500">{e.kind}</td>
                    <td className="text-right font-medium">
                      {formatMoney(e.amount)}
                    </td>
                    <td className="text-right">
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          type="submit"
                          className="text-xs text-neutral-500 hover:text-red-600"
                        >
                          delete
                        </button>
                      </form>
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
