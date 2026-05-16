-- v2: purpose taxonomy changed to platform model.
-- NOT VALID skips validating pre-existing rows (legacy 'ad'/'post' etc.)
-- so the migration cannot fail on old data; new inserts are still checked.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_purpose_check;
ALTER TABLE assets ADD CONSTRAINT assets_purpose_check
  CHECK (purpose IN ('google_ads','meta_ads','social_post','line_push')) NOT VALID;
