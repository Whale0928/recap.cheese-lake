import { SessionStore } from "./runtime/session.store.js";
import session from "express-session";
import { resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AuthConfig } from "./auth/auth.config.js";

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
  app.use(session({
    name: "recap_session",
    store: sessions.store,
    secret: config.sessionKey,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: config.secureCookie, maxAge: config.sessionTtlMs, path: "/" },
  }));
  app.useStaticAssets(resolve(process.env.RECAP_UI_DIR ?? "../ui/dist"), { index: "index.html" });
}
