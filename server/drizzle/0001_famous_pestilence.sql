CREATE TABLE "test_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"guest_token" uuid,
	"mbti_type" text NOT NULL,
	"matched_character_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_result_guest_token_unique" UNIQUE("guest_token"),
	CONSTRAINT "test_result_user_or_guest" CHECK ("test_result"."user_id" IS NOT NULL OR "test_result"."guest_token" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_mbti_type_mbti_type_info_type_code_fk" FOREIGN KEY ("mbti_type") REFERENCES "public"."mbti_type_info"("type_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_matched_character_id_character_id_fk" FOREIGN KEY ("matched_character_id") REFERENCES "public"."character"("id") ON DELETE no action ON UPDATE no action;