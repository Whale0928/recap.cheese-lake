import type { ViewerInsight } from "./insight.types";

// 목 화면용 샘플. 랩이 실제로 만든 카드 하나(요청 372, 2026.11.02)를 그대로 옮긴 것이다. API 를 붙이면 지운다.
export const SAMPLE_INSIGHT: ViewerInsight = {
  "headline": "당신은 우질 그리고 폭평 방송에서 웃음과 놀림을 많이 남겨요.",
  "summary": "이 사람은 방송에서 웃기거나 놀라운 장면을 보면 ㅋㅋ나 헉 같은 짧은 반응을 자주 남겨요. 애긩이라는 부름과 울음 장면을 놀리듯 챙기는 말도 함께 보여요.",
  "title": {
    "name": "웃음 맞장구 담당",
    "why": "짧은 웃음과 감탄을 방송 곳곳에 남기는 모습이 눈에 띄어요."
  },
  "topWords": [
    "오이",
    "아오",
    "애긩",
    "어어",
    "ㅇㅈ"
  ],
  "roles": [
    {
      "name": "맞장구치기",
      "description": "웃기는 장면에 ㅋㅋㅋ를 길게 붙여 웃음을 보내요.",
      "evidence": [
        "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ"
      ]
    },
    {
      "name": "감탄하기",
      "description": "보이는 장면에 감탄이나 놀람을 짧게 보내요.",
      "evidence": [
        "헉",
        "와"
      ]
    },
    {
      "name": "상황 짚기",
      "description": "화면이나 방송 상황을 짚으며 뭐가 보이는지 말해요.",
      "evidence": [
        "화면 오ㅑㄹ케 깜빡거려"
      ]
    }
  ],
  "quotes": [
    {
      "text": "애긩ㅠㅠㅠㅠㅠ",
      "nickname": "울보 애긩 달래기",
      "why": "우는 사람을 애긩이라 부르며 달래는 말이에요."
    },
    {
      "text": "씹고 삼켜라",
      "nickname": "씹고 삼켜라 명령꾼",
      "why": "먹는 장면에 바로 명령하듯 던지는 말이에요."
    },
    {
      "text": "담배나온다고",
      "nickname": "담배 나온다 알림이",
      "why": "방송 장면에서 눈에 띈 것을 친구에게 알려 주듯 짚는 말이에요."
    }
  ],
  "topics": [
    {
      "name": "방송 장면 반응",
      "description": "방송 장면을 보며 짧게 반응하는 이야기예요.",
      "evidence": [
        "헉"
      ],
      "mentions": 231
    }
  ],
  "tone": {
    "address": "판단 어려움",
    "energy": "판단 어려움",
    "note": "ㅋㅋㅋ나 헉처럼 짧게 끊어 반응하는 말투가 많아요.",
    "speech": "반말 위주",
    "warmth": "판단 어려움",
    "watch": "감상형"
  },
  "catchphrases": [],
  "change": {
    "description": "",
    "evidence": [],
    "found": false
  },
  "gaps": [
    "방송 이름과 채팅이 짝으로 적혀 있지 않은 줄이 많아 어떤 게임을 보며 쓴 말인지 확인하기 어려워요."
  ]
};
export const SAMPLE_FINISHED_AT = "2026-11-02T06:09:00Z";
