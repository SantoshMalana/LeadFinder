-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PATCH 1 — LeadFinder original tables (missing from schema.sql)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  plan        TEXT NOT NULL DEFAULT 'free',
  voice_profile     TEXT,
  portfolio_summary TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  keywords    TEXT[] DEFAULT '{}',
  subreddits  TEXT[] DEFAULT '{}',
  platforms   TEXT[] DEFAULT '{}',
  min_score   INT DEFAULT 6,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL DEFAULT 'reddit',
  post_id      TEXT NOT NULL,
  post_title   TEXT NOT NULL,
  post_body    TEXT,
  post_url     TEXT NOT NULL,
  author       TEXT,
  score        INT,
  score_reason TEXT,
  status       TEXT NOT NULL DEFAULT 'new',
  found_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, post_id)   -- prevents duplicate posts per campaign
);

CREATE TABLE IF NOT EXISTS outreach_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_reply  TEXT,
  sent             BOOLEAN DEFAULT false,
  replied_back     BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own" ON users      FOR ALL USING (auth.uid() = id);
CREATE POLICY "camps_own" ON campaigns  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "leads_own" ON leads      FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = leads.campaign_id AND campaigns.user_id = auth.uid())
);
CREATE POLICY "outreach_own" ON outreach_log FOR ALL USING (auth.uid() = user_id);

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PATCH 2 — Missing columns on existing tables
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- IMAP tracker needs to match by email, not company name
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reply_to_email TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PATCH 3 — Deduplication constraints
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Prevent same source_id from being inserted twice per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_source_uniq
  ON jobs(user_id, source_id)
  WHERE source_id IS NOT NULL;

-- Prevent same job_url from being inserted twice per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_url_uniq
  ON jobs(user_id, job_url)
  WHERE job_url IS NOT NULL AND job_url <> '';


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PATCH 4 — Unique constraint on rejection_patterns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE rejection_patterns
  ADD CONSTRAINT rejection_patterns_uniq
  UNIQUE (user_id, pattern_type, pattern_value);


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PATCH 5 — Atomic rejection pattern increment function
-- (replaces N+1 select+update loop in rejection-engine.ts)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION increment_rejection_pattern(
  p_user_id      UUID,
  p_pattern_type TEXT,
  p_pattern_value TEXT,
  p_is_success   BOOLEAN
) RETURNS VOID AS $$
BEGIN
  INSERT INTO rejection_patterns
    (user_id, pattern_type, pattern_value, success_count, failure_count, total_count, success_rate, last_updated)
  VALUES (
    p_user_id, p_pattern_type, p_pattern_value,
    CASE WHEN p_is_success THEN 1 ELSE 0 END,
    CASE WHEN p_is_success THEN 0 ELSE 1 END,
    1,
    CASE WHEN p_is_success THEN 1.0 ELSE 0.0 END,
    now()
  )
  ON CONFLICT (user_id, pattern_type, pattern_value)
  DO UPDATE SET
    success_count = rejection_patterns.success_count + CASE WHEN p_is_success THEN 1 ELSE 0 END,
    failure_count = rejection_patterns.failure_count + CASE WHEN p_is_success THEN 0 ELSE 1 END,
    total_count   = rejection_patterns.total_count + 1,
    success_rate  = (rejection_patterns.success_count + CASE WHEN p_is_success THEN 1 ELSE 0 END)::FLOAT
                  / (rejection_patterns.total_count + 1),
    last_updated  = now();
END;
$$ LANGUAGE plpgsql;
