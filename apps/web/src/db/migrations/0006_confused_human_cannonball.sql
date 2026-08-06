CREATE TABLE "charities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charities_identity" UNIQUE NULLS NOT DISTINCT("name","tax_id"),
	CONSTRAINT "charities_name_present" CHECK (length(btrim("charities"."name")) > 0),
	CONSTRAINT "charities_tax_id_shape" CHECK ("charities"."tax_id" IS NULL OR "charities"."tax_id" ~ '^[0-9]{2}-[0-9]{7}$')
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charity_id" uuid NOT NULL,
	"date" date NOT NULL,
	"actor_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"kind" text NOT NULL,
	"non_cash_description" text,
	"acknowledgment_on_file" boolean DEFAULT false NOT NULL,
	"receipt_key" text,
	"receipt_sha256" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donations_amount_positive" CHECK ("donations"."amount_cents" > 0),
	CONSTRAINT "donations_non_cash_described" CHECK ("donations"."kind" <> 'non_cash' OR length(btrim(coalesce("donations"."non_cash_description", ''))) > 0)
);
--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_charity_id_charities_id_fk" FOREIGN KEY ("charity_id") REFERENCES "public"."charities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donations_date_idx" ON "donations" USING btree ("date");--> statement-breakpoint
CREATE INDEX "donations_charity_idx" ON "donations" USING btree ("charity_id");