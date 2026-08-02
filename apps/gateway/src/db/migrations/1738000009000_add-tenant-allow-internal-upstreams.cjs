/** §21.3: tenant-level trust flag — an explicit opt-in to point routes at
 *  private/link-local/loopback upstreams (e.g. an internal service mesh). */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE tenants ADD COLUMN allow_internal_upstreams boolean NOT NULL DEFAULT false;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE tenants DROP COLUMN allow_internal_upstreams;`);
};
