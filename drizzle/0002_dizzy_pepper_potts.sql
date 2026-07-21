CREATE TABLE `document_access` (
	`document_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`document_id`, `token_hash`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_access_document_idx` ON `document_access` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`quote` text NOT NULL,
	`relative_start` text,
	`relative_end` text,
	`author_name` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_comments_document_idx` ON `document_comments` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_crdt` (
	`document_id` text PRIMARY KEY NOT NULL,
	`state_base64` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_presence` (
	`document_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`document_id`, `session_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_presence_seen_idx` ON `document_presence` (`document_id`,`last_seen`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`revision` integer NOT NULL,
	`label` text,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_versions_document_idx` ON `document_versions` (`document_id`,`created_at`);