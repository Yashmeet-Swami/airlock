import { promises as dns } from "node:dns";
import net from "node:net";

const PRIVATE_IPV4_RANGES: Array<[base: string, prefixLength: number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InRange(ip: string, base: string, prefixLength: number): boolean {
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isPrivateOrLinkLocalIpv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some(([base, prefix]) => isIpv4InRange(ip, base, prefix));
}

function isPrivateOrLinkLocalIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // ::1 loopback, fe80::/10 link-local, fc00::/7 unique local (fc.. / fd..).
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (net.isIP(hostname) === 4) return isPrivateOrLinkLocalIpv4(hostname);
  if (net.isIP(hostname) === 6) return isPrivateOrLinkLocalIpv6(hostname);
  if (hostname.toLowerCase() === "localhost") return true;

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    return addresses.some(({ address, family }) =>
      family === 4 ? isPrivateOrLinkLocalIpv4(address) : isPrivateOrLinkLocalIpv6(address),
    );
  } catch {
    // Unresolvable hostname — fail closed (block) rather than let a
    // misconfigured/unreachable host slip through as "safe."
    return true;
  }
}

/**
 * §21.3: rejects an upstream whose hostname resolves to a private/link-local/
 * loopback address, unless the owning tenant is explicitly flagged as
 * trusted (tenants.allow_internal_upstreams).
 */
export async function isUpstreamAllowed(upstreamUrl: string, allowInternal: boolean): Promise<boolean> {
  if (allowInternal) return true;
  const { hostname } = new URL(upstreamUrl);
  return !(await resolvesToPrivateAddress(hostname));
}
