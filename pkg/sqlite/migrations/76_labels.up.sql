CREATE TABLE `labels` (
  `id` integer not null primary key autoincrement,
  `name` varchar(255) NOT NULL,
  `studio_id` integer NOT NULL,
  `rating` integer,
  `favorite` boolean NOT NULL DEFAULT FALSE,
  `details` text,
  `ignore_auto_tag` boolean NOT NULL DEFAULT FALSE,
  `image_blob` varchar(255),
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  foreign key(`studio_id`) references `studios`(`id`) on delete CASCADE
);

CREATE INDEX `index_labels_on_name` on `labels` (`name`);
CREATE INDEX `index_labels_on_studio_id` on `labels` (`studio_id`);

CREATE TABLE `label_urls` (
  `label_id` integer NOT NULL,
  `position` integer NOT NULL,
  `url` varchar(255) NOT NULL,
  foreign key(`label_id`) references `labels`(`id`) on delete CASCADE,
  PRIMARY KEY(`label_id`, `position`, `url`)
);

CREATE INDEX `label_urls_url` on `label_urls` (`url`);

CREATE TABLE `label_aliases` (
  `label_id` integer NOT NULL,
  `alias` varchar(255) NOT NULL,
  foreign key(`label_id`) references `labels`(`id`) on delete CASCADE,
  PRIMARY KEY(`label_id`, `alias`)
);

CREATE TABLE `labels_tags` (
  `label_id` integer NOT NULL,
  `tag_id` integer NOT NULL,
  foreign key(`label_id`) references `labels`(`id`) on delete CASCADE,
  foreign key(`tag_id`) references `tags`(`id`) on delete CASCADE,
  PRIMARY KEY(`label_id`, `tag_id`)
);

CREATE INDEX `index_labels_tags_on_tag_id` on `labels_tags` (`tag_id`);

ALTER TABLE `scenes` ADD COLUMN `label_id` integer REFERENCES `labels`(`id`) on delete SET NULL;
CREATE INDEX `index_scenes_on_label_id` on `scenes` (`label_id`);
