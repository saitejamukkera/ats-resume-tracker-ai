ALTER TABLE auth_users
DROP COLUMN IF EXISTS forwarding_email,
DROP COLUMN IF EXISTS is_forwarding_verified;
