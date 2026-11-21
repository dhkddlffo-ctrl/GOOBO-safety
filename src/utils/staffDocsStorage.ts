import { StaffAttachment, StaffDocKind } from '../types';

/**
 * 관리자(안전인력) 첨부자료 저장소
 *
 * 지정서 · 교육이수증은 스캔한 사진이나 PDF라 용량이 큽니다.
 * 문서보관함(documentStorage)과 같은 방식으로
 *  - 파일 본문(Blob) → IndexedDB (수백 MB 가능)
 *  - 파일 정보(이름·크기·종류) → LocalStorage (SiteStaff.attachments)
 * 로 나누어 저장합니다.
 *
 * 문서보관함과는 별도 DB를 써서, 문서보관함을 정리해도
 * 관리자 첨부자료가 함께 지워지지 않도록 했습니다.
 */

const DB_NAME = 'gubo_staff_docs_db';
const DB_VERSION = 1;
const FILE_STORE = 'files';

/** 첨부자료로 허용하는 확장자 (스캔본·사진·PDF 중심) */
export const STAFF_DOC_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'hwp',
  'hwpx',
  'doc',
  'docx',
];

/** 첨부자료 1건 최대 크기 (20MB) */
export const STAFF_DOC_MAX_SIZE = 20 * 1024 * 1024;

/** input[type=file] accept 문자열 */
export const STAFF_DOC_ACCEPT = STAFF_DOC_EXTENSIONS.map(ext => `.${ext}`).join(',');

export const getStaffDocExtension = (fileName: string): string =>
  fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

export const isAllowedStaffDoc = (fileName: string): boolean =>
  STAFF_DOC_EXTENSIONS.includes(getStaffDocExtension(fileName));

/** 화면에서 바로 미리 볼 수 있는 형식인지 (이미지 · PDF) */
export const isStaffDocPreviewable = (fileName: string): boolean =>
  ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getStaffDocExtension(fileName));

/** 첨부자료로 이미지인지 */
export const isStaffDocImage = (fileName: string): boolean =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getStaffDocExtension(fileName));

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

/** 파일 본문 저장 */
export const putStaffDocFile = async (key: string, blob: Blob): Promise<void> => {
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

/** 파일 본문 조회 */
export const getStaffDocFile = async (key: string): Promise<Blob | null> => {
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

/** 파일 본문 삭제 */
export const deleteStaffDocFile = async (key: string): Promise<void> => {
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
/* 식별자 · 파일 정보                                                   */
/* ------------------------------------------------------------------ */

export const generateStaffDocId = (): string =>
  `sdoc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const generateStaffDocKey = (fileName: string): string => {
  const ext = getStaffDocExtension(fileName);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return ext ? `staff/${stamp}.${ext}` : `staff/${stamp}`;
};

/** Blob 저장 + SiteStaff.attachments 에 넣을 정보를 만들어 줍니다. */
export const createStaffAttachment = async (
  file: File,
  kind: StaffDocKind,
  uploadedBy = '',
): Promise<StaffAttachment> => {
  if (!isAllowedStaffDoc(file.name)) {
    throw new Error('지정서·교육이수증은 PDF · 이미지 · 한글 · 워드 파일만 올릴 수 있습니다.');
  }
  if (file.size > STAFF_DOC_MAX_SIZE) {
    throw new Error('첨부자료는 1건당 20MB 까지 올릴 수 있습니다.');
  }

  const storageKey = generateStaffDocKey(file.name);
  await putStaffDocFile(storageKey, file);

  return {
    id: generateStaffDocId(),
    kind,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || getStaffDocExtension(file.name),
    storageKey,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy || undefined,
  };
};

/** 첨부파일 내려받기 (브라우저 다운로드) */
export const downloadStaffDoc = async (attachment: StaffAttachment): Promise<void> => {
  const blob = await getStaffDocFile(attachment.storageKey);
  if (!blob) throw new Error('첨부파일을 찾을 수 없습니다.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** 파일 크기 표시 (예: 1.2 MB) */
export const formatStaffDocSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** 'yyyy.mm.dd' 표시 */
export const formatStaffDocDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

/** 해당 관리자의 첨부자료 중 지정한 종류만 */
export const attachmentsOfKind = (
  attachments: StaffAttachment[] | undefined,
  kind: StaffDocKind,
): StaffAttachment[] => (attachments ?? []).filter(a => a.kind === kind);
