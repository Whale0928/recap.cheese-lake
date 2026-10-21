import session from "express-session";
import { resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AuthConfig } from "./auth/auth.config.js";

export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AuthConfig);
  app.disable("x-powered-by");
  app.use(session({
    name: "recap_session",
    secret: config.sessionKey,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: config.secureCookie, maxAge: config.sessionTtlMs, path: "/" },
  }));
  app.useStaticAssets(resolve(process.env.RECAP_UI_DIR ?? "../ui/dist"), { index: "index.html" });
}
