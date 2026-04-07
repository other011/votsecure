-- =============================================================================
-- VotSecure — Schema PostgreSQL
-- =============================================================================
-- Rulare inițială:
--   psql -U postgres -c "CREATE DATABASE votsecure;"
--   psql -U postgres -d votsecure -f schema.sql
--
-- Toate tabelele utilizează UUID ca cheie primară.
-- Constrângerile asigură integritatea la nivel de bază de date.
-- =============================================================================

-- Extensii necesare
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "citext";     -- email case-insensitive

-- =============================================================================
-- TABELA: users
-- Stochează datele alegătorilor și administratorilor.
-- Parola este stocată EXCLUSIV ca hash SHA-256 cu pepper (niciodată în clar).
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(120)    NOT NULL CHECK (char_length(trim(name)) >= 2),
    email           CITEXT          NOT NULL UNIQUE
                                    CHECK (email ~* '^[^@]+@vote\.ro$'),
    cnp             CHAR(13)        NOT NULL UNIQUE
                                    CHECK (cnp ~ '^\d{13}$'),
    password_hash   VARCHAR(64)     NOT NULL,   -- SHA-256 hex (256 biți = 64 hex chars)
    role            VARCHAR(10)     NOT NULL DEFAULT 'voter'
                                    CHECK (role IN ('voter', 'admin')),
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    failed_attempts INTEGER         NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until    TIMESTAMPTZ     NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMPTZ     NULL
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role  ON users (role);

COMMENT ON TABLE  users IS 'Utilizatori înregistrați în sistemul VotSecure.';
COMMENT ON COLUMN users.cnp           IS 'Cod Numeric Personal — validat la nivel de aplicație și BD.';
COMMENT ON COLUMN users.password_hash IS 'SHA-256(pepper + parolă). Niciodată plaintext.';

-- =============================================================================
-- TABELA: elections
-- Sesiuni electorale create de administrator.
-- =============================================================================
CREATE TABLE IF NOT EXISTS elections (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(200)    NOT NULL CHECK (char_length(trim(title)) >= 3),
    description         TEXT            NULL,
    type                VARCHAR(20)     NOT NULL DEFAULT 'uninominal'
                                        CHECK (type IN ('uninominal', 'multi-candidat', 'referendum')),
    status              VARCHAR(10)     NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'active', 'closed')),
    start_time          TIMESTAMPTZ     NOT NULL,
    end_time            TIMESTAMPTZ     NOT NULL,
    blockchain_id       VARCHAR(66)     NULL UNIQUE,  -- bytes32 hex pe Ethereum
    contract_tx_hash    VARCHAR(66)     NULL,          -- tx hash deploy/create
    created_by          UUID            NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ     NULL,
    CONSTRAINT elections_time_check CHECK (end_time > start_time)
);

CREATE INDEX idx_elections_status ON elections (status);

COMMENT ON TABLE elections IS 'Sesiuni electorale. blockchain_id leagă înregistrarea on-chain.';

-- =============================================================================
-- TABELA: candidates
-- Candidații asociați fiecărei alegeri.
-- =============================================================================
CREATE TABLE IF NOT EXISTS candidates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID        NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    party       VARCHAR(120) NULL,
    position    INTEGER     NOT NULL DEFAULT 0,  -- ordinea pe buletinul de vot
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidates_unique_name_per_election UNIQUE (election_id, name)
);

CREATE INDEX idx_candidates_election ON candidates (election_id);

-- =============================================================================
-- TABELA: votes
-- Voturile exprimate. CRITICĂ pentru integritate.
--
-- Separare identitate–opțiune:
--   - voter_token  = SHA-256(user_id + pepper) — anonim, nu poate fi inversat
--   - encrypted_payload = AES-GCM(candidateId + electionId + ts) — off-chain
--   - vote_hash    = SHA-256(encrypted_payload + nonce) — stocat și on-chain
--
-- Constrângeri:
--   - Un singur vot per (voter_token, election_id)
--   - vote_hash unic global
-- =============================================================================
CREATE TABLE IF NOT EXISTS votes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id         UUID        NOT NULL REFERENCES elections(id),
    voter_token         VARCHAR(64) NOT NULL,   -- SHA-256 hex, anonim
    encrypted_payload   TEXT        NOT NULL,   -- payload criptat base64
    nonce               VARCHAR(32) NOT NULL,   -- nonce aleator 128-bit hex
    vote_hash           VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex, stocat și on-chain
    blockchain_tx       VARCHAR(66) NULL,       -- hash tranzacție Ethereum
    candidate_id        UUID        NOT NULL REFERENCES candidates(id),
    receipt_code        VARCHAR(16) NOT NULL UNIQUE,  -- cod verificare alegător
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT votes_one_per_voter UNIQUE (voter_token, election_id)
);

CREATE INDEX idx_votes_election    ON votes (election_id);
CREATE INDEX idx_votes_voter_token ON votes (voter_token);
CREATE INDEX idx_votes_hash        ON votes (vote_hash);

COMMENT ON TABLE  votes IS 'Voturi exprimate. voter_token asigură anonimitatea.';
COMMENT ON COLUMN votes.voter_token IS 'Hash anonim al alegătorului. Nu poate fi inversat la user_id.';
COMMENT ON COLUMN votes.vote_hash   IS 'SHA-256 al payload-ului criptat + nonce. Stocat și on-chain.';

-- =============================================================================
-- TABELA: audit_log
-- Jurnal imutabil de evenimente. Nicio înregistrare nu poate fi ștearsă.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL       PRIMARY KEY,
    event_type  VARCHAR(50)     NOT NULL,
    user_id     UUID            NULL REFERENCES users(id) ON DELETE SET NULL,
    ip_address  INET            NULL,
    detail      JSONB           NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_event    ON audit_log (event_type);
CREATE INDEX idx_audit_user     ON audit_log (user_id);
CREATE INDEX idx_audit_created  ON audit_log (created_at);

-- Revocă dreptul de DELETE pentru utilizatorul aplicației (imutabilitate)
-- REVOKE DELETE ON audit_log FROM votsecure_user;  -- decomentați în producție

COMMENT ON TABLE audit_log IS 'Jurnal securizat imutabil. Nicio înregistrare nu se șterge.';

-- =============================================================================
-- TABELA: sessions
-- Sesiuni JWT active pentru revocare forțată.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 al JWT-ului
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked     BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_sessions_user    ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- =============================================================================
-- Date inițiale: utilizator admin
-- Parola: 'admin2024' — SCHIMBAȚI în producție!
-- password_hash = SHA-256('SECRET_PEPPER' + 'admin2024') — exemplu placeholder
-- =============================================================================
INSERT INTO users (name, email, cnp, password_hash, role)
VALUES (
    'Administrator Electoral',
    'admin@vote.ro',
    '1800101010001',
    'placeholder_schimbati_cu_hash_real',
    'admin'
) ON CONFLICT DO NOTHING;
