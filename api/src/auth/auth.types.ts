export interface ChzzkUser {
  channelId: string;
  channelName: string;
  // 공유받는 쪽 화면에 보여 줄 프로필 사진 주소. 가져오지 못하면 비워 두고 이름만 쓴다.
  channelImageUrl?: string | null;
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
