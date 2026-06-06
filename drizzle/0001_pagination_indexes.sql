DROP INDEX "beans_created_idx";--> statement-breakpoint
DROP INDEX "tastings_created_idx";--> statement-breakpoint
CREATE INDEX "beans_created_id_idx" ON "beans" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tastings_created_id_idx" ON "tastings" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS LAST);