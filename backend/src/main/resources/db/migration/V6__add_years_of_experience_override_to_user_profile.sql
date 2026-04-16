-- Adds a manual override for total years of experience on user_profile.
-- The resume pipeline uses this to bound metric invention when
-- date-range derivation is unreliable (internships, gaps, contract work,
-- concurrent roles). Nullable: when NULL, the pipeline falls back to
-- auto-deriving YoE from the parsed base resume.
ALTER TABLE user_profile
    ADD COLUMN IF NOT EXISTS years_of_experience_override DOUBLE PRECISION;
