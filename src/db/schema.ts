import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  serial,
  primaryKey,
  index,
  uniqueIndex,
  pgEnum,
  date,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const payCadenceEnum = pgEnum("pay_cadence", [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "irregular",
]);

export const smsDirectionEnum = pgEnum("sms_direction", ["in", "out"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "tool"]);
export const budgetMethodEnum = pgEnum("budget_method", ["derived", "manual"]);
export const billCadenceEnum = pgEnum("bill_cadence", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "once",
]);
export const eventSourceEnum = pgEnum("event_source", ["local", "google"]);
export const manualTxKindEnum = pgEnum("manual_tx_kind", [
  "cash_spend",
  "cash_income",
  "cash_gift",
  "other",
]);

// ---- Auth.js tables ----
export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

// ---- App tables ----
export const settings = pgTable("settings", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  zip: text("zip"),
  phone: text("phone"),
  payCadence: payCadenceEnum("pay_cadence"),
  monthlyIncomeEstimate: numeric("monthly_income_estimate", {
    precision: 12,
    scale: 2,
  }),
  timezone: text("timezone").default("America/Chicago").notNull(),
  proactiveSms: boolean("proactive_sms").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const plaidItems = pgTable(
  "plaid_item",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().unique(),
    accessToken: text("access_token").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    cursor: text("cursor"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("plaid_item_user_idx").on(t.userId)]
);

export const plaidAccounts = pgTable(
  "plaid_account",
  {
    id: serial("id").primaryKey(),
    plaidItemId: integer("plaid_item_id")
      .notNull()
      .references(() => plaidItems.id, { onDelete: "cascade" }),
    plaidAccountId: text("plaid_account_id").notNull().unique(),
    name: text("name").notNull(),
    officialName: text("official_name"),
    mask: text("mask"),
    type: text("type"),
    subtype: text("subtype"),
    currentBalance: numeric("current_balance", { precision: 12, scale: 2 }),
    availableBalance: numeric("available_balance", { precision: 12, scale: 2 }),
    currency: text("currency").default("USD"),
    lastSyncedAt: timestamp("last_synced_at"),
  }
);

export const transactions = pgTable(
  "transaction",
  {
    id: serial("id").primaryKey(),
    plaidAccountId: integer("plaid_account_id")
      .notNull()
      .references(() => plaidAccounts.id, { onDelete: "cascade" }),
    plaidTransactionId: text("plaid_transaction_id").notNull().unique(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    isoCurrency: text("iso_currency").default("USD"),
    date: date("date").notNull(),
    authorizedDate: date("authorized_date"),
    name: text("name").notNull(),
    merchantName: text("merchant_name"),
    categoryPrimary: text("category_primary"),
    categoryDetailed: text("category_detailed"),
    pending: boolean("pending").default(false).notNull(),
    paymentChannel: text("payment_channel"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tx_date_idx").on(t.date),
    index("tx_account_date_idx").on(t.plaidAccountId, t.date),
    index("tx_category_idx").on(t.categoryPrimary),
  ]
);

export const budgets = pgTable(
  "budget",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    monthlyAmount: numeric("monthly_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    method: budgetMethodEnum("method").default("derived").notNull(),
    // Stats used for unusual-spend detection:
    historicalMean: numeric("historical_mean", { precision: 12, scale: 2 }),
    historicalStddev: numeric("historical_stddev", { precision: 12, scale: 2 }),
    derivedAt: timestamp("derived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("budget_user_category_uniq").on(t.userId, t.category)]
);

export const bills = pgTable(
  "bill",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    cadence: billCadenceEnum("cadence").default("monthly").notNull(),
    nextDueDate: date("next_due_date").notNull(),
    paidThroughDate: date("paid_through_date"),
    autopay: boolean("autopay").default(false).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("bill_due_idx").on(t.userId, t.nextDueDate)]
);

export const todos = pgTable(
  "todo",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: date("due_date"),
    done: boolean("done").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("todo_user_idx").on(t.userId)]
);

export const events = pgTable(
  "event",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    start: timestamp("start").notNull(),
    end: timestamp("end"),
    location: text("location"),
    notes: text("notes"),
    source: eventSourceEnum("source").default("local").notNull(),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("event_start_idx").on(t.userId, t.start)]
);

// Manual transactions — cash purchases, gifts received, anything outside
// linked bank accounts. Kept separate from Plaid-sourced transactions so
// the sync pipeline stays simple; unioned at read time for spend analysis.
export const manualTransactions = pgTable(
  "manual_transaction",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Match Plaid convention: positive = outflow (money leaving user),
    // negative = inflow (money received).
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    merchantName: text("merchant_name"),
    categoryPrimary: text("category_primary"),
    kind: manualTxKindEnum("kind").default("other").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("manual_tx_user_date_idx").on(t.userId, t.date),
    index("manual_tx_user_created_idx").on(t.userId, t.createdAt),
    index("manual_tx_category_idx").on(t.categoryPrimary),
  ]
);

export const smsMessages = pgTable(
  "sms_message",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    direction: smsDirectionEnum("direction").notNull(),
    body: text("body").notNull(),
    twilioSid: text("twilio_sid"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sms_user_created_idx").on(t.userId, t.createdAt)]
);

export const chatMessages = pgTable(
  "chat_message",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    role: chatRoleEnum("role").notNull(),
    // Content stored as the Anthropic SDK block array (text, tool_use, tool_result, etc.)
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chat_conv_idx").on(t.conversationId, t.createdAt)]
);
