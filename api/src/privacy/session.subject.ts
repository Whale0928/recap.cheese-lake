import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

export function subject(req: Request): string {
  const { user, expiresAt } = req.session;
  if (!user || !expiresAt || expiresAt <= Date.now()) throw new UnauthorizedException("Login required");
  return user.channelId;
}
