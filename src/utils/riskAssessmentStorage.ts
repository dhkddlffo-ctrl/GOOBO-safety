/**
 * 위험성평가 (서식 SCM-002-1.01 위험성평가표 / 등록부) 저장소
 *
 * 서버가 없으므로 표 데이터는 LocalStorage 에, 첨부파일 본문은
 * IndexedDB(documentStorage) 에 보관합니다. (문서보관함과 동일한 방식)
 */

import { RiskAssessment, RiskRow, RiskAttachment, RiskGrade, RiskScore } from '../types';
import { putFile, getFile, deleteFile, generateStorageKey } from './documentStorage';

/* ------------------------------------------------------------------ */
/* 상수                                                                */
/* ------------------------------------------------------------------ */

const ASSESSMENTS_KEY = 'gubo_risk_assessments';
const ATTACHMENTS_KEY = 'gubo_risk_attachments';

/**
 * 회사 양식의 기본 행 수.
 * 1페이지 8행 + 2페이지 6행 = 14행이며, 필요하면 화면에서 행을 더 추가할 수 있습니다.
 */
export const DEFAULT_RISK_ROWS = 14;

/** 1페이지에 들어가는 행 수 (인쇄 시 페이지 나눔 기준) */
export const ROWS_PER_FIRST_PAGE = 8;

/** 2페이지부터 한 장에 들어가는 행 수 (양식: 8 + 6) */
export const ROWS_PER_SECOND_PAGE = 6;

/**
 * 조치/점검 묶음 항목.
 * 이 중 하나를 고치면 '아래 행에 함께 적용' 옵션이 켜져 있을 때
 * 아래 행들의 같은 항목도 함께 바뀝니다.
 */
export const ACTION_FIELDS = ['actionDueDate', 'actionDoneDate', 'inspector'] as const;

/** 재해 형태 선택지 — 사고사례 분류와 맞춰 통계를 함께 볼 수 있게 합니다. */
export const ACCIDENT_TYPES = [
  '추락',
  '낙하·비래',
  '전도',
  '충돌·접촉',
  '협착',
  '끼임',
  '깔림·뒤집힘',
  '절단·베임·찔림',
  '전기감전',
  '화재·폭발',
  '붕괴·무너짐',
  '질식',
  '중량물 취급',
  '질병',
  '기타',
] as const;

/* ------------------------------------------------------------------ */
/* 평가 계산                                                           */
/* ------------------------------------------------------------------ */

/**
 * 평가합계 = 강도 + 빈도  (⚠️ 곱셈이 아닙니다)
 * 강도·빈도가 모두 입력된 경우에만 합계를 냅니다. 아니면 0.
 *
 * 회사 양식 예시: 강도 2 · 빈도 2 → 합계 4 → 등급 상
 */
export const calcTotal = (row: Pick<RiskRow, 'intensity' | 'frequency'>): number => {
  if (!row.intensity || !row.frequency) return 0;
  return row.intensity + row.frequency;
};

/**
 * 평가 등급.
 *  합계 2~3 → 하(일상관리)
 *  합계 4   → 상(중점관리)
 */
export const calcGrade = (total: number): RiskGrade | '' => {
  if (total <= 0) return '';
  return total >= 4 ? '상' : '하';
};

/** 행 하나의 합계·등급을 함께 계산 */
export const evaluateRow = (row: RiskRow): { total: number; grade: RiskGrade | '' } => {
  const total = calcTotal(row);
  return { total, grade: calcGrade(total) };
};

/** 표 전체 요약 (상등급 건수 등) */
export const summarizeAssessment = (assessment: RiskAssessment) => {
  let filled = 0;
  let high = 0;
  let low = 0;
  let done = 0;

  assessment.rows.forEach(row => {
    const hasContent = row.hazard.trim() !== '';
    if (!hasContent) return;
    filled += 1;

    const { grade } = evaluateRow(row);
    if (grade === '상') high += 1;
    if (grade === '하') low += 1;

    /* 조치완료일이 채워져 있으면 조치 완료로 봅니다. */
    if (row.actionDoneDate) done += 1;
  });

  return { filled, high, low, done };
};

/* ------------------------------------------------------------------ */
/* 기본값 생성                                                         */
/* ------------------------------------------------------------------ */

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createEmptyRiskRow = (): RiskRow => ({
  id: newId(),
  workPeriod: '',
  workLocation: '',
  hazardFinder: '',
  hazard: '',
  accidentType: '',
  intensity: 0,
  frequency: 0,
  manageRegistered: '',
  improvementPlan: '',
  actionDueDate: '',
  actionDoneDate: '',
  inspector: '',
});

/** 위험성평가표 1건의 빈 서식 (기본 14행 — 화면에서 행을 더 추가할 수 있음) */
export const createEmptyRiskAssessment = (
  siteId: number,
  siteName: string,
  author = ''
): RiskAssessment => {
  const now = new Date().toISOString();
  return {
    id: newId(),
    siteId,
    siteName,
    constructionName: siteName,
    author,
    writtenAt: now.slice(0, 10),
    rows: Array.from({ length: DEFAULT_RISK_ROWS }, () => createEmptyRiskRow()),
    extraHazards: '',
    monitoringNote: '',
    note: '',
    createdAt: now,
    updatedAt: now,
  };
};

/* ------------------------------------------------------------------ */
/* 위험성평가표 저장 (LocalStorage)                                     */
/* ------------------------------------------------------------------ */

export const getRiskAssessments = (siteId?: number): RiskAssessment[] => {
  const raw = localStorage.getItem(ASSESSMENTS_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as RiskAssessment[];
    if (!Array.isArray(all)) return [];
    return siteId === undefined ? all : all.filter(a => a.siteId === siteId);
  } catch {
    return [];
  }
};

export const getRiskAssessment = (id: string): RiskAssessment | null =>
  getRiskAssessments().find(a => a.id === id) ?? null;

export const saveRiskAssessment = (assessment: RiskAssessment): void => {
  const all = getRiskAssessments();
  const next = { ...assessment, updatedAt: new Date().toISOString() };
  const index = all.findIndex(a => a.id === assessment.id);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  localStorage.setItem(ASSESSMENTS_KEY, JSON.stringify(all));
};

export const deleteRiskAssessment = (id: string): void => {
  const all = getRiskAssessments().filter(a => a.id !== id);
  localStorage.setItem(ASSESSMENTS_KEY, JSON.stringify(all));
};

/* ------------------------------------------------------------------ */
/* 부속 서식 첨부 (양식 10~13페이지 등)                                 */
/* ------------------------------------------------------------------ */

export const getRiskAttachments = (siteId?: number): RiskAttachment[] => {
  const raw = localStorage.getItem(ATTACHMENTS_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as RiskAttachment[];
    if (!Array.isArray(all)) return [];
    return siteId === undefined ? all : all.filter(a => a.siteId === siteId);
  } catch {
    return [];
  }
};

/**
 * 첨부파일 저장 — 파일 본문은 IndexedDB, 정보는 LocalStorage.
 * 본문 저장이 실패하면 정보를 남기지 않습니다(깨진 항목 방지).
 */
export const saveRiskAttachment = async (
  siteId: number,
  siteName: string,
  file: File,
  meta: { title: string; period: string; uploadedBy: string }
): Promise<RiskAttachment> => {
  const storageKey = generateStorageKey(file.name);
  await putFile(storageKey, file);

  const attachment: RiskAttachment = {
    id: newId(),
    siteId,
    siteName,
    title: meta.title.trim() || file.name,
    period: meta.period,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || 'application/octet-stream',
    storageKey,
    uploadedBy: meta.uploadedBy,
    createdAt: new Date().toISOString(),
  };

  const all = getRiskAttachments();
  all.unshift(attachment);
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(all));
  return attachment;
};

/** 첨부 삭제 — 파일 본문(IndexedDB)과 정보(LocalStorage)를 함께 지웁니다. */
export const deleteRiskAttachment = async (id: string): Promise<void> => {
  const all = getRiskAttachments();
  const target = all.find(a => a.id === id);
  if (!target) return;

  try {
    await deleteFile(target.storageKey);
  } catch {
    /* 파일이 이미 없어도 정보는 지웁니다. */
  }

  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(all.filter(a => a.id !== id)));
};

/** 첨부파일 본문 가져오기 (미리보기·다운로드용) */
export const getRiskAttachmentFile = (attachment: RiskAttachment): Promise<Blob | null> =>
  getFile(attachment.storageKey);

/* ------------------------------------------------------------------ */
/* 강도·빈도 선택 토글                                                 */
/* ------------------------------------------------------------------ */

/**
 * 강도/빈도 값 선택. 이미 선택된 값을 다시 누르면 해제(0)됩니다.
 * (잘못 눌렀을 때 빈 칸으로 되돌릴 수 있게)
 */
export const toggleScore = (current: RiskScore | 0, next: RiskScore): RiskScore | 0 =>
  current === next ? 0 : next;

/** 강도·빈도 표기 (0 → '-') */
export const scoreLabel = (value: RiskScore | 0): string => (value ? String(value) : '-');
