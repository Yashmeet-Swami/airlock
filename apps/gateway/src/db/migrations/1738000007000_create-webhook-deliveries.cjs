/**
 * Two additions beyond blueprint §8.2's literal schema:
 *  - `payload`: manual DLQ replay (§10.5) needs the original event payload
 *    available to re-send. The blueprint's intended home for that is the
 *    `webhook-payloads` MinIO bucket (§12.1), which doesn't exist until Phase 6
 *    — this column is a pragmatic stand-in until then.
 *  - `event_name`: event_id alone is an opaque UUID with no way back to the
 *    event type, but both the outgoing webhook body and replay reconstruction
 *    need to know what kind of event this was.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE webhook_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event_id uuid NOT NULL,
      event_name text NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'retrying', 'delivered', 'dead_lettered')),
      attempt_count integer NOT NULL DEFAULT 0,
      last_error text,
      payload jsonb NOT NULL,
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (webhook_id, event_id)
    );

    CREATE INDEX idx_webhook_deliveries_webhook_status ON webhook_deliveries(webhook_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE webhook_deliveries;`);
};
