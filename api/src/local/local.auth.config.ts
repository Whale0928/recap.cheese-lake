import type { Request } from "express";
import type { AuthConfig } from "../auth/auth.config.js";
import { cidrMatcher } from "../runtime/network.config.js";
const loopback = cidrMatcher("127.0.0.1/32,::1/128");
const localHost = (hostname: string) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
export function localAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.RECAP_LOCAL_AUTH_ENABLED === "true";
}
export function localAuthAvailable(req: Request, config: AuthConfig): boolean {
  if (!localAuthEnabled() || !loopback(req.socket.remoteAddress) || !req.headers.host || config.secureCookie) return false;
  try { return localHost(new URL(`http://${req.headers.host}`).hostname) && localHost(new URL(config.successUrl).hostname); }
  catch { return false; }
}
