-- v2.1: campaigns hold a structured creative axis; copy assets can hang under one.
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store TEXT NOT NULL DEFAULT 'mattress' CHECK (store IN ('mattress', 'bedding')),
  big_idea TEXT NOT NULL,
  selling_points TEXT[] NOT NULL DEFAULT '{}',
  tone TEXT NOT NULL,
  audience TEXT NOT NULL,
  scene_id TEXT,
  scene_desc TEXT,
  instructions TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns"
  ON campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns"
  ON campaigns FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assets_campaign_id ON assets(campaign_id);
