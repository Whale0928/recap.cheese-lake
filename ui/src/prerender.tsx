import { renderToString } from "react-dom/server";
import { App } from "./App";

// 홈페이지의 공개 화면만 생성한다. 세션 조회는 브라우저에서 실행한다.
export function renderHome() {
  return renderToString(<App />);
}
