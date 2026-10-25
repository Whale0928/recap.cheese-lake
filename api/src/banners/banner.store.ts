import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { assembleBanners, type BannerResponse, type BannerRow, type ImageRow, type PlacementRow } from "./banner.assemble.js";

export class BannerUnavailableError extends Error {}

// 배너는 Lab 관리 화면이 recap 스키마에 직접 쓰고, Recap 은 읽기만 한다.
@Injectable()
export class BannerStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  /**
   * 켜진 배너 가운데 아직 끝나지 않았고 하루 안에 시작하는 것. 노출 여부는 화면이 현재 시각으로 다시 판단하므로
   * 응답을 1분 캐시해도 시작·종료 시각에 정확히 켜지고 꺼진다. 이미지 바이트(data)는 읽지 않는다.
   */
  async listUpcoming(): Promise<BannerResponse[]> {
    if (!this.source) throw new BannerUnavailableError("Banner database is not configured");
    const banners: BannerRow[] = await this.source.query(`
      SELECT id, link_url, starts_at, ends_at FROM recap.banners
      WHERE enabled AND ends_at > now() AND starts_at <= now() + interval '1 day'
      ORDER BY starts_at, id
    `);
    if (!banners.length) return [];
    const ids = banners.map(b => b.id);
    const [placements, images]: [PlacementRow[], ImageRow[]] = await Promise.all([
      this.source.query(`SELECT banner_id, slot, alt_text FROM recap.banner_placements WHERE banner_id = ANY($1::uuid[])`, [ids]),
      this.source.query(`SELECT banner_id, slot, device, theme, content_hash, width, height FROM recap.banner_images WHERE banner_id = ANY($1::uuid[])`, [ids]),
    ]);
    return assembleBanners(banners, placements, images);
  }

  /** 해시로 이미지 한 장의 바이트를 읽는다. 같은 해시는 같은 바이트이므로 아무 행이나 하나면 된다. */
  async imageData(hash: string): Promise<Buffer | undefined> {
    if (!this.source) throw new BannerUnavailableError("Banner database is not configured");
    const rows: { data: Buffer }[] = await this.source.query(`SELECT data FROM recap.banner_images WHERE content_hash = $1 LIMIT 1`, [hash]);
    return rows[0]?.data;
  }
}
