exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE routes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      path_pattern text NOT NULL,
      upstream_url text NOT NULL,
      methods text[] NOT NULL,
      auth_required boolean NOT NULL DEFAULT true,
      cacheable boolean NOT NULL DEFAULT false,
      cache_ttl_s integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, path_pattern)
    );

    CREATE INDEX idx_routes_tenant_id ON routes(tenant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE routes;`);
};
