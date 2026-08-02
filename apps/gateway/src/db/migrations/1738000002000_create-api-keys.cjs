exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      key_hash text NOT NULL UNIQUE,
      scopes text[] NOT NULL DEFAULT '{}',
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz
    );

    CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE api_keys;`);
};
