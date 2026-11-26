/**
 * 사고보고서(Accident Report) 서식 유틸
 *
 * 사고사례 접수 데이터를 A4 인쇄용 보고서로 변환할 때 쓰는
 * 순수 함수 모음입니다. (화면 / 인쇄 / 테스트에서 동일하게 사용)
 */

import { AccidentCase, AccidentSigner } from '../types';

const pad2 = (n: number): string => String(n).padStart(2, '0');

interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** 'yyyy-mm-dd' 또는 'yyyy-mm-ddTHH:mm' → {y, m, d} (UTC 밀림 방지) */
export const parseYmd = (value?: string | null): Ymd | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
};

/** '2026-11-18T14:30' → '2026. 11. 18. 14:30' / 날짜만 있으면 '2026. 11. 18.' */
export const formatDateTimeKo = (value?: string | null): string => {
  if (!value) return '-';
  const ym = parseYmd(value);
  if (!ym) return value;
  const time = /[T ](\d{1,2}):(\d{2})/.exec(value);
  const datePart = `${ym.y}. ${ym.m}. ${ym.d}.`;
  return time ? `${datePart} ${pad2(Number(time[1]))}:${time[2]}` : datePart;
};

/** 'yyyy-mm-dd' → '2026. 11. 18.' */
export const formatDateKo = (value?: string | null): string => {
  const ym = parseYmd(value);
  return ym ? `${ym.y}. ${ym.m}. ${ym.d}.` : '-';
};

/** 개월 더하기 (말일 보정: 1/31 + 1개월 → 2/28) */
const addMonthsUtc = (base: Ymd, months: number): number => {
  const total = base.y * 12 + (base.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Date.UTC(y, m - 1, Math.min(base.d, lastDay));
};

const DAY_MS = 86_400_000;

/**
 * 입사일 → 사고 발생일 근속기간.
 * 예) '1년 3개월 5일 (총 458일)' / '5개월 2일 (총 153일)' / '23일'
 * 입사일이 없거나 사고일보다 뒤면 안내 문구를 반환합니다.
 */
export const formatTenure = (hireDate?: string | null, baseDate?: string | null): string => {
  const hire = parseYmd(hireDate);
  const base = parseYmd(baseDate);
  if (!hire || !base) return '미입력';

  const start = Date.UTC(hire.y, hire.m - 1, hire.d);
  const end = Date.UTC(base.y, base.m - 1, base.d);
  if (end < start) return '입사일 확인 필요';

  const totalDays = Math.round((end - start) / DAY_MS);
  if (totalDays === 0) return '입사일 당일';

  let months = (base.y - hire.y) * 12 + (base.m - hire.m);
  if (base.d < hire.d) months -= 1;
  if (months < 0) months = 0;

  const anchor = addMonthsUtc(hire, months);
  const restDays = Math.round((end - anchor) / DAY_MS);

  const years = Math.floor(months / 12);
  const remMonths = months % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}년`);
  if (remMonths > 0) parts.push(`${remMonths}개월`);
  if (restDays > 0) parts.push(`${restDays}일`);

  const detail = parts.length > 0 ? parts.join(' ') : '0일';
  return `${detail} (총 ${totalDays}일)`;
};

/** 보고서 문서번호: GB-ACC-20261118-A1B2 (사고일자 + id 끝 4자리) */
export const formatReportNo = (accident: Pick<AccidentCase, 'id' | 'accidentDate'>): string => {
  const ym = parseYmd(accident.accidentDate);
  const stamp = ym ? `${ym.y}${pad2(ym.m)}${pad2(ym.d)}` : '00000000';
  const tail =
    (accident.id || '')
      .replace(/[^0-9a-zA-Z]/g, '')
      .slice(-4)
      .toUpperCase() || '0000';
  return `GB-ACC-${stamp}-${tail}`;
};

/** '오늘' 기준 출력일 표기: 2026. 11. 18. 14:30 */
export const formatPrintedAt = (now: Date = new Date()): string => {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return `${y}. ${m}. ${d}. ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
};

/** 피해자 표기: '홍길동 (35세)' / '홍길동' / '미제공' */
export const formatVictim = (accident: Pick<AccidentCase, 'victimName' | 'victimAge'>): string => {
  const name = accident.victimName?.trim() || '미제공';
  return accident.victimAge ? `${name} (${accident.victimAge}세)` : name;
};

/* ------------------------------------------------------------------ */
/* 서명란                                                              */
/* ------------------------------------------------------------------ */

/** 서명란 기본 직책 (기존 고정 4개 항목과 동일) */
export const DEFAULT_SIGNER_ROLES = [
  '안전관리자',
  '안전보건관리책임자',
  '본사 안전팀장',
  '본사 안전임원',
] as const;

/**
 * 서명란 목록을 만듭니다. (추가/삭제 편집용 기본값)
 *
 * 기존 데이터(고정 4개 필드)가 있으면 그 값을 채워 넣습니다.
 */
export const buildDefaultSigners = (
  accident?: Pick<
    AccidentCase,
    'safetyManagerName' | 'siteManagerName' | 'hqSafetyTeamLeaderName' | 'hqSafetyExecutiveName'
  >,
): AccidentSigner[] => {
  const legacyNames = [
    accident?.safetyManagerName,
    accident?.siteManagerName,
    accident?.hqSafetyTeamLeaderName,
    accident?.hqSafetyExecutiveName,
  ];
  return DEFAULT_SIGNER_ROLES.map((role, i) => {
    const name = legacyNames[i]?.trim();
    return {
      id: `signer-${i + 1}`,
      role,
      ...(name ? { name } : {}),
    };
  });
};

/**
 * 보고서에 인쇄할 서명란을 결정합니다.
 *
 * 1) 새 `signers` 배열이 있으면 그대로 사용합니다. (직책/성명 중 하나라도 입력된 행만)
 * 2) 없으면 기존 4개 고정 필드에서 만들어 냅니다. (이전에 저장된 사고사례 호환)
 */
export const resolveSigners = (
  accident: Pick<
    AccidentCase,
    | 'signers'
    | 'safetyManagerName'
    | 'siteManagerName'
    | 'hqSafetyTeamLeaderName'
    | 'hqSafetyExecutiveName'
  >,
): AccidentSigner[] => {
  const custom = accident.signers;
  /* signers 배열이 있으면(빈 배열 포함) 그것을 원본으로 씁니다.
     → 사용자가 서명란을 전부 삭제한 경우에도 예전 값이 되살아나지 않습니다. */
  if (Array.isArray(custom)) {
    return custom
      .map(s => ({ ...s, role: s.role?.trim() ?? '', name: s.name?.trim() || undefined }))
      .filter(s => s.role || s.name);
  }
  return buildDefaultSigners(accident);
};
