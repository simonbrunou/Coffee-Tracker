CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_unique" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "bean_wishlist" (
	"user_id" text NOT NULL,
	"bean_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bean_wishlist_user_id_bean_id_pk" PRIMARY KEY("user_id","bean_id")
);
--> statement-breakpoint
CREATE TABLE "beans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"roaster_id" text,
	"roaster_name" text,
	"origin" text DEFAULT '' NOT NULL,
	"process" text DEFAULT '' NOT NULL,
	"roast" text DEFAULT '' NOT NULL,
	"altitude" text DEFAULT '—' NOT NULL,
	"varietal" text DEFAULT '' NOT NULL,
	"price" numeric,
	"avg_rating" numeric DEFAULT '0' NOT NULL,
	"ratings" integer DEFAULT 0 NOT NULL,
	"color" text NOT NULL,
	"flavors" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"farm" text,
	"varieties" text[] DEFAULT '{}'::text[] NOT NULL,
	"sca_score" numeric,
	"owned" boolean DEFAULT false NOT NULL,
	"bag_weight" text,
	"purchased" text,
	"remaining" numeric,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beans_owned_has_owner" CHECK (not "beans"."owned" or "beans"."user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"tasting_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "comments_body_check" CHECK (char_length("comments"."body") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"user_id" text NOT NULL,
	"tasting_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_user_id_tasting_id_pk" PRIMARY KEY("user_id","tasting_id")
);
--> statement-breakpoint
CREATE TABLE "roaster_follows" (
	"user_id" text NOT NULL,
	"roaster_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roaster_follows_user_id_roaster_id_pk" PRIMARY KEY("user_id","roaster_id")
);
--> statement-breakpoint
CREATE TABLE "roasters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"founded" integer NOT NULL,
	"beans" integer DEFAULT 0 NOT NULL,
	"blurb" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasting_saves" (
	"user_id" text NOT NULL,
	"tasting_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasting_saves_user_id_tasting_id_pk" PRIMARY KEY("user_id","tasting_id")
);
--> statement-breakpoint
CREATE TABLE "tastings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bean_id" text NOT NULL,
	"rating" integer NOT NULL,
	"brew" text DEFAULT '' NOT NULL,
	"dose" text DEFAULT '—' NOT NULL,
	"ratio" text DEFAULT '—' NOT NULL,
	"temp" text DEFAULT '—' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"time" text DEFAULT 'now' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tastings_rating_check" CHECK ("tastings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "no_self_follow" CHECK ("user_follows"."follower_id" <> "user_follows"."followee_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"avatar" text NOT NULL,
	"tastings" integer DEFAULT 0 NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"session_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bean_wishlist" ADD CONSTRAINT "bean_wishlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bean_wishlist" ADD CONSTRAINT "bean_wishlist_bean_id_beans_id_fk" FOREIGN KEY ("bean_id") REFERENCES "public"."beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beans" ADD CONSTRAINT "beans_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beans" ADD CONSTRAINT "beans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaster_follows" ADD CONSTRAINT "roaster_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaster_follows" ADD CONSTRAINT "roaster_follows_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_saves" ADD CONSTRAINT "tasting_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_saves" ADD CONSTRAINT "tasting_saves_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_bean_id_beans_id_fk" FOREIGN KEY ("bean_id") REFERENCES "public"."beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "beans_user_owned_idx" ON "beans" USING btree ("user_id","owned");--> statement-breakpoint
CREATE INDEX "beans_roaster_idx" ON "beans" USING btree ("roaster_id");--> statement-breakpoint
CREATE INDEX "beans_created_idx" ON "beans" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "comments_tasting_idx" ON "comments" USING btree ("tasting_id");--> statement-breakpoint
CREATE INDEX "likes_tasting_idx" ON "likes" USING btree ("tasting_id");--> statement-breakpoint
CREATE INDEX "roaster_follows_roaster_idx" ON "roaster_follows" USING btree ("roaster_id");--> statement-breakpoint
CREATE INDEX "tasting_saves_tasting_idx" ON "tasting_saves" USING btree ("tasting_id");--> statement-breakpoint
CREATE INDEX "tastings_created_idx" ON "tastings" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tastings_bean_idx" ON "tastings" USING btree ("bean_id");--> statement-breakpoint
CREATE INDEX "tastings_user_idx" ON "tastings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_follows_followee_idx" ON "user_follows" USING btree ("followee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email")) WHERE "users"."password_hash" is not null;