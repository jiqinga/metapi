CREATE TABLE `account_hour_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bucket_start_utc` text NOT NULL,
	`account_id` integer NOT NULL,
	`total_calls` integer DEFAULT 0 NOT NULL,
	`success_calls` integer DEFAULT 0 NOT NULL,
	`failed_calls` integer DEFAULT 0 NOT NULL,
	`total_latency_ms` integer DEFAULT 0 NOT NULL,
	`latency_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "account_hour_usage_non_negative" CHECK("account_hour_usage"."total_calls" >= 0 and "account_hour_usage"."success_calls" >= 0 and "account_hour_usage"."failed_calls" >= 0 and "account_hour_usage"."total_latency_ms" >= 0 and "account_hour_usage"."latency_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_hour_usage_hour_account_unique` ON `account_hour_usage` (`bucket_start_utc`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_hour_usage_hour_idx` ON `account_hour_usage` (`bucket_start_utc`);--> statement-breakpoint
CREATE INDEX `account_hour_usage_account_id_idx` ON `account_hour_usage` (`account_id`);
