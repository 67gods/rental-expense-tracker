ALTER TYPE "public"."document_type" ADD VALUE 'form_1098' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'closing_disclosure' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "cpa_figures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"tax_year" bigint NOT NULL,
	"kind" text NOT NULL,
	"category_id" text,
	"schedule_e_line" bigint,
	"label" text NOT NULL,
	"recovery_years" numeric(4, 1),
	"amount_cents" bigint NOT NULL,
	"source_note" text NOT NULL,
	"entered_by_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cpa_figures_label_present" CHECK (length(btrim("cpa_figures"."label")) > 0),
	CONSTRAINT "cpa_figures_source_present" CHECK (length(btrim("cpa_figures"."source_note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"paid_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"is_scheduled" boolean DEFAULT false NOT NULL,
	"method" text,
	"reference" text,
	"receipt_key" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_payments_amount_positive" CHECK ("expense_payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"property_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_title_present" CHECK (length(btrim("jobs"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "property_loan_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"tax_year" bigint NOT NULL,
	"lender_name" text NOT NULL,
	"interest_cents" bigint,
	"points_cents" bigint,
	"mortgage_insurance_cents" bigint,
	"property_tax_cents" bigint,
	"property_tax_source" text,
	"insurance_paid_from_escrow_cents" bigint,
	"insurance_source" text,
	"escrow_balance_cents" bigint,
	"origination_date" date,
	"original_principal_cents" bigint,
	"interest_rate_pct" numeric(6, 4),
	"document_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loan_years_lender_present" CHECK (length(btrim("property_loan_years"."lender_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "property_management_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"manager_actor_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mgmt_periods_date_order" CHECK ("property_management_periods"."end_date" IS NULL OR "property_management_periods"."end_date" >= "property_management_periods"."start_date")
);
--> statement-breakpoint
CREATE TABLE "rent_reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_recon_items_non_zero" CHECK ("rent_reconciliation_items"."amount_cents" <> 0),
	CONSTRAINT "rent_recon_items_kind_present" CHECK (length(btrim("rent_reconciliation_items"."kind")) > 0)
);
--> statement-breakpoint
CREATE TABLE "rent_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"tax_year" bigint NOT NULL,
	"payer_actor_id" uuid,
	"reported_gross_cents" bigint,
	"document_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "cost_treatment_override" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "placed_in_service_date" date;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "placed_in_service_evidence" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "first_tenant_date" date;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "purchase_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "closing_costs_cents" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "land_value_cents" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "was_personal_residence" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "converted_to_rental_date" date;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "fmv_at_conversion_cents" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sold_date" date;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sale_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "section_469_activity" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "rules_version" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cost_treatment_override" text;--> statement-breakpoint
ALTER TABLE "cpa_figures" ADD CONSTRAINT "cpa_figures_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpa_figures" ADD CONSTRAINT "cpa_figures_entered_by_actor_id_actors_id_fk" FOREIGN KEY ("entered_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_loan_years" ADD CONSTRAINT "property_loan_years_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_management_periods" ADD CONSTRAINT "property_management_periods_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_management_periods" ADD CONSTRAINT "property_management_periods_manager_actor_id_actors_id_fk" FOREIGN KEY ("manager_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_reconciliation_items" ADD CONSTRAINT "rent_reconciliation_items_reconciliation_id_rent_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."rent_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_reconciliations" ADD CONSTRAINT "rent_reconciliations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_reconciliations" ADD CONSTRAINT "rent_reconciliations_payer_actor_id_actors_id_fk" FOREIGN KEY ("payer_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cpa_figures_property_year_kind_label" ON "cpa_figures" USING btree ("property_id","tax_year","kind","label");--> statement-breakpoint
CREATE INDEX "cpa_figures_tax_year_idx" ON "cpa_figures" USING btree ("tax_year");--> statement-breakpoint
CREATE INDEX "expense_payments_expense_idx" ON "expense_payments" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_payments_paid_date_idx" ON "expense_payments" USING btree ("paid_date");--> statement-breakpoint
CREATE INDEX "jobs_property_idx" ON "jobs" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_years_property_year_lender" ON "property_loan_years" USING btree ("property_id","tax_year","lender_name");--> statement-breakpoint
CREATE INDEX "loan_years_tax_year_idx" ON "property_loan_years" USING btree ("tax_year");--> statement-breakpoint
CREATE INDEX "mgmt_periods_property_idx" ON "property_management_periods" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mgmt_periods_one_open_per_property" ON "property_management_periods" USING btree ("property_id") WHERE "property_management_periods"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX "rent_recon_items_parent_idx" ON "rent_reconciliation_items" USING btree ("reconciliation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rent_recon_property_year" ON "rent_reconciliations" USING btree ("property_id","tax_year");--> statement-breakpoint
CREATE INDEX "rent_recon_tax_year_idx" ON "rent_reconciliations" USING btree ("tax_year");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_job_idx" ON "expenses" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "time_entries_job_idx" ON "time_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "trips_job_idx" ON "trips" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_money_non_negative" CHECK (("properties"."purchase_price_cents" IS NULL OR "properties"."purchase_price_cents" >= 0)
        AND ("properties"."closing_costs_cents" IS NULL OR "properties"."closing_costs_cents" >= 0)
        AND ("properties"."land_value_cents" IS NULL OR "properties"."land_value_cents" >= 0)
        AND ("properties"."fmv_at_conversion_cents" IS NULL OR "properties"."fmv_at_conversion_cents" >= 0)
        AND ("properties"."sale_price_cents" IS NULL OR "properties"."sale_price_cents" >= 0));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_sold_after_acquired" CHECK ("properties"."sold_date" IS NULL OR "properties"."acquired_date" IS NULL OR "properties"."sold_date" >= "properties"."acquired_date");--> statement-breakpoint
--
-- BACKFILL (hand-written, not generated)
--
-- Every expense gains the one payment row that says "paid in full, on the
-- invoice date". Without this, moving the reports from expenses.amount_cents to
-- settled payments would make every historical expense read as unpaid on the
-- day this migration ran.
--
-- Idempotent: the NOT EXISTS guard means a re-run adds nothing, so a partially
-- applied migration can be finished rather than needing to be unpicked.
--
-- amount_cents > 0 because expense_payments requires a positive amount while
-- expenses permits zero. A zero-amount expense therefore ends up with no
-- payment row, which is correct - there was no cash event - and integrity.ts
-- exempts it from the "every expense has a payment" check rather than
-- inventing a zero payment to satisfy a rule.
INSERT INTO "expense_payments" ("expense_id", "paid_date", "amount_cents", "is_scheduled")
SELECT e."id", e."date", e."amount_cents", false
FROM "expenses" e
WHERE e."amount_cents" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "expense_payments" p WHERE p."expense_id" = e."id"
  );
