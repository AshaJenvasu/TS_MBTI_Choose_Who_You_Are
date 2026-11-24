CREATE TYPE "public"."compatibility_kind" AS ENUM('compatible', 'challenging');--> statement-breakpoint
CREATE TABLE "character" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "character_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mbti_type" text NOT NULL,
	"name" text NOT NULL,
	"house" text NOT NULL,
	"image_url" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "character_mbti_type_unique" UNIQUE("mbti_type")
);
--> statement-breakpoint
CREATE TABLE "mbti_type_compatibility" (
	"type_code" text NOT NULL,
	"other_type" text NOT NULL,
	"kind" "compatibility_kind" NOT NULL,
	CONSTRAINT "mbti_type_compatibility_type_code_other_type_kind_pk" PRIMARY KEY("type_code","other_type","kind"),
	CONSTRAINT "mbti_type_compatibility_not_self" CHECK ("mbti_type_compatibility"."other_type" <> "mbti_type_compatibility"."type_code")
);
--> statement-breakpoint
CREATE TABLE "mbti_type_info" (
	"type_code" text PRIMARY KEY NOT NULL,
	"golden_pair_type" text NOT NULL,
	CONSTRAINT "mbti_type_info_golden_pair_not_self" CHECK ("mbti_type_info"."golden_pair_type" <> "mbti_type_info"."type_code")
);
--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_mbti_type_mbti_type_info_type_code_fk" FOREIGN KEY ("mbti_type") REFERENCES "public"."mbti_type_info"("type_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mbti_type_compatibility" ADD CONSTRAINT "mbti_type_compatibility_type_code_mbti_type_info_type_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."mbti_type_info"("type_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mbti_type_compatibility" ADD CONSTRAINT "mbti_type_compatibility_other_type_mbti_type_info_type_code_fk" FOREIGN KEY ("other_type") REFERENCES "public"."mbti_type_info"("type_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mbti_type_info" ADD CONSTRAINT "mbti_type_info_golden_pair_type_fk" FOREIGN KEY ("golden_pair_type") REFERENCES "public"."mbti_type_info"("type_code") ON DELETE no action ON UPDATE no action;