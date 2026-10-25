import { SessionLifecycle } from "./runtime/session.lifecycle.js";
import { SessionStore } from "./runtime/session.store.js";
import session from "express-session";
import { resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AuthConfig } from "./auth/auth.config.js";

// 공개 캐시로 내보내는 배너 경로. 로그인과 무관한 응답이라 세션을 읽거나 갱신하지 않는다.
// 거치면 만료 세션의 쿠키 삭제(Set-Cookie)가 공유 캐시 응답에 섞여 다른 이용자에게 전달될 수 있다.
// Express 라우터는 대소문자를 가리지 않고 끝의 "/" 도 허용하므로, 같은 기준으로 맞춰야 우회 경로가 남지 않는다.
// 이미지는 파일 이름 한 칸만 받는다 — 접두사로 넓게 열면 "../" 같은 경로가 세션 처리를 건너뛴다.
const PUBLIC_BANNER_IMAGE = /^\/api\/banners\/images\/[^/]+$/;
export function isPublicCachePath(req: Pick<import("express").Request, "method" | "path">): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const path = req.path.toLowerCase().replace(/\/$/, "");
  return path === "/api/banners" || PUBLIC_BANNER_IMAGE.test(path);
}

export async function configureApp(app: NestExpressApplication): Promise<void> {
  const config = app.get(AuthConfig);
  const sessions = app.get(SessionStore);
  await sessions.initialize();
  app.disable("x-powered-by");
  const allowedPeer = config.allowedPeer;
  const origins = config.allowedOrigins;
  app.set("trust proxy", (address: string) => allowedPeer(address));
  app.use((req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    // kubelet probe는 세션과 CIDR 판정을 거치지 않는다. 응답에는 상태만 담는다.
    if (req.method === "GET" && req.path === "/healthz") { res.status(200).send("ok"); return; }
    if (req.method === "GET" && req.path === "/readyz") { res.status(sessions.ready ? 200 : 503).send(sessions.ready ? "ok" : "unavailable"); return; }
    if (!allowedPeer(req.socket.remoteAddress)) { res.status(403).json({ error: "Forbidden" }); return; }
    if (req.headers.origin && !origins.includes(req.headers.origin)) { res.status(403).json({ error: "Origin not allowed" }); return; }
    next();
  });
  app.enableCors({ origin: origins, credentials: true, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Accept"], maxAge: 600 });
  const sessionMiddleware = session({
    name: "recap_session",
    store: sessions.store,
    secret: config.sessionKey,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: config.secureCookie, maxAge: config.sessionTtlMs, path: "/" },
  });
  app.use((req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (isPublicCachePath(req)) { next(); return; }
    sessionMiddleware(req, res, next);
  });
  const lifecycle = app.get(SessionLifecycle);
  app.use((req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (isPublicCachePath(req)) { next(); return; }
    void lifecycle.maintain(req, res).then(() => next(), next);
  });
  app.useStaticAssets(resolve(process.env.RECAP_UI_DIR ?? "../ui/dist"), { index: "index.html" });
}
