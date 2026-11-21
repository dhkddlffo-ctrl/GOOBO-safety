import { HqAck, HqAckSummary, HqAttachment, HqCategory, HqPost } from '../types';
import { HQ_CATEGORY_SEED, HQ_FALLBACK_CATEGORY } from '../data/hqCategories';

/**
 * 본사 게시판 저장소
 *
 * 현장 문서보관함(documentStorage)과 같은 방식으로 저장합니다.
 *  - 글 정보 · 첨부 정보 → LocalStorage  (목록 조회가 빠름)
 *  - 첨부 파일 본문(Blob) → IndexedDB    (수백 MB 가능)
 *
 * 현장 문서와는 **별도 키·별도 DB**를 써서 서로 섞이지 않게 했습니다.
 */

const POSTS_KEY = 'gubo_hq_posts';
const CATEGORIES_KEY = 'gubo_hq_categories';
const ACKS_KEY = 'gubo_hq_acks';
const FAVORITES_KEY = 'gubo_hq_favorites';
const RECENT_KEY = 'gubo_hq_recent';
const LAST_SEEN_KEY = 'gubo_hq_last_seen';

const HQ_CHANGED_EVENT = 'gubo:hq-changed';

const DB_NAME = 'gubo_hq_db';
const DB_VERSION = 1;
const FILE_STORE = 'files';

/** 첨부 허용 확장자 */
export const HQ_ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'hwp',
  'hwpx',
  'dwg',
  'dxf',
  'zip',
  'txt',
  'csv',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
];

/** 첨부 1건 최대 크기 (50MB) */
export const HQ_MAX_FILE_SIZE = 50 * 1024 * 1024;

/** input[type=file] accept 문자열 */
export const HQ_ACCEPT = HQ_ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',');

export const getHqExtension = (fileName: string): string =>
  fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

export const isHqAllowedFile = (fileName: string): boolean =>
  HQ_ALLOWED_EXTENSIONS.includes(getHqExtension(fileName));

/** 화면에서 바로 미리 볼 수 있는 형식 (이미지 · PDF) */
export const isHqPreviewable = (fileName: string): boolean =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(getHqExtension(fileName));

export const isHqImage = (fileName: string): boolean =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getHqExtension(fileName));

/** 확장자별 아이콘 · 색상 · 라벨 */
export const getHqFileMeta = (fileName: string): { icon: string; color: string; label: string } => {
  switch (getHqExtension(fileName)) {
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
      return { icon: '🗜️', color: '#f59e0b', label: 'ZIP' };
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return { icon: '🖼️', color: '#db2777', label: 'IMG' };
    case 'txt':
      return { icon: '📝', color: '#64748b', label: 'TXT' };
    default:
      return { icon: '📎', color: '#6b7280', label: 'FILE' };
  }
};

export const formatHqFileSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** 2026-11-21 형태 */
export const formatHqDate = (iso?: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 2026-11-21 14:05 형태 */
export const formatHqDateTime = (iso?: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatHqDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const notify = (): void => {
  window.dispatchEvent(new Event(HQ_CHANGED_EVENT));
};

export { HQ_CHANGED_EVENT };

/* ------------------------------------------------------------------ */
/* IndexedDB (첨부 파일 본문)                                           */
/* ------------------------------------------------------------------ */

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const putHqFile = async (key: string, blob: Blob): Promise<void> => {
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

export const getHqFile = async (key: string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const req = tx.objectStore(FILE_STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as Blob) || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
};

export const deleteHqFile = async (key: string): Promise<void> => {
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
/* 식별자                                                              */
/* ------------------------------------------------------------------ */

export const generateHqPostId = (): string =>
  `hq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const generateHqAttachmentId = (): string =>
  `hqa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const generateHqStorageKey = (fileName: string): string => {
  const ext = getHqExtension(fileName);
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return ext ? `hq/${base}.${ext}` : `hq/${base}`;
};

/* ------------------------------------------------------------------ */
/* 분류                                                                */
/* ------------------------------------------------------------------ */

const seedCategories = (): HqCategory[] =>
  HQ_CATEGORY_SEED.map(c => ({ ...c, createdAt: new Date().toISOString() }));

export const getHqCategories = (): HqCategory[] => {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  if (!raw) {
    const initial = seedCategories();
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = seedCategories();
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(initial));
      return initial;
    }
    return parsed as HqCategory[];
  } catch {
    return seedCategories();
  }
};

const persistCategories = (list: HqCategory[]): void => {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list));
  notify();
};

export const findHqCategory = (name: string): HqCategory | undefined =>
  getHqCategories().find(c => c.key === name);

export const resolveHqCategoryMeta = (name: string): HqCategory =>
  findHqCategory(name) || {
    key: name,
    icon: '📎',
    color: '#6b7280',
    desc: '분류 목록에 없는 자료',
  };

export interface HqCategoryResult {
  ok: boolean;
  error?: string;
  postCount?: number;
}

export const addHqCategory = (input: {
  key: string;
  icon?: string;
  color?: string;
  desc?: string;
}): HqCategoryResult => {
  const list = getHqCategories();
  const name = input.key.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: '분류명을 입력해주세요.' };
  if (name.length > 20) return { ok: false, error: '분류명은 20자 이내로 입력해주세요.' };
  if (list.some(c => c.key.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: '같은 이름의 분류가 이미 있습니다.' };
  }
  persistCategories([
    ...list,
    {
      key: name,
      icon: input.icon?.trim() || '📎',
      color: input.color || '#6b7280',
      desc: (input.desc || '').trim(),
      createdAt: new Date().toISOString(),
    },
  ]);
  return { ok: true };
};

export const updateHqCategory = (
  originalKey: string,
  patch: Partial<HqCategory>,
): HqCategoryResult => {
  const list = getHqCategories();
  const index = list.findIndex(c => c.key === originalKey);
  if (index === -1) return { ok: false, error: '분류를 찾을 수 없습니다.' };

  const nextName = patch.key !== undefined ? patch.key.trim().replace(/\s+/g, ' ') : originalKey;
  if (!nextName) return { ok: false, error: '분류명을 입력해주세요.' };
  if (list.some((c, i) => i !== index && c.key.toLowerCase() === nextName.toLowerCase())) {
    return { ok: false, error: '같은 이름의 분류가 이미 있습니다.' };
  }

  const next = [...list];
  next[index] = {
    ...list[index],
    ...patch,
    key: nextName,
    icon: patch.icon?.trim() || list[index].icon,
  };
  persistCategories(next);

  /* 분류명이 바뀌면 글의 분류도 함께 옮깁니다. */
  if (nextName !== originalKey) {
    const posts = readPosts();
    persistPosts(posts.map(p => (p.category === originalKey ? { ...p, category: nextName } : p)));
  }
  return { ok: true };
};

export const deleteHqCategory = (key: string, reassignTo?: string): HqCategoryResult => {
  const list = getHqCategories();
  if (list.length <= 1) return { ok: false, error: '최소 1개의 분류는 남겨두어야 합니다.' };
  if (!list.some(c => c.key === key)) return { ok: false, error: '분류를 찾을 수 없습니다.' };

  const posts = readPosts();
  const affected = posts.filter(p => p.category === key).length;

  if (affected > 0 && !reassignTo) {
    return {
      ok: false,
      postCount: affected,
      error: `이 분류의 글이 ${affected}건 있습니다. 이동할 분류를 선택해주세요.`,
    };
  }

  if (reassignTo) {
    if (reassignTo === key) return { ok: false, error: '다른 분류를 선택해주세요.' };
    persistPosts(posts.map(p => (p.category === key ? { ...p, category: reassignTo } : p)));
  }

  persistCategories(list.filter(c => c.key !== key));
  return { ok: true, postCount: affected };
};

/** 분류에 글이 없을 때만 삭제 (편의 함수) */
export const removeEmptyHqCategory = (key: string): HqCategoryResult => {
  const posts = readPosts().filter(p => p.category === key).length;
  if (posts > 0) {
    return {
      ok: false,
      postCount: posts,
      error: `이 분류의 글이 ${posts}건 있어 삭제할 수 없습니다.`,
    };
  }
  return deleteHqCategory(key, HQ_FALLBACK_CATEGORY === key ? undefined : HQ_FALLBACK_CATEGORY);
};

/* ------------------------------------------------------------------ */
/* 글 (LocalStorage)                                                    */
/* ------------------------------------------------------------------ */

const readPosts = (): HqPost[] => {
  const raw = localStorage.getItem(POSTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* 예전 저장본에 없을 수 있는 필드를 보정합니다. */
    return (parsed as HqPost[]).map(p => ({
      ...p,
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      status: p.status === 'archived' ? 'archived' : 'active',
      seriesId: p.seriesId || p.id,
      version: p.version || 'v1.0',
      views: typeof p.views === 'number' ? p.views : 0,
      tags: Array.isArray(p.tags) ? p.tags : [],
    }));
  } catch {
    return [];
  }
};

const persistPosts = (posts: HqPost[]): void => {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  notify();
};

/** 전체 글 (최신순) */
export const getHqPosts = (): HqPost[] =>
  readPosts().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

/** 최신본만 (게시판 목록에 보이는 글) */
export const getActiveHqPosts = (): HqPost[] => getHqPosts().filter(p => p.status !== 'archived');

/** 구본 포함 전체 */
export const getArchivedHqPosts = (): HqPost[] => getHqPosts().filter(p => p.status === 'archived');

export const getHqPost = (id: string): HqPost | undefined => readPosts().find(p => p.id === id);

/**
 * 같은 계열(seriesId)의 전체 이력 — 최신순.
 * 개정 이력 화면에서 사용합니다.
 */
export const getHqSeries = (seriesId: string): HqPost[] =>
  readPosts()
    .filter(p => p.seriesId === seriesId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

/**
 * 글 저장.
 * 새 버전을 올릴 때 `archiveOthers` 를 주면 같은 seriesId 의 다른 글을
 * 구본(status: 'archived')으로 내립니다.
 */
export const saveHqPost = (post: HqPost, archiveOthers = false): HqPost => {
  const posts = readPosts();
  const existing = posts.findIndex(p => p.id === post.id);
  const stamped: HqPost = {
    ...post,
    updatedAt: new Date().toISOString(),
  };

  if (existing === -1) {
    posts.unshift(stamped);
  } else {
    posts[existing] = stamped;
  }

  if (archiveOthers) {
    for (let i = 0; i < posts.length; i += 1) {
      const p = posts[i];
      if (p.id !== stamped.id && p.seriesId === stamped.seriesId) {
        posts[i] = { ...p, status: 'archived' };
      }
    }
  }

  persistPosts(posts);
  return stamped;
};

/** 글 삭제 (첨부 파일 본문도 함께 정리) */
export const deleteHqPost = async (id: string): Promise<void> => {
  const posts = readPosts();
  const target = posts.find(p => p.id === id);
  if (!target) return;

  await Promise.all(target.attachments.map(a => deleteHqFile(a.storageKey).catch(() => undefined)));

  persistPosts(posts.filter(p => p.id !== id));

  /* 확인 기록·즐겨찾기에서도 제거 */
  const acks = readAcks().filter(a => a.postId !== id);
  localStorage.setItem(ACKS_KEY, JSON.stringify(acks));
  const favs = readFavorites().filter(f => f !== id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
};

/** 조회수 +1 */
export const increaseHqViews = (id: string): void => {
  const posts = readPosts();
  const index = posts.findIndex(p => p.id === id);
  if (index === -1) return;
  posts[index] = { ...posts[index], views: (posts[index].views || 0) + 1 };
  persistPosts(posts);
};

/** 게시글 본문·첨부 정보만 갱신 */
export const updateHqPost = (id: string, patch: Partial<HqPost>): void => {
  const posts = readPosts();
  const index = posts.findIndex(p => p.id === id);
  if (index === -1) return;
  posts[index] = { ...posts[index], ...patch, updatedAt: new Date().toISOString() };
  persistPosts(posts);
};

/* ------------------------------------------------------------------ */
/* 첨부 파일                                                            */
/* ------------------------------------------------------------------ */

/** 업로드한 파일을 IndexedDB 에 저장하고 첨부 정보를 돌려줍니다. */
export const createHqAttachment = async (file: File): Promise<HqAttachment> => {
  if (!isHqAllowedFile(file.name)) {
    throw new Error('허용되지 않는 파일 형식입니다.');
  }
  if (file.size > HQ_MAX_FILE_SIZE) {
    throw new Error('첨부파일은 1건당 50MB 까지 올릴 수 있습니다.');
  }

  const storageKey = generateHqStorageKey(file.name);
  await putHqFile(storageKey, file);

  return {
    id: generateHqAttachmentId(),
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || getHqExtension(file.name),
    storageKey,
    uploadedAt: new Date().toISOString(),
  };
};

/** 첨부파일 내려받기 */
export const downloadHqAttachment = async (attachment: HqAttachment): Promise<void> => {
  const blob = await getHqFile(attachment.storageKey);
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

/* ------------------------------------------------------------------ */
/* 필독 확인                                                            */
/* ------------------------------------------------------------------ */

const readAcks = (): HqAck[] => {
  const raw = localStorage.getItem(ACKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HqAck[]) : [];
  } catch {
    return [];
  }
};

export const getHqAcks = (postId?: string): HqAck[] => {
  const all = readAcks();
  return postId ? all.filter(a => a.postId === postId) : all;
};

/** 이 현장이 해당 글을 확인했는지 */
export const isPostAckedBySite = (postId: string, siteId: number): boolean =>
  readAcks().some(a => a.postId === postId && a.siteId === siteId);

/** 필독 확인 기록 (같은 현장이 다시 눌러도 1건만 유지) */
export const acknowledgePost = (post: HqPost, siteId: number, siteName: string): HqAck => {
  const acks = readAcks();
  const existing = acks.find(a => a.postId === post.id && a.siteId === siteId);
  if (existing) return existing;

  const ack: HqAck = {
    id: `ack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    postId: post.id,
    siteId,
    siteName,
    ackedBy: siteName,
    ackedAt: new Date().toISOString(),
  };
  localStorage.setItem(ACKS_KEY, JSON.stringify([...acks, ack]));
  notify();
  return ack;
};

export const cancelAck = (postId: string, siteId: number): void => {
  const acks = readAcks().filter(a => !(a.postId === postId && a.siteId === siteId));
  localStorage.setItem(ACKS_KEY, JSON.stringify(acks));
  notify();
};

/** 필독 확인 현황 요약 */
export const summarizeAcks = (
  post: HqPost,
  sites: { id: number; name: string; status?: string }[],
): HqAckSummary => {
  const acks = getHqAcks(post.id);
  const activeSites = sites.filter(s => !s.status || s.status === 'active');
  const ackedIds = new Set(acks.map(a => a.siteId));
  const pendingSites = activeSites
    .filter(s => !ackedIds.has(s.id))
    .map(s => ({ id: s.id, name: s.name }));
  const ackedSites = activeSites.filter(s => ackedIds.has(s.id)).length;
  const total = activeSites.length;

  return {
    requireAck: Boolean(post.requireAck),
    totalSites: total,
    ackedSites,
    rate: total === 0 ? 0 : Math.round((ackedSites / total) * 100),
    acks,
    pendingSites,
  };
};

/** 미확인 필독 글 (현장 홈 배너용) */
export const getPendingAckPosts = (siteId: number): HqPost[] =>
  getActiveHqPosts().filter(p => p.requireAck && !isPostAckedBySite(p.id, siteId));

/* ------------------------------------------------------------------ */
/* 즐겨찾기 · 최근 본 자료                                              */
/* ------------------------------------------------------------------ */

const readFavorites = (): string[] => {
  const raw = localStorage.getItem(FAVORITES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export const getHqFavorites = (): string[] => readFavorites();

export const isHqFavorite = (id: string): boolean => readFavorites().includes(id);

export const toggleHqFavorite = (id: string): boolean => {
  const list = readFavorites();
  const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  notify();
  return next.includes(id);
};

const readRecent = (): string[] => {
  const raw = localStorage.getItem(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export const getRecentHqPosts = (limit = 5): HqPost[] => {
  const ids = readRecent().slice(0, limit);
  const posts = readPosts();
  return ids.map(id => posts.find(p => p.id === id)).filter((p): p is HqPost => Boolean(p));
};

export const pushRecentHqPost = (id: string): void => {
  const next = [id, ...readRecent().filter(x => x !== id)].slice(0, 20);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
};

/* ------------------------------------------------------------------ */
/* 새 글 배지                                                           */
/* ------------------------------------------------------------------ */

/** 마지막으로 게시판을 열어본 시각 */
export const getHqLastSeen = (): string => localStorage.getItem(LAST_SEEN_KEY) || '';

export const markHqSeen = (): void => {
  localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  notify();
};

/** 마지막 방문 이후 올라온 새 글 수 */
export const countNewHqPosts = (): number => {
  const lastSeen = getHqLastSeen();
  const posts = getActiveHqPosts();
  if (!lastSeen) return posts.length;
  return posts.filter(p => (p.createdAt || '') > lastSeen).length;
};

/* ------------------------------------------------------------------ */
/* 검색 · 정렬                                                          */
/* ------------------------------------------------------------------ */

export type HqSortKey = 'latest' | 'views' | 'version';

/** 정렬 선택지 라벨 */
export const HQ_SORT_LABELS: Record<HqSortKey, string> = {
  latest: '최신순',
  views: '조회순',
  version: '버전순',
};

export interface HqFilter {
  category?: string; // '전체' 이면 미지정
  keyword?: string;
  sort?: HqSortKey;
}

/** 게시판 목록 필터링 (고정 글은 항상 위) */
export const filterHqPosts = (posts: HqPost[], filter: HqFilter): HqPost[] => {
  const keyword = (filter.keyword || '').trim().toLowerCase();

  const filtered = posts.filter(p => {
    if (filter.category && filter.category !== '전체' && p.category !== filter.category)
      return false;
    if (!keyword) return true;
    const haystack = [
      p.title,
      p.body || '',
      p.category,
      p.subcategory || '',
      p.legalBasis || '',
      p.revisionSummary || '',
      ...(p.tags || []),
      ...p.attachments.map(a => a.fileName),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (filter.sort) {
      case 'views':
        return (b.views || 0) - (a.views || 0);
      case 'version':
        return (b.version || '').localeCompare(a.version || '', undefined, { numeric: true });
      default:
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    }
  });

  /* 고정 글이 먼저, 그 안에서는 기존 정렬 유지 */
  return [...sorted.filter(p => p.pinned), ...sorted.filter(p => !p.pinned)];
};

/* ------------------------------------------------------------------ */
/* 현장 문서보관함으로 보내기                                            */
/* ------------------------------------------------------------------ */

/**
 * 본사 양식을 현장 문서보관함으로 복사할 때 사용할 파일 목록을 돌려줍니다.
 * (실제 복사는 화면에서 documentStorage 로 수행)
 */
export const readHqAttachmentBlob = async (attachment: HqAttachment): Promise<Blob | null> =>
  getHqFile(attachment.storageKey);
