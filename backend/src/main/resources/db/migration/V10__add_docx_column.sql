ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS generated_resume_docx TEXT;
