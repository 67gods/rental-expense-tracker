CREATE TYPE "public"."actor_type" AS ENUM('owner', 'spouse', 'pm', 'contractor', 'other');--> statement-breakpoint
CREATE TYPE "public"."capital_classification" AS ENUM('repair', 'improvement', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."destination_kind" AS ENUM('property', 'hardware_store', 'contractor', 'bank', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('lease', 'insurance', 'tax', 'inspection', 'w9', 'invoice', 'other');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('manual', 'timer', 'geofence', 'imported');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('residential', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."rent_source" AS ENUM('property_manager', 'direct_from_tenant', 'other');--> statement-breakpoint
CREATE TYPE "public"."turn_status" AS ENUM('open', 'in_progress', 'complete');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "actor_type" NOT NULL,
	"email" text,
	"auth_subject" text,
	"w9_on_file" boolean DEFAULT false NOT NULL,
	"tax_id_collected" boolean DEFAULT false NOT NULL,
	"phone" text,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_name_present" CHECK (length(btrim("actors"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"actor_id" uuid,
	"type" "document_type" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"file_key" text NOT NULL,
	"effective_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"property_type" "property_type" DEFAULT 'residential' NOT NULL,
	"tax_year_active" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"actor_id" uuid NOT NULL,
	"property_id" uuid,
	"turn_id" uuid,
	"amount_cents" bigint NOT NULL,
	"vendor" text NOT NULL,
	"schedule_e_category" text NOT NULL,
	"capital_classification" "capital_classification",
	"classification_answers" jsonb,
	"safe_harbor_flags" jsonb,
	"contractor_actor_id" uuid,
	"receipt_key" text,
	"notes" text,
	"allocation_rule" jsonb,
	"is_backdated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_non_negative" CHECK ("expenses"."amount_cents" >= 0),
	CONSTRAINT "expenses_vendor_present" CHECK (length(btrim("expenses"."vendor")) > 0),
	CONSTRAINT "expenses_property_or_allocation" CHECK ("expenses"."property_id" IS NOT NULL OR "expenses"."allocation_rule" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"address" text NOT NULL,
	"acquired_date" date,
	"unadjusted_basis_cents" bigint DEFAULT 0 NOT NULL,
	"ownership_pct" numeric(5, 2) DEFAULT '100' NOT NULL,
	"is_self_managed" boolean DEFAULT false NOT NULL,
	"is_triple_net" boolean DEFAULT false NOT NULL,
	"had_personal_use" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_ownership_pct_range" CHECK ("properties"."ownership_pct" >= 0 AND "properties"."ownership_pct" <= 100),
	CONSTRAINT "properties_basis_non_negative" CHECK ("properties"."unadjusted_basis_cents" >= 0),
	CONSTRAINT "properties_nickname_present" CHECK (length(btrim("properties"."nickname")) > 0)
);
--> statement-breakpoint
CREATE TABLE "rent_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"actor_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"source" "rent_source" DEFAULT 'property_manager' NOT NULL,
	"notes" text,
	"is_backdated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_receipts_amount_non_negative" CHECK ("rent_receipts"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"actor_id" uuid NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"property_id" uuid,
	"turn_id" uuid,
	"minutes" bigint NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"sh_eligible" boolean NOT NULL,
	"sh_eligible_reason" text NOT NULL,
	"is_provisional" boolean DEFAULT false NOT NULL,
	"linked_expense_id" uuid,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"is_backdated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_minutes_positive" CHECK ("time_entries"."minutes" > 0 AND "time_entries"."minutes" <= 1440),
	CONSTRAINT "time_entries_description_present" CHECK (length(btrim("time_entries"."description")) > 0),
	CONSTRAINT "time_entries_category_present" CHECK (length(btrim("time_entries"."category")) > 0)
);
--> statement-breakpoint
CREATE TABLE "timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"property_id" uuid,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"time_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"actor_id" uuid NOT NULL,
	"property_id" uuid,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"destination_kind" "destination_kind" DEFAULT 'property' NOT NULL,
	"miles" numeric(8, 1) NOT NULL,
	"purpose" text NOT NULL,
	"drive_time_entry_id" uuid,
	"onsite_time_entry_id" uuid,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"is_backdated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_miles_positive" CHECK ("trips"."miles" > 0),
	CONSTRAINT "trips_purpose_present" CHECK (length(btrim("trips"."purpose")) > 0),
	CONSTRAINT "trips_endpoints_present" CHECK (length(btrim("trips"."origin")) > 0 AND length(btrim("trips"."destination")) > 0)
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"vacancy_start" date NOT NULL,
	"vacancy_end" date,
	"status" "turn_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turns_vacancy_order" CHECK ("turns"."vacancy_end" IS NULL OR "turns"."vacancy_end" >= "turns"."vacancy_start")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contractor_actor_id_actors_id_fk" FOREIGN KEY ("contractor_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_receipts" ADD CONSTRAINT "rent_receipts_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_receipts" ADD CONSTRAINT "rent_receipts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_linked_expense_id_expenses_id_fk" FOREIGN KEY ("linked_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_drive_time_entry_id_time_entries_id_fk" FOREIGN KEY ("drive_time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_onsite_time_entry_id_time_entries_id_fk" FOREIGN KEY ("onsite_time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actors_email_unique" ON "actors" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "actors_auth_subject_unique" ON "actors" USING btree ("auth_subject");--> statement-breakpoint
CREATE INDEX "documents_property_idx" ON "documents" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expenses_property_idx" ON "expenses" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "expenses_actor_idx" ON "expenses" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "expenses_contractor_idx" ON "expenses" USING btree ("contractor_actor_id");--> statement-breakpoint
CREATE INDEX "expenses_classification_idx" ON "expenses" USING btree ("capital_classification");--> statement-breakpoint
CREATE INDEX "properties_enterprise_idx" ON "properties" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "rent_receipts_date_idx" ON "rent_receipts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "rent_receipts_property_idx" ON "rent_receipts" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "time_entries_date_idx" ON "time_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "time_entries_actor_idx" ON "time_entries" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "time_entries_enterprise_date_idx" ON "time_entries" USING btree ("enterprise_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_property_idx" ON "time_entries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "time_entries_linked_expense_idx" ON "time_entries" USING btree ("linked_expense_id");--> statement-breakpoint
CREATE INDEX "timers_actor_idx" ON "timers" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timers_one_running_per_actor" ON "timers" USING btree ("actor_id") WHERE "timers"."stopped_at" IS NULL;--> statement-breakpoint
CREATE INDEX "trips_date_idx" ON "trips" USING btree ("date");--> statement-breakpoint
CREATE INDEX "trips_actor_idx" ON "trips" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "trips_property_idx" ON "trips" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "turns_property_idx" ON "turns" USING btree ("property_id");