ALTER TABLE "beans" ALTER COLUMN "altitude" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "beans" ADD COLUMN "region" text DEFAULT '' NOT NULL;