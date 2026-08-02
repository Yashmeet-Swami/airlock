exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE rate_limit_policies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      route_id uuid REFERENCES routes(id) ON DELETE CASCADE,
      limit_count integer NOT NULL,
      window_seconds integer NOT NULL,
      algorithm text NOT NULL DEFAULT 'token_bucket',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_rate_limit_policies_tenant_route ON rate_limit_policies(tenant_id, route_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE rate_limit_policies;`);
};
