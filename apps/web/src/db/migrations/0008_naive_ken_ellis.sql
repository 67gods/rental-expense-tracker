ALTER TABLE "properties" DROP CONSTRAINT "properties_money_non_negative";--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "depreciation_start_month" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "depreciation_start_year" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "annual_depreciation_cents" bigint;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_depreciation_start_month_range" CHECK ("properties"."depreciation_start_month" IS NULL
        OR ("properties"."depreciation_start_month" >= 1 AND "properties"."depreciation_start_month" <= 12));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_money_non_negative" CHECK (("properties"."purchase_price_cents" IS NULL OR "properties"."purchase_price_cents" >= 0)
        AND ("properties"."closing_costs_cents" IS NULL OR "properties"."closing_costs_cents" >= 0)
        AND ("properties"."land_value_cents" IS NULL OR "properties"."land_value_cents" >= 0)
        AND ("properties"."fmv_at_conversion_cents" IS NULL OR "properties"."fmv_at_conversion_cents" >= 0)
        AND ("properties"."sale_price_cents" IS NULL OR "properties"."sale_price_cents" >= 0)
        AND ("properties"."annual_depreciation_cents" IS NULL OR "properties"."annual_depreciation_cents" >= 0));