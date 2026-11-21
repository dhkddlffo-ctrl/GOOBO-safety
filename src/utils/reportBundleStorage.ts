/**
 * 위험성평가 보고서 묶음 저장소
 *
 * 등록부(SCM-002-1.01) 1건에 딸리는 부속 서식
 *   - 안전 회의록        (양식 6페이지)
 *   - 참석자 명단        (양식 7페이지)
 *   - 사진대지           (양식 3·4페이지)
 *   - 안전보건 일정      (양식 9페이지)
 * 을 하나로 묶어 보관합니다.
 *
 * 서버가 없으므로 표 데이터는 LocalStorage 에,
 * 사진 본문(Blob)은 IndexedDB(documentStorage) 에 저장합니다.
 */

import {
  AttendeeList,
  AttendeeListEntry,
  MeetingAttendee,
  MeetingMinutes,
  PhotoSheet,
  ReportBundle,
  SafetySchedule,
  WorkSchedule,
  WorkScheduleRow,
} from '../types';

const BUNDLE_KEY = 'gubo_report_bundles';

/** 회의록 참석칸 수 (양식: 2열 × 6행) */
export const MEETING_ATTENDEE_SLOTS = 12;

/** 참석자 명단 칸 수 (양식: 2열 × 20행) */
export const ATTENDEE_LIST_SLOTS = 40;

/** 사진대지 사진 칸 수 — 회의 2칸 / 모니터링 2칸 */
export const PHOTO_SLOTS = 2;

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const today = (): string => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* 기본값                                                              */
/* ------------------------------------------------------------------ */

export const createEmptyMeetingAttendee = (): MeetingAttendee => ({
  id: newId(),
  position: '',
  name: '',
  signatureKey: '',
  signedAt: '',
});

export const createEmptyAttendeeEntry = (): AttendeeListEntry => ({
  id: newId(),
  company: '',
  jobType: '',
  name: '',
  signature: '',
});

export const createEmptyMeetingMinutes = (): MeetingMinutes => ({
  title: '',
  docNo: '',
  meetingAt: '',
  place: '',
  approval: { writer: '', reviewer: '', approver: '' },
  attendees: Array.from({ length: MEETING_ATTENDEE_SLOTS }, () => createEmptyMeetingAttendee()),
  content: '',
  remark: '위험성평가 교육 이수자 명단 참조.',
});

export const createEmptyAttendeeList = (): AttendeeList => {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    day: '',
    entries: Array.from({ length: ATTENDEE_LIST_SLOTS }, () => createEmptyAttendeeEntry()),
  };
};

export const createEmptyPhotoSheet = (
  siteName = '',
  kind: 'meeting' | 'monitoring' = 'meeting',
): PhotoSheet => ({
  title: kind === 'meeting' ? '[KOSAH-MS 관련 위험성평가 회의]' : '모니터링 안전점검 사진대지',
  kind,
  constructionName: siteName,
  items: Array.from({ length: PHOTO_SLOTS }, () => ({
    id: newId(),
    date: '',
    location: '',
    caption: '',
    description: '',
    storageKey: '',
    fileName: '',
  })),
});

export const createEmptySafetySchedule = (): SafetySchedule => {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    approval: { writer: '', review1: '', review2: '', review3: '', approver: '' },
    notes: {},
  };
};

/** 공정표 기본 행 수 */
export const DEFAULT_WORK_ROWS = 8;

export const createEmptyWorkScheduleRow = (): WorkScheduleRow => ({
  id: newId(),
  workType: '',
  location: '',
  worker: '',
  startDate: '',
  endDate: '',
  note: '',
});

/** 이번 달 1일 / 말일 (yyyy-mm-dd) */
const monthRange = (): { start: string; end: string } => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
};

export const createEmptyWorkSchedule = (siteName = ''): WorkSchedule => {
  const range = monthRange();
  return {
    title: '',
    constructionName: siteName,
    writtenAt: today(),
    periodStart: range.start,
    periodEnd: range.end,
    approval: { writer: '', reviewer: '', approver: '' },
    rows: Array.from({ length: DEFAULT_WORK_ROWS }, () => createEmptyWorkScheduleRow()),
  };
};

export const createEmptyBundle = (
  assessmentId: string,
  siteId: number,
  siteName: string,
): ReportBundle => ({
  assessmentId,
  siteId,
  siteName,
  meeting: createEmptyMeetingMinutes(),
  attendees: createEmptyAttendeeList(),
  photoSheets: [
    createEmptyPhotoSheet(siteName, 'meeting'),
    createEmptyPhotoSheet(siteName, 'monitoring'),
  ],
  workSchedule: createEmptyWorkSchedule(siteName),
  schedule: createEmptySafetySchedule(),
  updatedAt: new Date().toISOString(),
});

/* ------------------------------------------------------------------ */
/* 저장 / 불러오기                                                      */
/* ------------------------------------------------------------------ */

/**
 * 예전에 저장한 묶음에는 공정표(workSchedule)가 없습니다.
 * 읽어올 때 빈 공정표를 채워 넣어 화면이 깨지지 않게 합니다.
 */
const normalizeBundle = (bundle: ReportBundle): ReportBundle => {
  if (bundle.workSchedule) return bundle;
  return { ...bundle, workSchedule: createEmptyWorkSchedule(bundle.siteName) };
};

const readAll = (): ReportBundle[] => {
  const raw = localStorage.getItem(BUNDLE_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as ReportBundle[];
    return Array.isArray(all) ? all.map(normalizeBundle) : [];
  } catch {
    return [];
  }
};

const writeAll = (all: ReportBundle[]): void => {
  localStorage.setItem(BUNDLE_KEY, JSON.stringify(all));
};

export const getBundles = (siteId?: number): ReportBundle[] => {
  const all = readAll();
  return siteId === undefined ? all : all.filter(b => b.siteId === siteId);
};

export const getBundle = (assessmentId: string): ReportBundle | null =>
  readAll().find(b => b.assessmentId === assessmentId) ?? null;

export const saveBundle = (bundle: ReportBundle): void => {
  const all = readAll();
  const next: ReportBundle = { ...bundle, updatedAt: new Date().toISOString() };
  const index = all.findIndex(b => b.assessmentId === bundle.assessmentId);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  writeAll(all);
};

/**
 * 등록부 1건의 보고서 묶음을 가져옵니다.
 * 없으면 빈 묶음을 만들어 저장하고 돌려줍니다. (등록부 1건 = 묶음 1개)
 */
export const ensureBundle = (
  assessmentId: string,
  siteId: number,
  siteName: string,
): ReportBundle => {
  const existing = getBundle(assessmentId);
  if (existing) return existing;

  const created = createEmptyBundle(assessmentId, siteId, siteName);
  saveBundle(created);
  return created;
};

export const deleteBundle = (assessmentId: string): void => {
  writeAll(readAll().filter(b => b.assessmentId !== assessmentId));
};

/* ------------------------------------------------------------------ */
/* 작성 진행률                                                          */
/* ------------------------------------------------------------------ */

export interface BundleProgress {
  meeting: boolean;
  attendees: boolean;
  photo: boolean;
  schedule: boolean;
  /** 완료한 단계 수 (0~4) */
  done: number;
  /** 전체 단계 수 */
  total: number;
}

/** 어떤 서식이 실제로 채워졌는지 판단 (진행률 표시용) */
export const getBundleProgress = (bundle: ReportBundle): BundleProgress => {
  const meeting =
    bundle.meeting.title.trim() !== '' ||
    bundle.meeting.meetingAt.trim() !== '' ||
    bundle.meeting.content.trim() !== '' ||
    bundle.meeting.attendees.some(a => a.name.trim() !== '');

  const attendees = bundle.attendees.entries.some(
    e => e.name.trim() !== '' || e.company.trim() !== '',
  );

  const photo = bundle.photoSheets.some(sheet => sheet.items.some(i => i.storageKey !== ''));

  const schedule = Object.values(bundle.schedule.notes).some(v => v.trim() !== '');

  const flags = [meeting, attendees, photo, schedule];
  return {
    meeting,
    attendees,
    photo,
    schedule,
    done: flags.filter(Boolean).length,
    total: flags.length,
  };
};

/* ------------------------------------------------------------------ */
/* 안전보건 일정 — 달력 헬퍼                                             */
/* ------------------------------------------------------------------ */

export interface ScheduleCell {
  /** yyyy-mm-dd (해당 월이 아니면 '') */
  date: string;
  day: number | 0;
  /** 0=일 … 6=토 */
  weekday: number;
  inMonth: boolean;
}

/**
 * 해당 연월의 달력 행을 만듭니다.
 * 일요일 시작 ~ 토요일 끝 (양식이 일~토 7칸이므로 일요일 시작).
 */
export const buildMonthGrid = (year: number, month: number): ScheduleCell[][] => {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const startWeekday = first.getDay(); // 0=일

  const cells: ScheduleCell[] = [];
  /* 앞쪽 빈칸 */
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ date: '', day: 0, weekday: i, inMonth: false });
  }
  /* 실제 날짜 */
  for (let d = 1; d <= lastDay; d += 1) {
    const dt = new Date(year, month - 1, d);
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: ymd, day: d, weekday: dt.getDay(), inMonth: true });
  }
  /* 뒤쪽 빈칸 (토요일까지) */
  while (cells.length % 7 !== 0) {
    cells.push({ date: '', day: 0, weekday: cells.length % 7, inMonth: false });
  }

  const rows: ScheduleCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
};

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 오늘 날짜 문자열 */
export const todayString = today;

/* ------------------------------------------------------------------ */
/* 공사 공정표 — 날짜 축 헬퍼                                            */
/* ------------------------------------------------------------------ */

export interface WorkDayCell {
  /** yyyy-mm-dd */
  date: string;
  day: number;
  /** 0=일 … 6=토 */
  weekday: number;
}

/** 공정표에 그릴 수 있는 최대 일수 (A4 가로 한 장에 들어가는 선) */
export const MAX_WORK_DAYS = 31;

const parseYmd = (ymd: string): Date | null => {
  if (!ymd || ymd.length < 10) return null;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0',
  )}`;

/**
 * 공정 기간(시작~종료)을 하루 단위 칸으로 잘라 줍니다.
 * 날짜가 잘못되었거나 기간이 뒤집혀 있으면 빈 배열을 돌려줍니다.
 * 31일을 넘으면 한 장에 담을 수 없으므로 31일까지만 만듭니다.
 */
export const buildWorkDayAxis = (start: string, end: string): WorkDayCell[] => {
  const from = parseYmd(start);
  const to = parseYmd(end);
  if (!from || !to || from > to) return [];

  const cells: WorkDayCell[] = [];
  const cursor = new Date(from);
  while (cursor <= to && cells.length < MAX_WORK_DAYS) {
    cells.push({ date: toYmd(cursor), day: cursor.getDate(), weekday: cursor.getDay() });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
};

/** 공정표 행의 막대가 해당 날짜에 걸치는지 */
export const isDayInWork = (date: string, start: string, end: string): boolean => {
  if (!date || !start || !end) return false;
  return date >= start && date <= end;
};

/**
 * 공정 기간이 실제로 며칠인지 셉니다.
 * (MAX_WORK_DAYS 를 넘어 잘렸는지 안내하는 데 씁니다)
 */
export const countWorkDays = (start: string, end: string): number => {
  const from = parseYmd(start);
  const to = parseYmd(end);
  if (!from || !to || from > to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
};
