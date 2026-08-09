/** §21.3 scope revision: Airlock is self-hosted, so pointing a route at
 *  another co-located service (e.g. a Docker Compose service name resolving
 *  to a private container IP — exactly the README quickstart's mock-upstream
 *  example) is the normal case, not the exception. Flip to opt-out: tenants
 *  wanting the stricter SaaS-style posture can flip allow_internal_upstreams
 *  back to false themselves. */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE tenants ALTER COLUMN allow_internal_upstreams SET DEFAULT true;`);
  pgm.sql(`UPDATE tenants SET allow_internal_upstreams = true WHERE allow_internal_upstreams = false;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE tenants ALTER COLUMN allow_internal_upstreams SET DEFAULT false;`);
};
