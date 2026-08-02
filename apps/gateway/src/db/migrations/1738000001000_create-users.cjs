exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_users_tenant_id ON users(tenant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE users;`);
};
