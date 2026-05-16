-- Copy/article assets need a text body and the model that produced them.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS model_used TEXT;
