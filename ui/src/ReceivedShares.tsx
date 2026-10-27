import { useEffect, useState } from "react";
import { ChannelAvatar } from "./ChannelLink";
import { dateInput } from "./ActivityView";
import { sharedRecordHref, type ReceivedShare } from "./relationship.share";

// 시청자가 나에게 보여 주기로 한 기록 목록. 없으면 아무것도 그리지 않아 대부분의 이용자에게는 보이지 않는다.
export function ReceivedShares() {
  const [shares, setShares] = useState<ReceivedShare[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/shares/received", { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const body = await response.json() as { shares?: unknown };
        if (!controller.signal.aborted && Array.isArray(body.shares)) setShares(body.shares.filter((share): share is ReceivedShare => typeof share === "object" && share !== null && typeof (share as ReceivedShare).ownerChannelId === "string"));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!shares.length) return null;
  return <section className="me-section recap-received" aria-labelledby="received-heading">
    <div className="me-section-heading"><div><h2 id="received-heading">나에게 보여 준 기록</h2><p className="me-source">내 방송에서 남긴 자기 기록을 보여 주기로 한 시청자예요.</p></div></div>
    <ul className="recap-received-list">{shares.map(share => <li key={share.ownerChannelId}>
      <a className="activity-channel" href={sharedRecordHref(share.ownerChannelId)}>
        <ChannelAvatar channel={{ channelName: share.ownerChannelName, channelImageUrl: null }} />
        <span className="activity-channel-name">{share.ownerChannelName || "이름 없는 시청자"}</span>
      </a>
      <span className="recap-received-date">{dateInput(share.consentedAt).replaceAll("-", ".")}부터</span>
    </li>)}</ul>
  </section>;
}
