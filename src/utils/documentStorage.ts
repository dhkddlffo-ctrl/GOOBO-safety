import { SiteDocument } from '../types';

/**
 * 현장문서 저장소
 *
 * 설계 원칙
 * - 파일 본문(Blob)은 IndexedDB에 저장 → LocalStorage 5~10MB 한계 회피 (수백 MB 가능)
 * - 문서 메타데이터만 LocalStorage에 저장 → 목록 조회가 빠름
 * - storageKey 필드를 두어, 추후 Cloudflare R2 로 이전할 때
 *   putFile/getFile/deleteFile 구현만 R2 API 호출로 교체하면 되도록 분리
 */

const DOCS_KEY = 'gubo_site_documents';
const DB_NAME = 'gubo_documents_db';
const DB_VERSION = 1;
const FILE_STORE = 'files';

/* ------------------------------------------------------------------ */
/* 파일 허용 정책                                                       */
/* ------------------------------------------------------------------ */

export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'hwp', 'hwpx', 'dwg', 'dxf', 'zip', 'txt', 'csv',
  'jpg', 'jpeg', 'png', 'gif', 'webp',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (IndexedDB 기준)

export const getExtension = (fileName: string): string =>
  fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

export const isAllowedFile = (fileName: string): boolean =>
  ALLOWED_EXTENSIONS.includes(getExtension(fileName));

export const isPreviewable = (fileName: string): boolean =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(getExtension(fileName));

/** 확장자별 아이콘 + 색상 */
export const getFileMeta = (fileName: string): { icon: string; color: string; label: string } => {
  const ext = getExtension(fileName);
  switch (ext) {
    case 'pdf':
      return { icon: '📕', color: '#dc2626', label: 'PDF' };
    case 'doc':
    case 'docx':
      return { icon: '📘', color: '#2563eb', label: 'DOC' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { icon: '📗', color: '#16a34a', label: 'XLS' };
    case 'ppt':
    case 'pptx':
      return { icon: '📙', color: '#ea580c', label: 'PPT' };
    case 'hwp':
    case 'hwpx':
      return { icon: '📄', color: '#0891b2', label: 'HWP' };
    case 'dwg':
    case 'dxf':
      return { icon: '📐', color: '#7c3aed', label: 'CAD' };
    case 'zip':
      return { icon: '🗜️', color: '#64748b', label: 'ZIP' };
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return { icon: '🖼️', color: '#db2777', label: 'IMG' };
    case 'txt':
      return { icon: '📃', color: '#4b5563', label: 'TXT' };
    default:
      return { icon: '📎', color: '#6b7280', label: ext.toUpperCase() || 'FILE' };
  }
};

/** 파일 크기 표기 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/* ------------------------------------------------------------------ */
/* IndexedDB (파일 본문)                                                */
/* ------------------------------------------------------------------ */

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** 파일 저장 (R2 이전 시 이 함수만 교체) */
export const putFile = async (key: string, blob: Blob): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).put(blob, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

/** 파일 조회 (R2 이전 시 이 함수만 교체) */
export const getFile = async (key: string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const request = tx.objectStore(FILE_STORE).get(key);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as Blob) || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

/** 파일 삭제 (R2 이전 시 이 함수만 교체) */
export const deleteFile = async (key: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

/* ------------------------------------------------------------------ */
/* 메타데이터 (LocalStorage)                                            */
/* ------------------------------------------------------------------ */

export const getDocuments = (): SiteDocument[] => {
  const data = localStorage.getItem(DOCS_KEY);
  return data ? JSON.parse(data) : [];
};

const persist = (docs: SiteDocument[]): void => {
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
};

export const saveDocument = (doc: SiteDocument): void => {
  const docs = getDocuments();
  docs.unshift(doc);
  persist(docs);
};

export const updateDocument = (id: string, updates: Partial<SiteDocument>): void => {
  const docs = getDocuments();
  const index = docs.findIndex(d => d.id === id);
  if (index !== -1) {
    docs[index] = { ...docs[index], ...updates };
    persist(docs);
  }
};

/** 문서 삭제 (메타데이터 + 파일 본문 함께 삭제) */
export const deleteDocument = async (id: string): Promise<void> => {
  const docs = getDocuments();
  const target = docs.find(d => d.id === id);
  if (target) {
    try {
      await deleteFile(target.storageKey);
    } catch (error) {
      console.warn('파일 본문 삭제 실패:', error);
    }
  }
  persist(docs.filter(d => d.id !== id));
};

export const clearAllDocuments = (): void => {
  localStorage.removeItem(DOCS_KEY);
};

/* ------------------------------------------------------------------ */
/* 유틸                                                               */
/* ------------------------------------------------------------------ */

export const generateDocId = (): string =>
  `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const generateStorageKey = (fileName: string): string => {
  const ext = getExtension(fileName);
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return ext ? `${base}.${ext}` : base;
};

/** 전체 문서 용량 합계 (bytes) */
export const getTotalUsage = (docs?: SiteDocument[]): number =>
  (docs || getDocuments()).reduce((sum, d) => sum + (d.fileSize || 0), 0);

/* ------------------------------------------------------------------ */
/* 분류 연동 헬퍼 (분류 관리에서 사용)                                   */
/* ------------------------------------------------------------------ */

/** 특정 분류에 속한 문서 건수 */
export const countDocumentsByCategory = (category: string): number =>
  getDocuments().filter(d => d.category === category).length;

/** 분류명 변경 시 기존 문서들의 분류명을 함께 이관 */
export const renameDocumentCategory = (from: string, to: string): void => {
  const docs = getDocuments();
  let changed = false;
  const next = docs.map(d => {
    if (d.category !== from) return d;
    changed = true;
    return { ...d, category: to };
  });
  if (changed) persist(next);
};

/** 브라우저 저장소 여유 확인 (StorageManager 지원 시) */
export const getStorageQuota = async (): Promise<{ usage: number; quota: number } | null> => {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
};
