CREATE TYPE "public"."bill_cadence" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'once');--> statement-breakpoint
CREATE TYPE "public"."budget_method" AS ENUM('derived', 'manual');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('local', 'google');--> statement-breakpoint
CREATE TYPE "public"."manual_tx_kind" AS ENUM('cash_spend', 'cash_income', 'cash_gift', 'other');--> statement-breakpoint
CREATE TYPE "public"."pay_cadence" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular');--> statement-breakpoint
CREATE TYPE "public"."sms_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "bill" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"cadence" "bill_cadence" DEFAULT 'monthly' NOT NULL,
	"next_due_date" date NOT NULL,
	"paid_through_date" date,
	"autopay" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"monthly_amount" numeric(12, 2) NOT NULL,
	"method" "budget_method" DEFAULT 'derived' NOT NULL,
	"historical_mean" numeric(12, 2),
	"historical_stddev" numeric(12, 2),
	"derived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"start" timestamp NOT NULL,
	"end" timestamp,
	"location" text,
	"notes" text,
	"source" "event_source" DEFAULT 'local' NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"merchant_name" text,
	"category_primary" text,
	"kind" "manual_tx_kind" DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_account" (
	"id" serial PRIMARY KEY NOT NULL,
	"plaid_item_id" integer NOT NULL,
	"plaid_account_id" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"mask" text,
	"type" text,
	"subtype" text,
	"current_balance" numeric(12, 2),
	"available_balance" numeric(12, 2),
	"currency" text DEFAULT 'USD',
	"last_synced_at" timestamp,
	CONSTRAINT "plaid_account_plaid_account_id_unique" UNIQUE("plaid_account_id")
);
--> statement-breakpoint
CREATE TABLE "plaid_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"access_token" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"cursor" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_item_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"userId" text PRIMARY KEY NOT NULL,
	"zip" text,
	"phone" text,
	"pay_cadence" "pay_cadence",
	"monthly_income_estimate" numeric(12, 2),
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"proactive_sms" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"direction" "sms_direction" NOT NULL,
	"body" text NOT NULL,
	"twilio_sid" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"plaid_account_id" integer NOT NULL,
	"plaid_transaction_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"iso_currency" text DEFAULT 'USD',
	"date" date NOT NULL,
	"authorized_date" date,
	"name" text NOT NULL,
	"merchant_name" text,
	"category_primary" text,
	"category_detailed" text,
	"pending" boolean DEFAULT false NOT NULL,
	"payment_channel" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_plaid_transaction_id_unique" UNIQUE("plaid_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_transaction" ADD CONSTRAINT "manual_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_account" ADD CONSTRAINT "plaid_account_plaid_item_id_plaid_item_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_item" ADD CONSTRAINT "plaid_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_message" ADD CONSTRAINT "sms_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_plaid_account_id_plaid_account_id_fk" FOREIGN KEY ("plaid_account_id") REFERENCES "public"."plaid_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_due_idx" ON "bill" USING btree ("user_id","next_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_user_category_uniq" ON "budget" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "chat_conv_idx" ON "chat_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "event_start_idx" ON "event" USING btree ("user_id","start");--> statement-breakpoint
CREATE INDEX "manual_tx_user_date_idx" ON "manual_transaction" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "manual_tx_user_created_idx" ON "manual_transaction" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "manual_tx_category_idx" ON "manual_transaction" USING btree ("category_primary");--> statement-breakpoint
CREATE INDEX "plaid_item_user_idx" ON "plaid_item" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_user_created_idx" ON "sms_message" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "todo_user_idx" ON "todo" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tx_date_idx" ON "transaction" USING btree ("date");--> statement-breakpoint
CREATE INDEX "tx_account_date_idx" ON "transaction" USING btree ("plaid_account_id","date");--> statement-breakpoint
CREATE INDEX "tx_category_idx" ON "transaction" USING btree ("category_primary");