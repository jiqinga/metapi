CREATE TABLE IF NOT EXISTS `account_disabled_models` (`id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY, `account_id` INT NOT NULL, `model_name` TEXT NOT NULL, `created_at` VARCHAR(191) DEFAULT (DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')), FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE);
CREATE UNIQUE INDEX `account_disabled_models_account_model_unique` ON `account_disabled_models` (`account_id`, `model_name`(191));
CREATE INDEX `account_disabled_models_account_id_idx` ON `account_disabled_models` (`account_id`);
