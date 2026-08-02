exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE webhooks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      url text NOT NULL,
      events text[] NOT NULL,
      secret text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE webhooks;`);
};
