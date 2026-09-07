CREATE TABLE `account_disabled_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`model_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_disabled_models_account_model_unique` ON `account_disabled_models` (`account_id`,`model_name`);--> statement-breakpoint
CREATE INDEX `account_disabled_models_account_id_idx` ON `account_disabled_models` (`account_id`);