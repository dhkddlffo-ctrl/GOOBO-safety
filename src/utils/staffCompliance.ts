/**
 * 안전인력(관리자) 선임 · 직무교육 이수 관리
 *
 * 산업안전보건법상 안전보건관리책임자 · 안전관리자 · 관리감독자는
 * 선임 후 정해진 주기로 직무교육을 이수해야 합니다.
 * 이 파일은 저장된 선임일/직무교육 이수일을 기준으로
 *  - 다음 교육 예정일(D-day)
 *  - 만료 여부
 *  - 입력 누락
 * 을 계산해 화면에서 바로 확인할 수 있게 합니다.
 */

import { Site, SiteStaff, StaffRole } from '../types';
import { getSites } from './storage';
import { getSiteInfo } from './siteInfoStorage';

/* ------------------------------------------------------------------ */
/* 법정 교육 주기 기준                                                   */
/* ------------------------------------------------------------------ */

export interface TrainingRule {
  /** 재이수 주기(년) */
  years: number;
  /** 정기교육 시간 안내 (없으면 화면에서 생략) */
  hours?: string;
}

/**
 * 역할별 직무교육 주기.
 * 주기가 바뀌면 이 표만 수정하면 화면 전체에 반영됩니다.
 * 계산 기준일은 '직무교육 이수일'이며, 이수일 + years 년이 유효기간 만료일입니다.
 *
 * ⚠️ 관리감독자는 직무교육 대상이 아니므로 이 표에 포함하지 않습니다.
 *    (관리감독자는 신규교육 8시간 이수 여부만 별도로 확인합니다)
 */
export const TRAINING_RULE: Partial<Record<StaffRole, TrainingRule>> = {
  현장소장: { years: 1, hours: '연간 6시간' },
  // 안전보건관리책임자·안전관리자는 직무교육 이수일로부터 2년입니다.
  안전보건관리책임자: { years: 2 },
  안전관리자: { years: 2 },
};

/** 직무교육 대상 역할 (관리감독자 제외) */
export const TRAINING_ROLES: StaffRole[] = ['현장소장', '안전보건관리책임자', '안전관리자'];

/** 해당 역할이 직무교육 대상인지 */
export const hasJobTraining = (role: StaffRole): boolean => Boolean(TRAINING_RULE[role]);

/** D-day 임박 판정 기준 (일) */
export const SOON_DAYS = 60;

/* ------------------------------------------------------------------ */
/* 날짜 유틸                                                            */
/* ------------------------------------------------------------------ */

/** 'yyyy-mm-dd' → 로컬 Date (UTC 밀림 방지). 형식이 틀리면 null */
export const parseDateOnly = (value?: string | null): Date | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const toDateOnly = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/** n년 뒤 같은 날짜 (2/29 → 2/28 로 보정) */
export const addYears = (base: Date, years: number): Date => {
  const y = base.getFullYear() + years;
  const m = base.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(base.getDate(), lastDay));
};

/** 날짜 차이(일). b - a */
const diffDays = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);

/* ------------------------------------------------------------------ */
/* 판정                                                                */
/* ------------------------------------------------------------------ */

/**
 * 판정 결과 구분
 * - ok      : 정상 이수
 * - soon    : 만료 임박
 * - expired : 유효기간 만료
 * - missing : 직무교육 이수일 미입력
 * - none    : 직무교육 대상 아님 (관리감독자 등)
 * - 해임자는 level 'ok' 로 반환하고 message 로 안내합니다.
 */
export type ComplianceLevel = 'ok' | 'soon' | 'expired' | 'missing' | 'none';

export interface StaffCompliance {
  level: ComplianceLevel;
  /** 화면 표시용 짧은 라벨: 'D-42' · 'D+12' · '미입력' */
  label: string;
  /** 다음 교육 예정일 (yyyy-mm-dd). 계산 불가 시 '' */
  dueDate: string;
  /** 남은 일수. 과거면 음수. 계산 불가 시 null */
  daysLeft: number | null;
  /** 상세 설명 */
  message: string;
  /** 정기교육 시간 안내 (없으면 '') */
  hours: string;
  /** 재이수 주기(년). 직무교육 대상이 아니면 0 */
  years: number;
}

/**
 * 안전인력 1명의 교육 이수 상태를 판정합니다.
 * - 해임된 인력은 점검 대상에서 제외합니다(level 'ok', message 안내).
 * - 관리감독자처럼 직무교육 대상이 아닌 역할은 level 'none'.
 * - 직무교육 이수일이 없으면 'missing'.
 * - 기준일은 '직무교육 이수일'이고, 이수일 + 주기(년)가 유효기간 만료일입니다.
 */
export const evaluateStaff = (staff: SiteStaff, today: Date = startOfToday()): StaffCompliance => {
  // 해임자는 점검 제외
  if (staff.dismissedAt) {
    return {
      level: 'ok',
      label: '해임',
      dueDate: '',
      daysLeft: null,
      message: '해임 처리된 인력입니다. 점검 대상에서 제외됩니다.',
      hours: '',
      years: 0,
    };
  }

  const rule = TRAINING_RULE[staff.role];

  // 직무교육 대상이 아닌 역할 (관리감독자 등)
  if (!rule) {
    return {
      level: 'none',
      label: '대상 아님',
      dueDate: '',
      daysLeft: null,
      message: `${staff.role}은(는) 직무교육 재이수 대상이 아닙니다.`,
      hours: '',
      years: 0,
    };
  }

  const hours = rule.hours ?? '';
  const cycle = `${rule.years}년`;

  const trained = parseDateOnly(staff.trainingDate);

  if (!trained) {
    return {
      level: 'missing',
      label: '미입력',
      dueDate: '',
      daysLeft: null,
      message: `직무교육 이수일이 등록되지 않았습니다. (이수일로부터 ${cycle})`,
      hours,
      years: rule.years,
    };
  }

  const due = addYears(trained, rule.years);
  const daysLeft = diffDays(today, due);

  if (daysLeft < 0) {
    return {
      level: 'expired',
      label: `D+${Math.abs(daysLeft)}`,
      dueDate: toDateOnly(due),
      daysLeft,
      message: `직무교육 유효기간(${cycle})이 ${Math.abs(daysLeft)}일 지났습니다. 재교육이 필요합니다.`,
      hours,
      years: rule.years,
    };
  }

  if (daysLeft <= SOON_DAYS) {
    return {
      level: 'soon',
      label: `D-${daysLeft}`,
      dueDate: toDateOnly(due),
      daysLeft,
      message: `${daysLeft}일 후 직무교육 유효기간(${cycle})이 만료됩니다.`,
      hours,
      years: rule.years,
    };
  }

  return {
    level: 'ok',
    label: `D-${daysLeft}`,
    dueDate: toDateOnly(due),
    daysLeft,
    message: `정상 이수 상태입니다. 다음 교육 예정일 ${toDateOnly(due)}.`,
    hours,
    years: rule.years,
  };
};

/** 선임일 누락 여부 (해임자는 제외) */
export const isAppointmentMissing = (staff: SiteStaff): boolean =>
  !staff.dismissedAt && !parseDateOnly(staff.appointedAt);

/**
 * 관리감독자 신규교육(8시간) 미이수 여부.
 * 관리감독자로 지정되었으나 신규교육을 이수하지 않은 경우 경고 대상입니다.
 */
export const isSupervisorTrainingMissing = (staff: SiteStaff): boolean =>
  staff.role === '관리감독자' &&
  !staff.dismissedAt &&
  Boolean(parseDateOnly(staff.appointedAt)) &&
  !staff.newTraining8h;

/* ------------------------------------------------------------------ */
/* 집계                                                                */
/* ------------------------------------------------------------------ */

export interface StaffIssue {
  siteId: number;
  siteName: string;
  staff: SiteStaff;
  compliance: StaffCompliance;
  /** 선임일 누락 */
  appointmentMissing: boolean;
  /** 관리감독자 신규교육 미이수 */
  supervisorTrainingMissing: boolean;
}

/** 점검이 필요한 항목인지 (정상/해임 제외) */
export const needsAttention = (compliance: StaffCompliance): boolean =>
  compliance.level === 'soon' || compliance.level === 'expired' || compliance.level === 'missing';

export interface SiteComplianceSummary {
  siteId: number;
  siteName: string;
  total: number;
  expired: number;
  soon: number;
  missing: number;
  /** 위 3가지를 합친 '조치 필요' 건수 */
  issues: number;
  /** 선임일 누락 건수 */
  appointmentMissing: number;
  /** 관리감독자 신규교육 미이수 건수 */
  supervisorMissing: number;
}

/** 현장 1곳의 인력 점검 요약 */
export const summarizeSite = (
  siteId: number,
  siteName: string,
  staffList: SiteStaff[],
  today: Date = startOfToday()
): SiteComplianceSummary => {
  const active = staffList.filter(s => !s.dismissedAt);
  let expired = 0;
  let soon = 0;
  let missing = 0;

  active.forEach(staff => {
    const c = evaluateStaff(staff, today);
    if (c.level === 'expired') expired += 1;
    else if (c.level === 'soon') soon += 1;
    else if (c.level === 'missing') missing += 1;
  });

  return {
    siteId,
    siteName,
    total: active.length,
    expired,
    soon,
    missing,
    issues: expired + soon + missing,
    appointmentMissing: active.filter(isAppointmentMissing).length,
    supervisorMissing: active.filter(isSupervisorTrainingMissing).length,
  };
};

/** 전체 현장의 점검 요약 (관리자 대시보드용) */
export const summarizeAllSites = (today: Date = startOfToday()): SiteComplianceSummary[] => {
  const sites: Site[] = getSites();
  return sites.map(site => {
    const info = getSiteInfo(site.id, site.name);
    return summarizeSite(site.id, site.name, info.staff ?? [], today);
  });
};

/** 전체 현장에서 조치가 필요한 인력 목록 (만료 → 임박 → 미입력 순) */
export const collectIssues = (today: Date = startOfToday()): StaffIssue[] => {
  const sites: Site[] = getSites();
  const rows: StaffIssue[] = [];

  sites.forEach(site => {
    const info = getSiteInfo(site.id, site.name);
    (info.staff ?? []).forEach(staff => {
      if (staff.dismissedAt) return;
      const compliance = evaluateStaff(staff, today);
      const appointmentMissing = isAppointmentMissing(staff);
      const supervisorTrainingMissing = isSupervisorTrainingMissing(staff);

      if (!needsAttention(compliance) && !appointmentMissing && !supervisorTrainingMissing) {
        return;
      }

      rows.push({
        siteId: site.id,
        siteName: site.name,
        staff,
        compliance,
        appointmentMissing,
        supervisorTrainingMissing,
      });
    });
  });

  // 'none'(직무교육 대상 아님)은 조치 대상이 아니므로 항상 맨 뒤로 정렬합니다.
  const rank: Record<ComplianceLevel, number> = { expired: 0, soon: 1, missing: 2, ok: 3, none: 4 };
  rows.sort((a, b) => {
    const byLevel = rank[a.compliance.level] - rank[b.compliance.level];
    if (byLevel !== 0) return byLevel;
    // 남은 일수가 적은 순 (null 은 뒤로)
    const da = a.compliance.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const db = b.compliance.daysLeft ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return rows;
};

/** 관리자 대시보드 카드용 전체 합계 */
export const totalIssueCount = (rows: StaffIssue[]): number =>
  rows.filter(r => needsAttention(r.compliance)).length;
