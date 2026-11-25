ALTER TABLE "test_result" ADD COLUMN "ei_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "test_result" ADD COLUMN "sn_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "test_result" ADD COLUMN "tf_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "test_result" ADD COLUMN "jp_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_ei_score_range" CHECK ("test_result"."ei_score" BETWEEN -12 AND 12);--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_sn_score_range" CHECK ("test_result"."sn_score" BETWEEN -12 AND 12);--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_tf_score_range" CHECK ("test_result"."tf_score" BETWEEN -12 AND 12);--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_jp_score_range" CHECK ("test_result"."jp_score" BETWEEN -12 AND 12);