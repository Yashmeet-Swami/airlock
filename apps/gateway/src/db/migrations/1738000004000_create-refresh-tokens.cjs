/**
 * Phase-1 deviation from blueprint §13.3 (documented in the plan): the refresh-token
 * allowlist lives in Postgres, not Redis, since Redis isn't introduced until Phase 2
 * and this table is only touched on human dashboard login/refresh, never the
 * per-request proxy hot path.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE refresh_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      revoked_at timestamptz,
      replaced_by uuid REFERENCES refresh_tokens(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );

    CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE refresh_tokens;`);
};
