/**
 * 사업(산업)재해조사표 제출 기한 계산
 *
 * 산업안전보건법 시행령에 따라 사업재해조사표는 **재해 발생일로부터 1개월 이내**에
 * 제출해야 합니다. 이 모듈은 그 기한과 남은 일수(D-day)를 계산합니다.
 *
 * 화면(작성 서식 · 게시판 · 보고서)에서 모두 같은 값을 쓰도록 순수 함수로 둡니다.
 */

import { AccidentCase } from '../types';
import { parseYmd } from './accidentReport';

const DAY_MS = 86_400_000;

export interface DeadlineInfo {
  /** 기한 마지막 날 (사고 발생일 + 1개월) */
  deadline: Date;
  /** 기한 표기 '2026. 12. 25.' */
  deadlineLabel: string;
  /** 오늘 기준 남은 일수 (기한 당일 = 0, 지났으면 음수) */
  daysLeft: number;
  /** D-day 표기 — 'D-3' / 'D-DAY' / 'D+2' */
  ddayLabel: string;
  /** 색상 경고 단계 */
  level: 'none' | 'safe' | 'warn' | 'danger' | 'expired';
  /** 게시판 배지에 쓸 클래스 접미사 */
  className: string;
  /** 안내 문구 */
  message: string;
}

/** 말일 보정 개월 더하기 (1/31 + 1개월 → 2/28) */
const addMonths = (base: Date, months: number): Date => {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const total = y * 12 + m + months;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const lastDay = new Date(ty, tm + 1, 0).getDate();
  return new Date(ty, tm, Math.min(d, lastDay));
};

/** 두 날짜의 '일' 차이 (시각 무시, 로컬 기준) */
const dayDiff = (from: Date, to: Date): number => {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
};

/** '2026-11-25T14:30' → Date (시각 무시) */
const toDate = (value?: string): Date | null => {
  const ym = parseYmd(value);
  if (!ym) return null;
  return new Date(ym.y, ym.m - 1, ym.d);
};

/** Date → '2026. 12. 25.' */
const dateLabel = (d: Date): string => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;

/**
 * 사업재해조사표 제출 기한 정보.
 * 사고 발생일이 없으면 null 을 돌려줍니다.
 *
 * @param accidentDate 사고 발생 일시 (yyyy-mm-dd 또는 yyyy-mm-ddTHH:mm)
 * @param today        기준일 (테스트용, 기본은 오늘)
 */
export const getDeadlineInfo = (
  accidentDate?: string,
  today: Date = new Date(),
): DeadlineInfo | null => {
  const base = toDate(accidentDate);
  if (!base) return null;

  const deadline = addMonths(base, 1);
  const daysLeft = dayDiff(today, deadline);

  let ddayLabel: string;
  if (daysLeft > 0) ddayLabel = `D-${daysLeft}`;
  else if (daysLeft === 0) ddayLabel = 'D-DAY';
  else ddayLabel = `D+${Math.abs(daysLeft)}`;

  let level: DeadlineInfo['level'];
  let className: string;
  let message: string;

  if (daysLeft < 0) {
    level = 'expired';
    className = 'is-expired';
    message = `제출 기한이 ${Math.abs(daysLeft)}일 지났습니다. (기한 ${dateLabel(deadline)})`;
  } else if (daysLeft <= 3) {
    level = 'danger';
    className = 'is-danger';
    message = `제출 기한이 ${daysLeft === 0 ? '오늘' : `${daysLeft}일 남았습니다`}. (기한 ${dateLabel(deadline)})`;
  } else if (daysLeft <= 7) {
    level = 'warn';
    className = 'is-warn';
    message = `제출 기한이 ${daysLeft}일 남았습니다. (기한 ${dateLabel(deadline)})`;
  } else if (daysLeft <= 14) {
    level = 'safe';
    className = 'is-safe';
    message = `제출 기한까지 ${daysLeft}일 남았습니다. (기한 ${dateLabel(deadline)})`;
  } else {
    level = 'none';
    className = 'is-far';
    message = `제출 기한까지 ${daysLeft}일 남았습니다. (기한 ${dateLabel(deadline)})`;
  }

  return {
    deadline,
    deadlineLabel: dateLabel(deadline),
    daysLeft,
    ddayLabel,
    level,
    className,
    message,
  };
};

/** 사고사례의 제출 여부가 '제출'인지 (D-day 를 숨길지 판단) */
export const isSubmitted = (accident: Pick<AccidentCase, 'disasterReportSubmitted'>): boolean =>
  accident.disasterReportSubmitted === '제출';

/** 제출대상 아님 여부 */
export const isNotApplicable = (accident: Pick<AccidentCase, 'disasterReportSubmitted'>): boolean =>
  accident.disasterReportSubmitted === '제출대상 아님';

/**
 * 게시판 · 보고서에서 함께 쓰는 제출 상태 표기.
 * - '제출'         → D-day 없이 '제출 완료'
 * - '제출대상 아님' → D-day 없이 '제출대상 아님'
 * - '미제출'/미입력 → D-day 표기 (기한 임박 시 색상 경고)
 */
export const getSubmissionBadge = (
  accident: Pick<AccidentCase, 'disasterReportSubmitted' | 'accidentDate'>,
  today: Date = new Date(),
): { status: string; dday: string; className: string; message: string } => {
  const status = accident.disasterReportSubmitted || '미제출';

  if (status === '제출') {
    return { status, dday: '', className: 'is-done', message: '사업재해조사표를 제출했습니다.' };
  }
  if (status === '제출대상 아님') {
    return {
      status,
      dday: '',
      className: 'is-na',
      message: '제출 대상이 아닌 사고입니다.',
    };
  }

  const info = getDeadlineInfo(accident.accidentDate, today);
  if (!info) {
    return {
      status,
      dday: '',
      className: 'is-far',
      message: '사고 발생일이 없어 기한을 계산할 수 없습니다.',
    };
  }
  return {
    status,
    dday: info.ddayLabel,
    className: info.className,
    message: info.message,
  };
};
