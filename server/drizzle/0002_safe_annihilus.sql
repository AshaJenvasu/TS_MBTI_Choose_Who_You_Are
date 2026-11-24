-- Move house from character to mbti_type_info without losing existing values.
-- (drizzle-kit generated ADD COLUMN ... NOT NULL + DROP COLUMN; edited by hand so
-- databases that already have rows copy the data across first.)
ALTER TABLE "mbti_type_info" ADD COLUMN "house" text;--> statement-breakpoint
UPDATE "mbti_type_info" SET "house" = "character"."house" FROM "character" WHERE "character"."mbti_type" = "mbti_type_info"."type_code";--> statement-breakpoint
ALTER TABLE "mbti_type_info" ALTER COLUMN "house" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "house";
