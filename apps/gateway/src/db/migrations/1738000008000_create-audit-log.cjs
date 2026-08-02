/**
 * §8.2. actor_user_id is NOT NULL because every admin mutation that writes an
 * audit entry runs behind requireJwtAuth — there is no unauthenticated or
 * api-key-driven admin write path today.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action text NOT NULL,
      resource_type text NOT NULL,
      resource_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_audit_log_tenant_created ON audit_log(tenant_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE audit_log;`);
};
