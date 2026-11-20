/**
 * 위험성평가 상등급 관리 (양식 5페이지 / A4 가로) 저장소
 *
 * 등록부(SCM-002-1.01)에서 평가등급 '상'(중점관리)으로 나온 위험요인을
 * 모아 실제 개선조치의 실천·완료 여부를 확인하는 표입니다.
 *
 * 서버가 없으므로 표 데이터는 LocalStorage 에 저장합니다.
 */

import { HighGradeRecord, HighGradeRow, RiskAssessment } from '../types';
import { evaluateRow } from './riskAssessmentStorage';

const HIGH_GRADE_KEY = 'gubo_high_grade_records';

/** 상등급 관리 시트의 기본 빈 행 수 (양식 5페이지 예시와 동일하게 3행) */
export const DEFAULT_HIGH_GRADE_ROWS = 3;

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/* ------------------------------------------------------------------ */
/* 기본값 생성                                                         */
/* ------------------------------------------------------------------ */

export const createEmptyHighGradeRow = (): HighGradeRow => ({
  id: newId(),
  workPeriod: '',
  workLocation: '',
  hazardFinder: '',
  hazard: '',
  improvementPlan: '',
  actionResult: '',
  confirmer: '',
});

export const createEmptyHighGradeRecord = (siteId: number, siteName: string): HighGradeRecord => {
  const now = new Date().toISOString();
  return {
    id: newId(),
    siteId,
    siteName,
    writtenAt: now.slice(0, 10),
    rows: Array.from({ length: DEFAULT_HIGH_GRADE_ROWS }, () => createEmptyHighGradeRow()),
    note: '',
    createdAt: now,
    updatedAt: now,
  };
};

/* ------------------------------------------------------------------ */
/* 저장 / 불러오기 (LocalStorage)                                      */
/* ------------------------------------------------------------------ */

const readAll = (): HighGradeRecord[] => {
  const raw = localStorage.getItem(HIGH_GRADE_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as HighGradeRecord[];
    if (!Array.isArray(all)) return [];
    return all;
  } catch {
    return [];
  }
};

export const getHighGradeRecords = (siteId?: number): HighGradeRecord[] => {
  const all = readAll();
  return siteId === undefined ? all : all.filter(r => r.siteId === siteId);
};

export const getHighGradeRecord = (id: string): HighGradeRecord | null =>
  readAll().find(r => r.id === id) ?? null;

/**
 * 현장의 상등급 관리 시트를 가져옵니다.
 * 없으면 빈 시트를 만들어 저장하고 돌려줍니다. (한 현장 = 한 장부)
 */
export const ensureHighGradeRecord = (siteId: number, siteName: string): HighGradeRecord => {
  const existing = getHighGradeRecords(siteId);
  if (existing.length > 0) return existing[0];

  const created = createEmptyHighGradeRecord(siteId, siteName);
  saveHighGradeRecord(created);
  return created;
};

export const saveHighGradeRecord = (record: HighGradeRecord): void => {
  const all = readAll();
  const next = { ...record, updatedAt: new Date().toISOString() };
  const index = all.findIndex(r => r.id === record.id);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  localStorage.setItem(HIGH_GRADE_KEY, JSON.stringify(all));
};

export const deleteHighGradeRecord = (id: string): void => {
  localStorage.setItem(HIGH_GRADE_KEY, JSON.stringify(readAll().filter(r => r.id !== id)));
};

/* ------------------------------------------------------------------ */
/* 등록부에서 상등급 항목 가져오기                                      */
/* ------------------------------------------------------------------ */

/**
 * 해당 현장의 위험성평가 등록부를 훑어 **평가등급 '상'** 인 행만 뽑아
 * 상등급 관리 행으로 변환합니다.
 *
 * 이미 같은 위험요인이 표에 들어 있으면 중복해서 넣지 않습니다.
 */
export const collectHighGradeRows = (
  assessments: RiskAssessment[],
  existing: HighGradeRow[],
): HighGradeRow[] => {
  const seen = new Set(
    existing.map(r => `${r.hazard.trim()}::${r.workPeriod.trim()}`).filter(k => k !== '::'),
  );

  const collected: HighGradeRow[] = [];

  assessments.forEach(assessment => {
    assessment.rows.forEach(row => {
      /* 위험요인이 비어 있거나 등급이 '상'이 아니면 제외 */
      if (row.hazard.trim() === '') return;
      const { grade } = evaluateRow(row);
      if (grade !== '상') return;

      const key = `${row.hazard.trim()}::${row.workPeriod.trim()}`;
      if (seen.has(key)) return;
      seen.add(key);

      collected.push({
        id: newId(),
        workPeriod: row.workPeriod,
        workLocation: row.workLocation,
        hazardFinder: row.hazardFinder,
        hazard: row.hazard,
        improvementPlan: row.improvementPlan,
        /* 실천/완료 — 조치완료일이 있으면 완료로 미리 채워 줍니다. */
        actionResult: row.actionDoneDate ? `완료 (${row.actionDoneDate})` : '',
        confirmer: row.inspector,
      });
    });
  });

  return collected;
};

/** 상등급 행 요약 (표 머리 통계용) */
export const summarizeHighGrade = (record: HighGradeRecord) => {
  const filled = record.rows.filter(r => r.hazard.trim() !== '').length;
  const done = record.rows.filter(
    r => r.hazard.trim() !== '' && r.actionResult.trim() !== '',
  ).length;
  const confirmed = record.rows.filter(
    r => r.hazard.trim() !== '' && r.confirmer.trim() !== '',
  ).length;

  return { filled, done, confirmed, pending: filled - done };
};
