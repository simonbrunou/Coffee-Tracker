CREATE TABLE "link_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link_tokens" ADD CONSTRAINT "link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lt_token_hash_uq" ON "link_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "lt_user_id_idx" ON "link_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lt_expires_at_idx" ON "link_tokens" USING btree ("expires_at");