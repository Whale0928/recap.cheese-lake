var CHS = [
  { name: '새벽정비소', hex: '8f3a1c04b7e2569d0a4f2b81cc37e05a', mode: 'full', n: 3204 },
  { name: '고래책방', hex: '2b7de91f4a0c5837e6d1908b3f45a2c7', mode: 'full', n: 2118 },
  { name: '라면과기타', hex: 'c05e48a3719d2f6b8e04c71a5d93b620', mode: 'skim', n: 1540 },
  { name: '초저녁라디오', hex: '4d91f7b208c3e5a6019f2d84bb7c3e15', mode: 'skim', n: 884 },
  { name: '목요일의숲', hex: 'a67c02e8d54b193f7028ae61c9f04d3b', mode: 'skim', n: 430 }
];
var SEGC = ['var(--primary)', 'var(--primary)',
            'color-mix(in oklab, var(--destructive) 28%, var(--muted))',
            'color-mix(in oklab, var(--muted-foreground) 45%, transparent)'];
var LINEC = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-4)'];
// 실데이터 판정 (2026.08.30 dev ClickHouse 실측 기준)
var VLABEL = {
  now: '지금 됨',
  partial: '부분',
  soon: '기간 쌓이면',
  no: '지금은 불가'
};
