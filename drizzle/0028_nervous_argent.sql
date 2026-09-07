CREATE TABLE `site_model_protocol_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` integer NOT NULL,
	`model_name` text NOT NULL,
	`protocols` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_model_protocol_overrides_site_model_unique` ON `site_model_protocol_overrides` (`site_id`,`model_name`);--> statement-breakpoint
CREATE INDEX `site_model_protocol_overrides_site_id_idx` ON `site_model_protocol_overrides` (`site_id`);
