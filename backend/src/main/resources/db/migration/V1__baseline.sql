-- =============================================
-- V1: Baseline migration
-- Captures the existing schema created by Hibernate ddl-auto=update.
-- On existing production databases this migration is SKIPPED
-- (via flyway baseline-on-migrate). On fresh databases it
-- creates the full schema from scratch.
-- =============================================

-- auth_users table
CREATE TABLE IF NOT EXISTS auth_users (
    id          BIGSERIAL       PRIMARY KEY,
    email       VARCHAR(255)    NOT NULL UNIQUE,
    password    VARCHAR(255),
    full_name   VARCHAR(255),
    provider    VARCHAR(255)    NOT NULL,
    provider_id VARCHAR(255),
    created_at  TIMESTAMP
);

-- job_applications table
CREATE TABLE IF NOT EXISTS job_applications (
    id                        BIGSERIAL       PRIMARY KEY,
    position                  VARCHAR(255),
    job_id                    VARCHAR(255),
    company                   VARCHAR(255),
    location                  VARCHAR(255),
    job_description           TEXT,
    outcome                   VARCHAR(255),
    applied_on                TIMESTAMP,
    generated_resume_content  TEXT,
    cover_letter_content      TEXT,
    user_id                   BIGINT
);

-- resume_bases table
CREATE TABLE IF NOT EXISTS resume_bases (
    id        BIGSERIAL       PRIMARY KEY,
    name      VARCHAR(255)    NOT NULL,
    content   TEXT            NOT NULL,
    has_icons BOOLEAN,
    user_id   BIGINT,
    CONSTRAINT uk_resume_bases_name_user UNIQUE (name, user_id)
);

-- user_profile table
CREATE TABLE IF NOT EXISTS user_profile (
    id               BIGSERIAL       PRIMARY KEY,
    full_name        VARCHAR(255),
    address          VARCHAR(255),
    phone            VARCHAR(255),
    email            VARCHAR(255),
    linkedin_url     VARCHAR(255),
    portfolio_url    VARCHAR(255),
    github_url       VARCHAR(255),
    master_subjects  TEXT,
    masters_degree   VARCHAR(255),
    masters_gpa      VARCHAR(255),
    user_id          BIGINT          UNIQUE
);
