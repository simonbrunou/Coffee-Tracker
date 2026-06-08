DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM (SELECT lower(handle) h, count(*) c FROM users GROUP BY lower(handle) HAVING count(*) > 1) t)
  THEN RAISE EXCEPTION 'case-colliding handles exist; resolve before migrating'; END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_handle_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_uq" ON "users" USING btree (lower("handle"));