export function localAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.RECAP_LOCAL_AUTH_ENABLED === "true";
}
