-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- AutoApply Database Schema
-- Run this in Supabase SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Student profiles (parsed from CV)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  raw_cv_url TEXT,
  raw_cv_text TEXT,
  parsed_data JSONB,
  job_preferences JSONB,
  autoapply_running BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Job listings discovered by the agent
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'linkedin',
  source_id TEXT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  salary_range TEXT,
  job_url TEXT NOT NULL DEFAULT '',
  job_type TEXT,
  match_score FLOAT,
  match_reason TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  failure_reason TEXT,
  persona_used TEXT,
  cv_version TEXT,
  applied_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_applied_at ON jobs(applied_at);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);

-- Application audit log
CREATE TABLE IF NOT EXISTS application_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applog_job_id ON application_log(job_id);

-- AI-generated content (cover letters, answers, etc.)
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  question TEXT,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gencontent_job_id ON generated_content(job_id);

-- Rejection learning data (Layer 3)
CREATE TABLE IF NOT EXISTS rejection_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL, -- 'cv_version' | 'cover_letter_tone' | 'job_type' | 'platform' | 'company_size'
  pattern_value TEXT NOT NULL,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  total_count INT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rejection_user ON rejection_patterns(user_id);

-- A/B test tracking (Layer 3)
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  variant_a_sent INT DEFAULT 0,
  variant_a_responses INT DEFAULT 0,
  variant_b_sent INT DEFAULT 0,
  variant_b_responses INT DEFAULT 0,
  winner TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (allow users to only see their own data)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profiles" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profiles" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profiles" ON profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own jobs" ON jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON jobs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own rejection_patterns" ON rejection_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own ab_tests" ON ab_tests FOR ALL USING (auth.uid() = user_id);

-- Service role bypasses RLS for the agent/API routes
