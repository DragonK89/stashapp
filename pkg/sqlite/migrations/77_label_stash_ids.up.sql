CREATE TABLE IF NOT EXISTS label_stash_ids (
    label_id INTEGER NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
    stash_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    updated_at DATETIME,
    PRIMARY KEY (label_id, stash_id, endpoint)
);
