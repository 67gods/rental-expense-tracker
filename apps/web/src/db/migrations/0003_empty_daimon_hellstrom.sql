ALTER TABLE "expenses" ADD COLUMN "receipt_sha256" text;--> statement-breakpoint
CREATE INDEX "expenses_receipt_sha256_idx" ON "expenses" USING btree ("receipt_sha256");--> statement-breakpoint
CREATE INDEX "expenses_amount_date_idx" ON "expenses" USING btree ("amount_cents","date");