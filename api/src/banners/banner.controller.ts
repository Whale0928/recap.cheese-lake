import { Controller, Get, Logger, Module, NotFoundException, Param, Req, Res, ServiceUnavailableException, StreamableFile } from "@nestjs/common";
import type { Request, Response } from "express";
import { imageHashFromFile, type BannerResponse } from "./banner.assemble.js";
import { BannerStore } from "./banner.store.js";

// 로그인 없이 보는 공개 경로다. 배너 목록은 1분, 이미지는 해시가 주소에 들어가므로 영구 캐시한다.
@Controller("api/banners")
export class BannerController {
  constructor(private readonly store: BannerStore) {}

  @Get()
  async list(@Res({ passthrough: true }) res: Response): Promise<BannerResponse[]> {
    try {
      const banners = await this.store.listUpcoming();
      // 공개 캐시는 성공한 목록에만 건다. 실패 응답이 캐시에 남으면 DB가 돌아와도 배너가 한동안 비어 보인다.
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return banners;
    } catch {
      // 조회 실패는 화면이 배너 없이 그리도록 503 으로만 알린다. SQL·DSN 은 로그에 남기지 않는다.
      Logger.warn("Banner list unavailable", "BannerController");
      res.setHeader("Cache-Control", "no-store");
      throw new ServiceUnavailableException("Banners unavailable");
    }
  }

  @Get("images/:file")
  async image(@Param("file") file: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StreamableFile | undefined> {
    const hash = imageHashFromFile(file);
    if (!hash) throw new NotFoundException();
    let data: Buffer | undefined;
    try { data = await this.store.imageData(hash); }
    catch {
      Logger.warn("Banner image unavailable", "BannerController");
      res.setHeader("Cache-Control", "no-store");
      throw new ServiceUnavailableException("Banner image unavailable");
    }
    if (!data) throw new NotFoundException();
    const etag = `"${hash}"`;
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) { res.status(304); return undefined; }
    res.setHeader("Content-Type", "image/webp");
    return new StreamableFile(data);
  }
}

@Module({ controllers: [BannerController], providers: [BannerStore] })
export class BannerModule {}
