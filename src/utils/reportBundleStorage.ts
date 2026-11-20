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
  signature: '',
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
  schedule: createEmptySafetySchedule(),
  updatedAt: new Date().toISOString(),
});

/* ------------------------------------------------------------------ */
/* 저장 / 불러오기                                                      */
/* ------------------------------------------------------------------ */

const readAll = (): ReportBundle[] => {
  const raw = localStorage.getItem(BUNDLE_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as ReportBundle[];
    return Array.isArray(all) ? all : [];
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
