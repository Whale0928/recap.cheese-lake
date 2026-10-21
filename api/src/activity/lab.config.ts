import { Injectable } from "@nestjs/common";
@Injectable()
export class LabConfig {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  constructor() {
    let url: URL;
    try { url = new URL(process.env.RECAP_LAB_BASE_URL ?? "http://127.0.0.1:8081"); }
    catch { throw new Error("Invalid RECAP_LAB_BASE_URL"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid RECAP_LAB_BASE_URL");
    this.baseUrl = url.origin;
    this.apiKey = process.env.RECAP_LAB_API_KEY;
    if (this.apiKey && !/^clk_[0-9a-f]{64}$/.test(this.apiKey)) throw new Error("Invalid RECAP_LAB_API_KEY format");
  }
}
