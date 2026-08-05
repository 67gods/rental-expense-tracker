CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"holder_actor_id" uuid,
	"holder_name" text,
	"label" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_identity" UNIQUE NULLS NOT DISTINCT("bank_name","holder_actor_id","holder_name","label"),
	CONSTRAINT "bank_accounts_bank_present" CHECK (length(btrim("bank_accounts"."bank_name")) > 0),
	CONSTRAINT "bank_accounts_holder_one_of" CHECK (("bank_accounts"."holder_actor_id" IS NOT NULL) <> ("bank_accounts"."holder_name" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "interest_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"tax_year" bigint NOT NULL,
	"actor_id" uuid NOT NULL,
	"interest_cents" bigint NOT NULL,
	"early_withdrawal_penalty_cents" bigint,
	"savings_bond_interest_cents" bigint,
	"federal_tax_withheld_cents" bigint,
	"tax_exempt_interest_cents" bigint,
	"document_source" text,
	"document_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interest_years_interest_non_negative" CHECK ("interest_years"."interest_cents" >= 0),
	CONSTRAINT "interest_years_penalty_non_negative" CHECK ("interest_years"."early_withdrawal_penalty_cents" IS NULL OR "interest_years"."early_withdrawal_penalty_cents" >= 0),
	CONSTRAINT "interest_years_savings_bond_non_negative" CHECK ("interest_years"."savings_bond_interest_cents" IS NULL OR "interest_years"."savings_bond_interest_cents" >= 0),
	CONSTRAINT "interest_years_withheld_non_negative" CHECK ("interest_years"."federal_tax_withheld_cents" IS NULL OR "interest_years"."federal_tax_withheld_cents" >= 0),
	CONSTRAINT "interest_years_tax_exempt_non_negative" CHECK ("interest_years"."tax_exempt_interest_cents" IS NULL OR "interest_years"."tax_exempt_interest_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_holder_actor_id_actors_id_fk" FOREIGN KEY ("holder_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_years" ADD CONSTRAINT "interest_years_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_years" ADD CONSTRAINT "interest_years_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_years_account_year" ON "interest_years" USING btree ("bank_account_id","tax_year");--> statement-breakpoint
CREATE INDEX "interest_years_tax_year_idx" ON "interest_years" USING btree ("tax_year");