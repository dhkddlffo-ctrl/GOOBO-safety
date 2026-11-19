/**
 * 테스트용 사고사례 1건 (샘플 데이터)
 *
 * 이 앱은 서버 없이 브라우저 LocalStorage 에만 자료를 보관하므로,
 * 관리자 화면의 '테스트 사고사례 추가' 버튼으로 그 브라우저에만 넣을 수 있습니다.
 * 3종 서류(사고원인 및 대책 보고서 / 목격자 진술서 / 재해(사고) 상황도)가
 * 모두 채워진 상태로 인쇄 결과를 확인하기 위한 예시입니다.
 */

import { AccidentCase } from '../types';

/** 중복 추가 방지를 위한 고정 ID */
export const SAMPLE_ACCIDENT_ID = 'sample-accident-0001';

/** 재해 상황도 크기 (SituationDiagram 작성기와 동일 규격) */
const CANVAS_W = 900;
const CANVAS_H = 520;

/** 재해(사고) 상황도 샘플 그림을 캔버스로 그려 PNG(data URL)로 반환합니다. */
const drawSampleDiagram = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width = 2,
    dash: number[] = []
  ) => {
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  const drawBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string | null,
    stroke: string | null,
    width = 2,
    dash: number[] = []
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.setLineDash(dash);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    size = 13,
    color = '#111827',
    weight: number | string = 600,
    align: CanvasTextAlign = 'left'
  ) => {
    ctx.save();
    ctx.font = `${weight} ${size}px "Malgun Gothic","Apple SD Gothic Neo","NanumGothic",sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const drawArrow = (x1: number, y1: number, x2: number, y2: number, color: string, width = 4) => {
    const head = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  /* 바탕 + 모눈 */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (let x = 20; x < CANVAS_W; x += 20) drawLine(x + 0.5, 0, x + 0.5, CANVAS_H, '#eef3f9', 1);
  for (let y = 20; y < CANVAS_H; y += 20) drawLine(0, y + 0.5, CANVAS_W, y + 0.5, '#eef3f9', 1);
  for (let x = 100; x < CANVAS_W; x += 100) drawLine(x + 0.5, 0, x + 0.5, CANVAS_H, '#dde6f0', 1);
  for (let y = 100; y < CANVAS_H; y += 100) drawLine(0, y + 0.5, CANVAS_W, y + 0.5, '#dde6f0', 1);

  /* 현장 경계 */
  drawBox(18, 18, CANVAS_W - 36, CANVAS_H - 36, null, '#94a3b8', 2, [8, 6]);
  drawText('현장 경계', 30, 36, 11, '#64748b', 500);

  /* 205동 */
  drawBox(56, 56, 390, 330, '#f8fafc', '#111827', 2.5);
  drawText('205 동 (지하2층 ~ 지상18층)', 68, 76, 15, '#111827', 700);
  drawLine(56, 92, 446, 92, '#cbd5e1', 1.5);

  /* 작업 구간 */
  drawBox(76, 106, 165, 118, '#e0ebff', '#2563eb', 1.8);
  drawText('A구간', 88, 128, 13, '#1d4ed8', 700);
  drawText('철근 조립', 88, 150, 12, '#1e40af', 500);

  drawBox(261, 106, 165, 118, '#dff5ea', '#059669', 1.8);
  drawText('B구간', 273, 128, 13, '#047857', 700);
  drawText('거푸집 설치', 273, 150, 12, '#065f46', 500);

  drawBox(76, 240, 350, 86, '#fef4e2', '#d97706', 1.8);
  drawText('C구간 · 콘크리트 타설', 90, 264, 12.5, '#b45309', 700);
  drawText('(지하 2층 슬래브)', 90, 286, 11.5, '#b45309', 500);

  /* 계단 개구부 = 사고 지점 */
  drawBox(300, 300, 74, 60, '#fee2e2', '#dc2626', 2.2, [6, 4]);
  drawText('계단 개구부', 337, 292, 11.5, '#b91c1c', 700, 'center');

  /* 낙하 방향 */
  drawArrow(337, 324, 337, 402, '#dc2626', 5);
  drawText('낙하 방향 (약 3.4 m)', 350, 382, 11.5, '#dc2626', 700);

  /* 사고 지점 */
  ctx.save();
  ctx.beginPath();
  ctx.arc(337, 331, 34, 0, Math.PI * 2);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(337, 331, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.restore();

  drawBox(372, 344, 118, 30, '#ffffff', '#dc2626', 2);
  drawText('사고지점', 388, 360, 12.5, '#b91c1c', 700);

  /* 작업발판 */
  drawBox(470, 106, 210, 94, '#f1f5f9', '#475569', 1.8, [7, 5]);
  drawText('작업발판 (H = 3.5 m)', 480, 128, 12.5, '#334155', 700);
  drawText('난간 미설치 구간', 480, 152, 11.5, '#b91c1c', 600);
  drawLine(480, 168, 668, 168, '#dc2626', 3, [8, 5]);

  /* 자재 적치장 */
  drawBox(470, 226, 210, 90, '#f5f3ff', '#7c3aed', 1.8);
  drawText('자재 적치장', 482, 248, 12.5, '#6d28d9', 700);
  drawText('(철근 · 거푸집)', 482, 270, 11.5, '#5b21b6', 500);

  /* 타워크레인 */
  ctx.save();
  ctx.beginPath();
  ctx.arc(775, 152, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#fff7ed';
  ctx.fill();
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(775, 118);
  ctx.lineTo(775, 186);
  ctx.moveTo(741, 152);
  ctx.lineTo(809, 152);
  ctx.stroke();
  ctx.restore();
  drawText('T/C', 775, 202, 11.5, '#c2410c', 700, 'center');

  /* 통로 */
  drawBox(470, 340, 210, 34, '#ecfeff', '#0891b2', 1.6, [6, 4]);
  drawText('통로 → 비상구', 480, 357, 11.5, '#0e7490', 600);

  /* 휴게실 */
  drawBox(76, 408, 165, 66, '#f0fdf4', '#16a34a', 1.6);
  drawText('근로자 휴게실', 88, 432, 12, '#15803d', 700);
  drawText('(사고 직후 대기)', 88, 452, 11, '#166534', 500);

  /* 출입구 */
  drawBox(640, 424, 200, 40, '#eef2ff', '#4f46e5', 1.8);
  drawText('현장 출입구 (정문)', 652, 444, 12, '#3730a3', 700);
  drawArrow(780, 444, 872, 444, '#4f46e5', 3);

  /* 범례 */
  drawBox(470, 418, 152, 48, '#ffffff', '#cbd5e1', 1.2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(486, 434, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.restore();
  drawText('사고지점', 500, 435, 11, '#111827', 600);
  drawArrow(478, 456, 500, 456, '#dc2626', 3);
  drawText('낙하 방향', 508, 457, 11, '#111827', 600);

  /* 방위 */
  ctx.save();
  ctx.translate(852, 72);
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(8, 4);
  ctx.lineTo(0, -1);
  ctx.lineTo(-8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawText('N', 852, 96, 13, '#111827', 700, 'center');

  return canvas.toDataURL('image/png');
};

/**
 * 테스트 사고사례 1건을 생성합니다.
 * (재해 상황도는 호출 시점에 캔버스로 그려 PNG 로 포함합니다)
 */
export const createSampleAccidentCase = (): AccidentCase => ({
  id: SAMPLE_ACCIDENT_ID,
  siteId: 6,
  siteName: '송도 역세권 2블럭 신축공사',
  accidentDate: '2026-11-18T10:40',
  accidentType: '추락',
  severity: '중상',
  location: '205동 지하 2층 A구간 슬래브 계단 개구부',
  victimName: '김동현',
  victimAge: 48,
  victimHireDate: '2024-03-04',
  victimJobType: '철근공',
  victimBirthDate: '1978-04-12',
  victimRank: '반장',
  victimMaritalStatus: '기혼',
  victimFamily: '배우자 1명, 자녀 2명',
  victimPhone: '010-3382-7415',
  actionTaken:
    '1. 사고 즉시 재해자를 발견한 근로자(목격자)가 현장 안전관리자에게 보고\n' +
    '2. 11:02 구급차 출동 요청 → 11:19 인근 병원 응급실 후송 (요추 압박골절 진단)\n' +
    '3. 해당 구간(C구간) 작업 즉시 중지 및 근로자 대피 조치\n' +
    '4. 계단 개구부(1.2 m × 1.1 m) 임시 덮개 설치 및 안전난간(높이 1.1 m) 보강\n' +
    '5. 205동 지하 2층 전 구간 개구부 덮개 설치 상태 점검\n' +
    '6. 재발 방지 대책 교육 2026. 11. 19. 08:00 전 인원 실시 (참석 42명)',
  relatedNotes:
    '2026. 11. 18. 15:30 안전관리팀장 현장 방문\n' +
    '· 계단 개구부 및 전 구간 개구부 12개소 확인 — 덮개 미설치 2개소 추가 발견, 즉시 설치 완료\n' +
    '· 작업발판 난간 미설치 구간 확인 — 전면 난간 보강 지시\n' +
    '· 관리감독자 순회 점검 체크리스트 개정 및 일일 점검 기록 의무화',
  relatedEtc:
    '· 산업안전보건법 제38조(안전조치)에 따른 사고조사 절차 착수\n' +
    '· 사업재해조사표 제출(2026. 11. 18.), 산업재해 신청 예정\n' +
    '· 사고 현장 사진 및 도면 별도 보관(안전관리팀)',
  safetyManagerName: '김현수',
  siteManagerName: '박정우',
  disasterDate: '2026-11-18',
  disasterPlace: '205동 지하 2층 A구간 계단 개구부',
  situationDiagram: drawSampleDiagram(),
  situationNote: '붉은 점선 원은 사고 발생 위치, 화살표는 재해자 낙하 방향을 표시합니다.',
  description:
    '2026년 11월 18일 10시 40분경, 인천 연수구 송도 역세권 2블럭 신축공사 현장 205동 지하 2층 A구간에서 ' +
    '철근공 김동현(반장, 48세)이 콘크리트 타설 전 슬래브 배근 상태를 확인하기 위하여 이동하던 중, ' +
    '기자재 반입용으로 개방되어 있던 계단 개구부(1.2 m × 1.1 m)를 인지하지 못하고 발을 헛디뎌 ' +
    '약 3.4 m 아래 지하 2층 바닥으로 떨어졌습니다. ' +
    '사고 당시 개구부에는 덮개가 설치되어 있지 않았고 주변에 식별 표지나 안전난간도 없었으며, ' +
    '작업 조명이 미흡하여 어두운 상태였습니다. ' +
    '함께 배근 작업을 하던 동료 근로자 이만식 씨가 즉시 안전관리자에게 보고하였고, ' +
    '10시 45분경 119 구급대를 요청하여 11시 19분경 인근 병원 응급실로 후송되었습니다.',
  cause:
    '1. (직접원인) 계단 개구부에 대한 덮개·안전난간 등 방호조치 미설치 상태로 작업 허용\n' +
    '2. (관리적 원인) 개구부 발생 시 즉시 신고·조치하는 절차 미준수, 관리감독자 작업 전 점검 소홀\n' +
    '3. (환경적 원인) 지하 2층 작업 구간 조도 부족 및 개구부 식별표지 미부착\n' +
    '4. (교육적 원인) 신규 투입 근로자에 대한 개구부 위험성 교육 미실시',
  preventiveMeasures:
    '1. 개구부(1 m 이상) 전수조사 후 견고한 덮개 설치·고정, 사용 개구부에는 안전난간·경고표지 병행 설치\n' +
    '2. 사고 발생 구간 조명 추가 설치 및 개구부 식별용 형광 표지 부착\n' +
    '3. 작업 시작 전 관리감독자 TBM 시 개구부 위치·위험요인 확인 절차 의무화(체크리스트 서식화)\n' +
    '4. 개구부·단부 위험작업 종사자 대상 특별안전교육(2시간) 반기 1회 실시\n' +
    '5. 안전관리자 주 1회 개구부·방호설비 순회 점검 및 결과 보고',
  status: '접수',
  createdAt: '2026-11-18T15:05:00',
  reporterName: '김현수',
  reporterPhone: '010-2451-7788',
  disasterReportSubmitted: '제출',
  treatmentResult: '산재',
  witnesses: [
    {
      id: 'w-sample-1',
      name: '이만식',
      phone: '010-5512-3388',
      jobType: '철근공',
      relation: '동료 근로자',
      statement:
        '2026년 11월 18일 오전 10시 40분경, 저는 205동 지하 2층 A구간에서 재해자 김동현 반장과 함께 ' +
        '슬래브 배근 간격 확인 작업을 하고 있었습니다. 김 반장이 콘크리트 타설 전 배근 상태를 한 번 더 확인하겠다며 ' +
        '저보다 5~6 m 앞서 걸어갔습니다. 그 구간은 조명이 어두워 발밑이 잘 보이지 않았고, 계단 개구부에는 덮개가 없었습니다. ' +
        '김 반장이 갑자기 소리를 내며 오른발이 아래로 꺼지더니 그대로 개구부 아래로 떨어졌습니다. ' +
        '제가 즉시 개구부 옆으로 달려가 아래를 확인하니 바닥에 누워 허리 통증을 호소하고 있었습니다. ' +
        '바로 현장 안전관리자에게 전화로 보고하였고, 119 구급대가 도착할 때까지 다른 근로자가 접근하지 못하도록 통제하였습니다.',
      statementDate: '2026-11-18',
      confirmed: true,
      permanentAddress: '서울특별시 종로구 청운동',
      address: '인천광역시 연수구 송도동 24-5 (105동 1203호)',
      residentId: '710930-1******',
      affiliation: '구보공영(주) 송도 역세권 2블럭 현장',
      victimTask: '슬래브 배근 간격 확인 및 C구간 콘크리트 타설 준비',
      witnessTask: '재해자와 함께 슬래브 배근 상태 점검',
      coworker: '김동현(재해자), 이만식, 박성호 (3인)',
    },
    {
      id: 'w-sample-2',
      name: '정태영',
      phone: '010-8820-1177',
      jobType: '신호수',
      relation: '같은 현장 근로자',
      statement:
        '2026년 11월 18일 오전 10시 40분경, 저는 205동 지하 2층 자재 적치장 쪽에서 철근 반입 신호를 하고 있었습니다. ' +
        'A구간 방향에서 둔탁한 소리와 함께 사람이 부르는 소리가 들려 달려갔더니 계단 개구부 아래로 김동현 반장이 떨어져 있었습니다. ' +
        '당시 개구부 주변에는 표지나 난간이 없었고 덮개도 없었습니다. ' +
        '제가 현장 출입구로 나가 구급차가 들어올 수 있도록 통로를 확보하고 안내하였습니다.',
      statementDate: '2026-11-18',
      confirmed: true,
      permanentAddress: '인천광역시 남동구 구월동',
      address: '인천광역시 연수구 송도동 12-1 (812호)',
      residentId: '850617-1******',
      affiliation: '구보공영(주) 송도 역세권 2블럭 현장',
      victimTask: '슬래브 배근 간격 확인 작업',
      witnessTask: '자재 적치장에서 철근 반입 신호수 업무',
      coworker: '이만식, 박성호',
    },
  ],
});
