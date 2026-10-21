export interface ChzzkUser {
  channelId: string;
  channelName: string;
}

declare module "express-session" {
  interface SessionData {
    oauthState?: { value: string; expiresAt: number };
    user?: ChzzkUser;
    authSource?: "chzzk" | "local";
    expiresAt?: number;
    authenticatedAt?: number;
    sessionGroup?: string;
    rotatedAt?: number;
  }
}
