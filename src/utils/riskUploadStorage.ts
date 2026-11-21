/**
 * 위험성평가 올리기 (이미지) 저장소
 *
 * 현장에서 화면에 직접 입력하기 어려울 때, 종이에 작성한 위험성평가표를
 * 사진으로 찍어 여러 장 올려 한 건으로 보관합니다.
 *
 * 서버가 없으므로 정보는 LocalStorage 에, 이미지 본문(Blob)은
 * IndexedDB(documentStorage) 에 저장합니다. (사진대지·문서보관함과 같은 방식)
 */

import { RiskUpload, RiskUploadPage } from '../types';
import { deleteFile, generateStorageKey, putFile } from './documentStorage';

const UPLOADS_KEY = 'gubo_risk_uploads';

/** 한 건에 올릴 수 있는 이미지 최대 장수 (13페이지 양식 기준) */
export const MAX_UPLOAD_PAGES = 13;

/** 이미지 1장 최대 용량 */
export const MAX_UPLOAD_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/** 올릴 수 있는 이미지 확장자 */
export const UPLOAD_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic'];

export const getUploadExtension = (fileName: string): string =>
  fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

/** 올릴 수 있는 이미지 파일인지 */
export const isUploadImage = (fileName: string): boolean =>
  UPLOAD_IMAGE_EXTENSIONS.includes(getUploadExtension(fileName));

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const readAll = (): RiskUpload[] => {
  const raw = localStorage.getItem(UPLOADS_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as RiskUpload[];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
};

const writeAll = (all: RiskUpload[]): void => {
  localStorage.setItem(UPLOADS_KEY, JSON.stringify(all));
};

/* ------------------------------------------------------------------ */
/* 조회                                                                */
/* ------------------------------------------------------------------ */

/** 현장별(또는 전체) 올린 위험성평가 — 최신순 */
export const getRiskUploads = (siteId?: number): RiskUpload[] => {
  const all = readAll();
  const filtered = siteId === undefined ? all : all.filter(u => u.siteId === siteId);
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
};

export const getRiskUpload = (id: string): RiskUpload | null =>
  readAll().find(u => u.id === id) ?? null;

/* ------------------------------------------------------------------ */
/* 저장 / 삭제                                                          */
/* ------------------------------------------------------------------ */

/**
 * 올린 위험성평가 1건 저장 (새로 만들기 / 수정 공용).
 * 넘겨받은 페이지 중 아직 IndexedDB 에 없는 것만 새로 씁니다.
 */
export const saveRiskUpload = (upload: RiskUpload): void => {
  const all = readAll();
  const next: RiskUpload = { ...upload, updatedAt: new Date().toISOString() };
  const index = all.findIndex(u => u.id === upload.id);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  writeAll(all);
};

/** 이미지 1장을 IndexedDB 에 저장하고 페이지 정보를 돌려줍니다. */
export const saveRiskUploadPage = async (file: File): Promise<RiskUploadPage> => {
  const storageKey = generateStorageKey(file.name);
  await putFile(storageKey, file);
  return {
    id: newId(),
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || 'image/jpeg',
    storageKey,
  };
};

/** 이미지 1장 삭제 (IndexedDB 본문만) */
export const removeRiskUploadPageFile = async (storageKey: string): Promise<void> => {
  if (!storageKey) return;
  try {
    await deleteFile(storageKey);
  } catch {
    /* 파일이 이미 없어도 무시합니다. */
  }
};

/** 올린 위험성평가 1건 삭제 — 이미지 본문까지 함께 지웁니다. */
export const deleteRiskUpload = async (id: string): Promise<void> => {
  const all = readAll();
  const target = all.find(u => u.id === id);
  if (!target) return;

  await Promise.all(target.pages.map(p => removeRiskUploadPageFile(p.storageKey)));
  writeAll(all.filter(u => u.id !== id));
};

/* ------------------------------------------------------------------ */
/* 기본값                                                              */
/* ------------------------------------------------------------------ */

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

export const createEmptyRiskUpload = (siteId: number, siteName: string): RiskUpload => {
  const now = new Date();
  return {
    id: newId(),
    siteId,
    siteName,
    title: `${now.getFullYear()}년 ${now.getMonth() + 1}월 수시 위험성평가`,
    writtenAt: today(),
    author: '',
    note: '',
    pages: [],
    uploadedBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

/** 파일 크기 합계 */
export const getUploadTotalSize = (upload: RiskUpload): number =>
  upload.pages.reduce((sum, p) => sum + (p.fileSize || 0), 0);
