import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { db } from "@/db";
import { plaidAccounts, plaidItems, transactions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";
import { logError } from "./logger";

const env = (process.env.PLAID_ENV ?? "development").toLowerCase();
const basePath =
  PlaidEnvironments[env as keyof typeof PlaidEnvironments] ??
  PlaidEnvironments.development;

export const plaid = new PlaidApi(
  new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  })
);

const productsEnv =
  process.env.PLAID_PRODUCTS ?? "transactions,accounts,income_verification";
const products = productsEnv
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean) as Products[];

const countries = (process.env.PLAID_COUNTRY_CODES ?? "US")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean) as CountryCode[];

export async function createLinkToken(userId: string) {
  const resp = await plaid.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Assistant",
    products,
    country_codes: countries,
    language: "en",
    redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
  });
  return resp.data.link_token;
}

export async function exchangePublicToken(userId: string, publicToken: string) {
  const exch = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });
  const accessToken = exch.data.access_token;
  const itemId = exch.data.item_id;

  const itemInfo = await plaid.itemGet({ access_token: accessToken });
  const institutionId = itemInfo.data.item.institution_id ?? null;
  let institutionName: string | null = null;
  if (institutionId) {
    try {
      const inst = await plaid.institutionsGetById({
        institution_id: institutionId,
        country_codes: countries,
      });
      institutionName = inst.data.institution.name;
    } catch {
      // best-effort only
    }
  }

  const [row] = await db
    .insert(plaidItems)
    .values({
      userId,
      itemId,
      accessToken: encryptSecret(accessToken),
      institutionId,
      institutionName,
    })
    .returning();

  await syncAccounts(row.id, accessToken);
  await syncTransactions(row.id);
  return row;
}

// Centralized: read the item and decrypt the token. Rejects any plaintext row
// that snuck in (should never happen, but fail loud if it does).
async function getDecryptedItem(plaidItemId: number) {
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, plaidItemId));
  if (!item) throw new Error(`plaid_item ${plaidItemId} not found`);
  if (!isEncrypted(item.accessToken)) {
    throw new Error(
      `plaid_item ${plaidItemId} has a plaintext access token; refusing to use it`
    );
  }
  return { ...item, accessToken: decryptSecret(item.accessToken) };
}

export async function syncAccounts(plaidItemId: number, accessToken: string) {
  const resp = await plaid.accountsGet({ access_token: accessToken });
  const now = new Date();
  for (const a of resp.data.accounts) {
    const existing = await db
      .select()
      .from(plaidAccounts)
      .where(eq(plaidAccounts.plaidAccountId, a.account_id));
    const values = {
      plaidItemId,
      plaidAccountId: a.account_id,
      name: a.name,
      officialName: a.official_name ?? null,
      mask: a.mask ?? null,
      type: a.type,
      subtype: a.subtype ?? null,
      currentBalance: a.balances.current?.toString() ?? null,
      availableBalance: a.balances.available?.toString() ?? null,
      currency: a.balances.iso_currency_code ?? "USD",
      lastSyncedAt: now,
    };
    if (existing.length) {
      await db
        .update(plaidAccounts)
        .set(values)
        .where(eq(plaidAccounts.plaidAccountId, a.account_id));
    } else {
      await db.insert(plaidAccounts).values(values);
    }
  }
}

// Uses Plaid's /transactions/sync cursor pattern.
export async function syncTransactions(plaidItemId: number) {
  const item = await getDecryptedItem(plaidItemId);
  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  const accountMap = new Map<string, number>();
  const accts = await db
    .select()
    .from(plaidAccounts)
    .where(eq(plaidAccounts.plaidItemId, plaidItemId));
  for (const a of accts) accountMap.set(a.plaidAccountId, a.id);

  while (hasMore) {
    const resp = await plaid.transactionsSync({
      access_token: item.accessToken,
      cursor,
    });
    const { added, modified, removed, next_cursor, has_more } = resp.data;

    for (const tx of added) {
      const acctId = accountMap.get(tx.account_id);
      if (!acctId) continue;
      await db
        .insert(transactions)
        .values({
          plaidAccountId: acctId,
          plaidTransactionId: tx.transaction_id,
          amount: tx.amount.toString(),
          isoCurrency: tx.iso_currency_code ?? "USD",
          date: tx.date,
          authorizedDate: tx.authorized_date ?? null,
          name: tx.name,
          merchantName: tx.merchant_name ?? null,
          categoryPrimary:
            tx.personal_finance_category?.primary ??
            tx.category?.[0] ??
            null,
          categoryDetailed:
            tx.personal_finance_category?.detailed ??
            tx.category?.[1] ??
            null,
          pending: tx.pending,
          paymentChannel: tx.payment_channel,
          raw: tx as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();
    }

    for (const tx of modified) {
      await db
        .update(transactions)
        .set({
          amount: tx.amount.toString(),
          date: tx.date,
          name: tx.name,
          merchantName: tx.merchant_name ?? null,
          pending: tx.pending,
        })
        .where(eq(transactions.plaidTransactionId, tx.transaction_id));
    }

    for (const tx of removed) {
      if (!tx.transaction_id) continue;
      await db
        .delete(transactions)
        .where(eq(transactions.plaidTransactionId, tx.transaction_id));
    }

    cursor = next_cursor;
    hasMore = has_more;
  }

  await db
    .update(plaidItems)
    .set({ cursor })
    .where(eq(plaidItems.id, plaidItemId));

  // Refresh balances opportunistically.
  await syncAccounts(plaidItemId, item.accessToken);
}

export async function syncAllForUser(userId: string) {
  const items = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));
  for (const item of items) {
    try {
      await syncTransactions(item.id);
    } catch (err) {
      logError("plaid.syncAllForUser", err, { plaidItemId: item.id });
    }
  }
}
