CREATE TABLE "tasting_assessments" (
	"tasting_id" text PRIMARY KEY NOT NULL,
	"body_intensity" numeric,
	"acidity_intensity" numeric,
	"sweetness_intensity" numeric,
	"fruit_intensity" numeric,
	"floral_intensity" numeric,
	"finish_intensity" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ta_body_range" CHECK ("tasting_assessments"."body_intensity"      is null or "tasting_assessments"."body_intensity"      between 0 and 15),
	CONSTRAINT "ta_acid_range" CHECK ("tasting_assessments"."acidity_intensity"   is null or "tasting_assessments"."acidity_intensity"   between 0 and 15),
	CONSTRAINT "ta_sweet_range" CHECK ("tasting_assessments"."sweetness_intensity" is null or "tasting_assessments"."sweetness_intensity" between 0 and 15),
	CONSTRAINT "ta_fruit_range" CHECK ("tasting_assessments"."fruit_intensity"     is null or "tasting_assessments"."fruit_intensity"     between 0 and 15),
	CONSTRAINT "ta_floral_range" CHECK ("tasting_assessments"."floral_intensity"    is null or "tasting_assessments"."floral_intensity"    between 0 and 15),
	CONSTRAINT "ta_finish_range" CHECK ("tasting_assessments"."finish_intensity"    is null or "tasting_assessments"."finish_intensity"    between 0 and 15)
);
--> statement-breakpoint
ALTER TABLE "tasting_assessments" ADD CONSTRAINT "tasting_assessments_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE cascade ON UPDATE no action;