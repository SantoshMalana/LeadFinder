-- Fix N+1 problem in Rejection Engine
ALTER TABLE rejection_patterns ADD CONSTRAINT unique_pattern UNIQUE (user_id, pattern_type, pattern_value);

-- Safe atomic increment function
CREATE OR REPLACE FUNCTION increment_rejection_pattern(
  p_user_id UUID,
  p_pattern_type TEXT,
  p_pattern_value TEXT,
  p_is_success BOOLEAN
) RETURNS void AS $$
BEGIN
  INSERT INTO rejection_patterns (user_id, pattern_type, pattern_value, total_count, success_rate)
  VALUES (
    p_user_id, 
    p_pattern_type, 
    p_pattern_value, 
    1, 
    CASE WHEN p_is_success THEN 1.0 ELSE 0.0 END
  )
  ON CONFLICT ON CONSTRAINT unique_pattern
  DO UPDATE SET 
    total_count = rejection_patterns.total_count + 1,
    success_rate = (
      (rejection_patterns.success_rate * rejection_patterns.total_count) + 
      CASE WHEN p_is_success THEN 1.0 ELSE 0.0 END
    ) / (rejection_patterns.total_count + 1),
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;
