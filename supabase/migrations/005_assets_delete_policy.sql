-- assets had no DELETE RLS policy; allow users to hard-delete their own assets.
CREATE POLICY "Users can delete own assets"
  ON assets FOR DELETE USING (auth.uid() = user_id);
