import { BlockList, isIP } from "node:net";

export function cidrMatcher(value: string): (address: string | undefined) => boolean {
  const list = new BlockList();
  const ranges = value.split(",").map(s => s.trim());
  if (ranges.some(s => !s)) throw new Error("RECAP_ALLOWED_CIDRS must not be empty");
  for (const range of ranges) {
    const [address, prefix, extra] = range.split("/");
    const family = isIP(address);
    const bits = Number(prefix);
    if (!family || extra !== undefined || prefix === undefined || !/^\d+$/.test(prefix) || bits < 0 || bits > (family === 4 ? 32 : 128)) throw new Error("Invalid RECAP_ALLOWED_CIDRS");
    list.addSubnet(address, bits, family === 4 ? "ipv4" : "ipv6");
  }
  return address => {
    if (!address) return false;
    const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
    const family = isIP(normalized);
    return !!family && list.check(normalized, family === 4 ? "ipv4" : "ipv6");
  };
}

export function corsOrigins(value: string): string[] {
  return [...new Set(value.split(",").map(s => {
    const origin = s.trim();
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) throw new Error();
      return origin;
    } catch { throw new Error("RECAP_CORS_ORIGINS must contain explicit HTTP(S) origins"); }
  }))];
}
