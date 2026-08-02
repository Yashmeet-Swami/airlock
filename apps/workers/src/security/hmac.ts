import { createHmac } from "node:crypto";

/**
 * Stripe-style signature scheme (§21.2 HMAC-SHA256; §21.1 timestamp tolerance
 * window for replay defense): `t=<unix seconds>,v1=<hex hmac>` where the hmac
 * is computed over `${timestamp}.${rawBody}`. Documented for receivers in the
 * README's webhook verification guide.
 */
export function signPayload(secret: string, timestampS: number, rawBody: string): string {
  const signedContent = `${timestampS}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(signedContent).digest("hex");
  return `t=${timestampS},v1=${hmac}`;
}
