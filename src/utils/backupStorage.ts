/**
 * 전체 데이터 백업 / 복원
 *
 * 이 앱은 서버 없이 LocalStorage + IndexedDB 에만 데이터를 보관하므로
 * 브라우저 캐시 정리·시크릿 모드·PC 교체 시 모든 자료가 사라질 수 있습니다.
 * 이 모듈은 전체 데이터를 파일 하나(.json)로 내려받고 되돌리는 기능을 제공합니다.
 *
 * 저장 데이터는 '가공하지 않은 원본 문자열'로 담습니다.
 * → 앱 구조(스키마)가 바뀌어도 백업 파일은 그대로 유효하고,
 *   복원 시 손실 없이 원래 상태로 되돌릴 수 있습니다.
 *
 * 파일 본문(현장문서·비상연락망 약도)은 IndexedDB 에 있으므로
 * 옵션을 켜면 base64 로 함께 담습니다. (용량이 커질 수 있음)
 */

import { getAllFiles, putFile, getAllFileKeys, deleteFile } from './documentStorage';

/* ------------------------------------------------------------------ */
/* 백업 대상 정의                                                       */
/* ------------------------------------------------------------------ */

export const BACKUP_DATA_KEYS = [
  { key: 'gubo_sites', label: '현장 목록' },
  { key: 'gubo_completed_sites', label: '준공 현장' },
  { key: 'gubo_site_info', label: '현장 기본정보·안전인력' },
  { key: 'gubo_suggestions', label: '건의사항' },
  { key: 'gubo_work_stops', label: '작업중지권' },
  { key: 'gubo_accident_cases', label: '사고사례' },
  { key: 'gubo_site_documents', label: '현장문서 (목록)' },
  { key: 'gubo_doc_categories', label: '문서 분류' },
  { key: 'gubo_emergency_plans', label: '비상연락망' },
  { key: 'gubo_safety_policies', label: '현장소장 경영방침' },
  { key: 'gubo_org_charts', label: '안전조직도' },
] as const;

/** 복원 시 허용하는 키 목록 (그 외 키는 무시 → 임의 키 주입 방지) */
const ALLOWED_KEYS = new Set<string>(BACKUP_DATA_KEYS.map(d => d.key));

export const BACKUP_APP_ID = 'gubo-safety';
export const BACKUP_FORMAT_VERSION = 1;

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */

export interface BackupFileEntry {
  key: string;
  type: string;
  base64: string;
}

export interface BackupPayload {
  app: string;
  formatVersion: number;
  createdAt: string;
  includeFiles: boolean;
  /** LocalStorage 원본 문자열 (없는 키는 null) */
  data: Record<string, string | null>;
  files?: BackupFileEntry[];
}

export interface BackupSummary {
  createdAt: string;
  includeFiles: boolean;
  /** 데이터별 건수 (표시용) */
  counts: { label: string; count: number }[];
  fileCount: number;
  /** 파일 본문 총 바이트 */
  fileBytes: number;
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  /** 실제로 반영된 데이터 키 수 */
  appliedKeys: number;
  /** 복원한 파일 수 */
  restoredFiles: number;
  /** 병합 모드에서 건너뛴 항목 수 */
  skipped: number;
}

/* ------------------------------------------------------------------ */
/* base64 변환 (대용량 안전)                                            */
/* ------------------------------------------------------------------ */

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // "data:...;base64,XXXX" → XXXX
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (base64: string, type: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: type || 'application/octet-stream' });
};

/* ------------------------------------------------------------------ */
/* 내보내기                                                            */
/* ------------------------------------------------------------------ */

/** 현재 저장된 데이터로 백업 객체를 만듭니다. */
export const createBackup = async (includeFiles: boolean): Promise<BackupPayload> => {
  const data: Record<string, string | null> = {};
  BACKUP_DATA_KEYS.forEach(({ key }) => {
    data[key] = localStorage.getItem(key);
  });

  let files: BackupFileEntry[] | undefined;
  if (includeFiles) {
    const all = await getAllFiles();
    files = await Promise.all(
      all.map(async f => ({
        key: f.key,
        type: f.blob.type || 'application/octet-stream',
        base64: await blobToBase64(f.blob),
      })),
    );
  }

  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    includeFiles,
    data,
    ...(files ? { files } : {}),
  };
};

/** 백업 파일명: 구보공영_전체백업_2026-11-18_1430.json */
export const buildBackupFileName = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `구보공영_전체백업_${stamp}.json`;
};

/** 백업 객체를 파일로 내려받습니다. */
export const downloadBackup = async (includeFiles: boolean): Promise<BackupPayload> => {
  const payload = await createBackup(includeFiles);
  const text = JSON.stringify(payload);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = buildBackupFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 다운로드가 시작된 뒤 정리
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return payload;
};

/* ------------------------------------------------------------------ */
/* 검증 / 미리보기                                                      */
/* ------------------------------------------------------------------ */

const countRecords = (raw: string | null): number => {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
    return 1;
  } catch {
    return 0;
  }
};

/** 백업 객체의 요약 정보 */
export const summarizeBackup = (payload: BackupPayload): BackupSummary => {
  const counts = BACKUP_DATA_KEYS.map(({ key, label }) => ({
    label,
    count: countRecords(payload.data?.[key] ?? null),
  })).filter(c => c.count > 0);

  const files = payload.files ?? [];
  const fileBytes = files.reduce((sum, f) => sum + Math.floor((f.base64.length * 3) / 4), 0);

  return {
    createdAt: payload.createdAt,
    includeFiles: Boolean(payload.includeFiles),
    counts,
    fileCount: files.length,
    fileBytes,
  };
};

/** 백업 텍스트(JSON)를 검증하고 파싱합니다. 실패 시 한국어 오류 메시지를 던집니다. */
export const parseBackup = (text: string): { payload: BackupPayload; summary: BackupSummary } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다. JSON 형식이 올바르지 않습니다.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }

  const obj = parsed as Partial<BackupPayload>;

  if (obj.app !== BACKUP_APP_ID) {
    throw new Error('구보공영 안전관리 시스템의 백업 파일이 아닙니다.');
  }

  if (typeof obj.formatVersion !== 'number' || obj.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `지원하지 않는 백업 버전입니다. (파일 v${String(obj.formatVersion)}, 지원 v${BACKUP_FORMAT_VERSION})`,
    );
  }

  if (!obj.data || typeof obj.data !== 'object') {
    throw new Error('백업 파일에 데이터가 없습니다.');
  }

  const data: Record<string, string | null> = {};
  Object.entries(obj.data).forEach(([key, value]) => {
    // 허용된 키만 복원 대상으로 인정합니다.
    if (!ALLOWED_KEYS.has(key)) return;
    data[key] = typeof value === 'string' ? value : null;
  });

  const payload: BackupPayload = {
    app: BACKUP_APP_ID,
    formatVersion: obj.formatVersion,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    includeFiles: Boolean(obj.includeFiles),
    data,
    ...(Array.isArray(obj.files)
      ? {
          files: obj.files.filter(
            (f): f is BackupFileEntry =>
              Boolean(f) && typeof f.key === 'string' && typeof f.base64 === 'string',
          ),
        }
      : {}),
  };

  return { payload, summary: summarizeBackup(payload) };
};

/* ------------------------------------------------------------------ */
/* 복원                                                                */
/* ------------------------------------------------------------------ */

const mergeArray = (
  existingRaw: string | null,
  incomingRaw: string | null,
): {
  merged: string;
  skipped: number;
} => {
  const parse = (raw: string | null): unknown[] => {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  const existing = parse(existingRaw);
  const incoming = parse(incomingRaw);

  const idOf = (item: unknown): string | null => {
    if (item && typeof item === 'object' && 'id' in item) {
      const id = (item as { id: unknown }).id;
      return id === undefined || id === null ? null : String(id);
    }
    return null;
  };

  const seen = new Set(existing.map(idOf).filter((v): v is string => v !== null));
  let skipped = 0;
  const additions: unknown[] = [];

  incoming.forEach(item => {
    const id = idOf(item);
    if (id !== null && seen.has(id)) {
      skipped += 1;
      return;
    }
    if (id !== null) seen.add(id);
    additions.push(item);
  });

  return { merged: JSON.stringify([...existing, ...additions]), skipped };
};

/** 객체 형태(현장ID → 값) 맵을 병합합니다. 기존 값을 우선합니다. */
const mergeMap = (
  existingRaw: string | null,
  incomingRaw: string | null,
): {
  merged: string;
  skipped: number;
} => {
  const parse = (raw: string | null): Record<string, unknown> => {
    if (!raw) return {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const existing = parse(existingRaw);
  const incoming = parse(incomingRaw);
  let skipped = 0;

  Object.keys(incoming).forEach(k => {
    if (k in existing) {
      skipped += 1;
      return;
    }
    existing[k] = incoming[k];
  });

  return { merged: JSON.stringify(existing), skipped };
};

/**
 * 백업을 복원합니다.
 * - replace : 백업 시점 상태로 완전히 되돌립니다. (기존 데이터 삭제)
 * - merge   : 기존 데이터를 유지하고 백업에만 있는 항목을 추가합니다.
 *
 * 복원 후에는 화면 전체를 새로고침해야 모든 컴포넌트가 새 데이터를 읽습니다.
 */
export const applyBackup = async (
  payload: BackupPayload,
  mode: RestoreMode,
): Promise<RestoreResult> => {
  let appliedKeys = 0;
  let skipped = 0;

  BACKUP_DATA_KEYS.forEach(({ key }) => {
    const incoming = payload.data[key];
    if (incoming === undefined) return;

    if (mode === 'replace') {
      if (incoming === null) localStorage.removeItem(key);
      else localStorage.setItem(key, incoming);
      appliedKeys += 1;
      return;
    }

    // merge: 백업 값이 없으면 건드리지 않습니다.
    if (incoming === null) return;

    const existing = localStorage.getItem(key);
    if (existing === null) {
      localStorage.setItem(key, incoming);
      appliedKeys += 1;
      return;
    }

    let merged: string;
    try {
      const incomingParsed = JSON.parse(incoming);
      const existingParsed = JSON.parse(existing);
      const isArray = Array.isArray(incomingParsed) && Array.isArray(existingParsed);
      const isMap =
        !isArray &&
        incomingParsed &&
        existingParsed &&
        typeof incomingParsed === 'object' &&
        typeof existingParsed === 'object' &&
        !Array.isArray(incomingParsed) &&
        !Array.isArray(existingParsed);

      if (isArray) {
        const r = mergeArray(existing, incoming);
        merged = r.merged;
        skipped += r.skipped;
      } else if (isMap) {
        const r = mergeMap(existing, incoming);
        merged = r.merged;
        skipped += r.skipped;
      } else {
        // 형태를 판단할 수 없으면 기존 값을 유지합니다.
        skipped += 1;
        return;
      }
    } catch {
      skipped += 1;
      return;
    }

    localStorage.setItem(key, merged);
    appliedKeys += 1;
  });

  /* ---------- 파일 본문 ---------- */
  let restoredFiles = 0;
  const files = payload.files ?? [];

  if (mode === 'replace' && payload.includeFiles) {
    // 완전 복원: 백업에 없는 파일은 정리합니다.
    const keep = new Set(files.map(f => f.key));
    try {
      const existingKeys = await getAllFileKeys();
      await Promise.all(
        existingKeys.filter(k => !keep.has(k)).map(k => deleteFile(k).catch(() => undefined)),
      );
    } catch {
      /* 파일 정리에 실패해도 복원은 계속합니다. */
    }
  }

  for (const f of files) {
    try {
      await putFile(f.key, base64ToBlob(f.base64, f.type));
      restoredFiles += 1;
    } catch {
      /* 개별 파일 실패는 건너뜁니다. */
    }
  }

  return { appliedKeys, restoredFiles, skipped };
};

/* ------------------------------------------------------------------ */
/* 표시 유틸                                                            */
/* ------------------------------------------------------------------ */

export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

export const formatBackupDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
