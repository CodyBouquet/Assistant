import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { plaidAccounts, plaidItems, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deriveBudgetsForUser } from "@/lib/budget";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlaidLinkButton } from "@/components/plaid-link-button";

export default async function SetupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [current] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId));

  const items = await db
    .select({ id: plaidItems.id, institutionName: plaidItems.institutionName })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));

  const accounts = await db
    .select({
      id: plaidAccounts.id,
      name: plaidAccounts.name,
      mask: plaidAccounts.mask,
    })
    .from(plaidAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(eq(plaidItems.userId, userId));

  async function saveSettings(formData: FormData) {
    "use server";
    const sess = await auth();
    if (!sess?.user?.id) return;
    const values = {
      userId: sess.user.id,
      zip: String(formData.get("zip") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      payCadence:
        (String(formData.get("payCadence") ?? "") as
          | "weekly"
          | "biweekly"
          | "semimonthly"
          | "monthly"
          | "irregular") || null,
      monthlyIncomeEstimate: formData.get("monthlyIncome")
        ? String(formData.get("monthlyIncome"))
        : null,
      proactiveSms: formData.get("proactiveSms") === "on",
      updatedAt: new Date(),
    };
    await db
      .insert(settings)
      .values({
        userId: values.userId,
        zip: values.zip,
        phone: values.phone,
        payCadence: values.payCadence ?? undefined,
        monthlyIncomeEstimate: values.monthlyIncomeEstimate ?? undefined,
        proactiveSms: values.proactiveSms,
      })
      .onConflictDoUpdate({
        target: settings.userId,
        set: {
          zip: values.zip,
          phone: values.phone,
          payCadence: values.payCadence ?? undefined,
          monthlyIncomeEstimate: values.monthlyIncomeEstimate ?? undefined,
          proactiveSms: values.proactiveSms,
          updatedAt: values.updatedAt,
        },
      });
  }

  async function rederiveBudgets() {
    "use server";
    const sess = await auth();
    if (!sess?.user?.id) return;
    await deriveBudgetsForUser(sess.user.id);
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Zip gives Claude regional context. Pay cadence helps it reason about
            affordability until Plaid Income auto-detects it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveSettings} className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>Zip code</span>
              <Input
                name="zip"
                defaultValue={current?.zip ?? ""}
                placeholder="46303"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Phone (E.164, e.g. +13125551234)</span>
              <Input
                name="phone"
                defaultValue={current?.phone ?? ""}
                placeholder="+1..."
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Pay cadence</span>
              <select
                name="payCadence"
                defaultValue={current?.payCadence ?? ""}
                className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
              >
                <option value="">—</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semimonthly">Semi-monthly (1st/15th)</option>
                <option value="monthly">Monthly</option>
                <option value="irregular">Irregular</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Est. monthly income</span>
              <Input
                name="monthlyIncome"
                type="number"
                step="0.01"
                defaultValue={current?.monthlyIncomeEstimate ?? ""}
              />
            </label>
            <label className="flex items-center gap-2 text-sm col-span-2">
              <input
                type="checkbox"
                name="proactiveSms"
                defaultChecked={current?.proactiveSms ?? true}
              />
              <span>Allow proactive SMS from the assistant</span>
            </label>
            <div className="col-span-2">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked banks</CardTitle>
          <CardDescription>
            Using Plaid Development (free up to 100 Items).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.length === 0 ? (
            <div className="text-sm text-neutral-500">
              No banks linked yet.
            </div>
          ) : (
            <ul className="text-sm flex flex-col gap-2">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>{i.institutionName ?? "Bank"}</span>
                  <span className="text-neutral-500">
                    {accounts.filter(() => true).length} accounts
                  </span>
                </li>
              ))}
            </ul>
          )}
          <PlaidLinkButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
          <CardDescription>
            Auto-derived from your last 90 days of transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={rederiveBudgets}>
            <Button type="submit" variant="secondary">
              Re-derive from history
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
