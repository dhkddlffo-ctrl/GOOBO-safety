import { CategoryMeta, CategorySub } from '../types';
import { CATEGORY_SEED } from '../data/documentCategories';
import {
  countDocumentsByCategory,
  countDocumentsBySubcategory,
  renameDocumentCategory,
  renameDocumentSubcategory,
  reassignDocumentSubcategory,
} from './documentStorage';

/**
 * 문서 분류 저장소 (동적 분류)
 *
 * - 관리자가 분류를 직접 추가 / 이름·아이콘·색상 수정 / 삭제
 * - 분류별 소분류(sub)를 추가·수정·삭제 (예: 교육일지 → 신규자교육, 정기안전교육 …)
 * - 분류명은 문서(SiteDocument.category)에 문자열로 저장되므로,
 *   이름 변경 시 기존 문서의 분류명도 함께 이관합니다.
 * - 변경 시 window 커스텀 이벤트로 모든 화면을 즉시 동기화합니다.
 */

const CATEGORIES_KEY = 'gubo_doc_categories';

export const CATEGORIES_CHANGED_EVENT = 'gubo:categories-changed';

/** 삭제·분류 미지정 시 문서를 옮겨 담을 기본 분류 */
export const FALLBACK_CATEGORY = '기타';

export const MAX_CATEGORY_NAME = 20;
export const MAX_CATEGORIES = 40;

export const MAX_SUBCATEGORY_NAME = 20;
export const MAX_SUBCATEGORIES = 30;

export const CATEGORY_COLOR_PRESETS = [
  '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0d9488',
  '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#db2777',
  '#78716c', '#6b7280',
];

export const CATEGORY_ICON_PRESETS = [
  '📕', '📘', '📗', '📙', '📄', '📋', '📊', '📈', '📐', '📜',
  '📎', '🗂️', '✅', '⚠️', '🎓', '💰', '🧾', '🔧', '🦺', '🏗️',
];

/* ------------------------------------------------------------------ */
/* 내부 유틸                                                           */
/* ------------------------------------------------------------------ */

const notify = (): void => {
  window.dispatchEvent(new Event(CATEGORIES_CHANGED_EVENT));
};

const persist = (categories: CategoryMeta[]): void => {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  notify();
};

const seed = (): CategoryMeta[] =>
  CATEGORY_SEED.map(c => ({ ...c, createdAt: new Date().toISOString() }));

const normalize = (name: string): string => name.trim().replace(/\s+/g, ' ');

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * 기존 저장 데이터 마이그레이션
 * - 소분류 기능이 추가되기 전에 저장된 분류에는 subs 필드가 없습니다(undefined).
 * - 시드에 소분류가 정의된 분류(예: 교육일지)에 한해 최초 1회 채워 넣습니다.
 * - 사용자가 소분류를 모두 지우면 subs 는 빈 배열([])이 되므로 다시 채워지지 않습니다.
 */
const migrateSubs = (categories: CategoryMeta[]): CategoryMeta[] => {
  const seedSubs = new Map(
    CATEGORY_SEED.filter(c => c.subs && c.subs.length > 0).map(c => [c.key, c.subs!])
  );

  let changed = false;
  const next = categories.map(cat => {
    if (cat.subs !== undefined) return cat;
    const defaults = seedSubs.get(cat.key);
    if (!defaults) return cat;
    changed = true;
    return { ...cat, subs: [...defaults] };
  });

  if (changed) localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next));
  return next;
};

/* ------------------------------------------------------------------ */
/* 조회                                                                */
/* ------------------------------------------------------------------ */

export const getCategories = (): CategoryMeta[] => {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  if (!raw) {
    const initial = seed();
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = seed();
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(initial));
      return initial;
    }
    return migrateSubs(parsed as CategoryMeta[]);
  } catch {
    return seed();
  }
};

export const getCategoryNames = (): string[] => getCategories().map(c => c.key);

export const findCategory = (name: string): CategoryMeta | undefined =>
  getCategories().find(c => c.key === name);

/** 분류 메타 조회 (목록에 없는 분류도 안전하게 표시) */
export const resolveCategoryMeta = (name: string): CategoryMeta =>
  findCategory(name) || {
    key: name,
    icon: '📎',
    color: '#6b7280',
    desc: '분류 목록에 없는 문서',
  };

/** 화면에 노출할 분류 목록 (목록 + 문서에만 존재하는 분류 병합) */
export const getCategoriesWithOrphans = (usedCategories: string[]): CategoryMeta[] => {
  const list = getCategories();
  const known = new Set(list.map(c => c.key));
  const orphans = Array.from(new Set(usedCategories))
    .filter(name => !known.has(name))
    .map<CategoryMeta>(name => ({
      key: name,
      icon: '📎',
      color: '#9ca3af',
      desc: '분류 목록에 없는 문서',
    }));
  return [...list, ...orphans];
};

/* ------------------------------------------------------------------ */
/* 추가 / 수정 / 삭제                                                   */
/* ------------------------------------------------------------------ */

export interface CategoryResult {
  ok: boolean;
  error?: string;
  docCount?: number;
}

export const addCategory = (input: {
  key: string;
  icon?: string;
  color?: string;
  desc?: string;
}): CategoryResult => {
  const categories = getCategories();

  if (categories.length >= MAX_CATEGORIES) {
    return { ok: false, error: `분류는 최대 ${MAX_CATEGORIES}개까지 만들 수 있습니다.` };
  }

  const name = normalize(input.key);
  if (!name) return { ok: false, error: '분류명을 입력해주세요.' };
  if (name.length > MAX_CATEGORY_NAME) {
    return { ok: false, error: `분류명은 ${MAX_CATEGORY_NAME}자 이내로 입력해주세요.` };
  }
  if (categories.some(c => sameName(c.key, name))) {
    return { ok: false, error: '같은 이름의 분류가 이미 있습니다.' };
  }

  persist([
    ...categories,
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

export const updateCategory = (originalKey: string, patch: Partial<CategoryMeta>): CategoryResult => {
  const categories = getCategories();
  const index = categories.findIndex(c => c.key === originalKey);
  if (index === -1) return { ok: false, error: '분류를 찾을 수 없습니다.' };

  const nextName = patch.key !== undefined ? normalize(patch.key) : originalKey;

  if (!nextName) return { ok: false, error: '분류명을 입력해주세요.' };
  if (nextName.length > MAX_CATEGORY_NAME) {
    return { ok: false, error: `분류명은 ${MAX_CATEGORY_NAME}자 이내로 입력해주세요.` };
  }
  if (categories.some((c, i) => i !== index && sameName(c.key, nextName))) {
    return { ok: false, error: '같은 이름의 분류가 이미 있습니다.' };
  }

  const renamed = nextName !== originalKey;

  const updated: CategoryMeta = {
    ...categories[index],
    ...patch,
    key: nextName,
    icon: patch.icon?.trim() || categories[index].icon,
  };

  const next = [...categories];
  next[index] = updated;
  persist(next);

  // 분류명이 바뀌면 기존 문서도 함께 이관
  if (renamed) {
    renameDocumentCategory(originalKey, nextName);
  }
  return { ok: true, docCount: renamed ? countDocumentsByCategory(nextName) : undefined };
};

export const deleteCategory = (key: string, reassignTo?: string): CategoryResult => {
  const categories = getCategories();
  if (categories.length <= 1) {
    return { ok: false, error: '최소 1개의 분류는 남겨두어야 합니다.' };
  }
  if (!categories.some(c => c.key === key)) {
    return { ok: false, error: '분류를 찾을 수 없습니다.' };
  }

  const docCount = countDocumentsByCategory(key);
  if (docCount > 0 && !reassignTo) {
    return {
      ok: false,
      docCount,
      error: `이 분류의 문서가 ${docCount}건 있습니다. 이동할 분류를 선택해주세요.`,
    };
  }

  if (reassignTo) {
    if (sameName(reassignTo, key)) {
      return { ok: false, error: '다른 분류를 선택해주세요.' };
    }
    if (!categories.some(c => c.key === reassignTo) && !sameName(reassignTo, FALLBACK_CATEGORY)) {
      return { ok: false, error: '이동할 분류를 찾을 수 없습니다.' };
    }
    renameDocumentCategory(key, reassignTo);
  }

  persist(categories.filter(c => c.key !== key));
  return { ok: true, docCount };
};

/** 순서 변경 (위/아래 이동) */
export const moveCategory = (key: string, direction: 'up' | 'down'): void => {
  const categories = getCategories();
  const index = categories.findIndex(c => c.key === key);
  if (index === -1) return;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= categories.length) return;

  const next = [...categories];
  [next[index], next[target]] = [next[target], next[index]];
  persist(next);
};

/** 기본 분류 목록으로 초기화 */
export const resetCategories = (): void => {
  persist(seed());
};

/* ------------------------------------------------------------------ */
/* 소분류 (sub) 추가 / 수정 / 삭제                                      */
/* ------------------------------------------------------------------ */

/** 특정 분류의 소분류 목록 */
export const getSubcategories = (category: string): CategorySub[] => {
  const found = findCategory(category);
  return Array.isArray(found?.subs) ? found!.subs! : [];
};

/** 소분류가 있는 분류인지 */
export const hasSubcategories = (category: string): boolean =>
  getSubcategories(category).length > 0;

/** 소분류 추가 */
export const addSubcategory = (category: string, name: string): CategoryResult => {
  const categories = getCategories();
  const index = categories.findIndex(c => c.key === category);
  if (index === -1) return { ok: false, error: '분류를 찾을 수 없습니다.' };

  const target = categories[index];
  const subs = Array.isArray(target.subs) ? target.subs : [];

  if (subs.length >= MAX_SUBCATEGORIES) {
    return { ok: false, error: `소분류는 최대 ${MAX_SUBCATEGORIES}개까지 만들 수 있습니다.` };
  }

  const value = normalize(name);
  if (!value) return { ok: false, error: '소분류명을 입력해주세요.' };
  if (value.length > MAX_SUBCATEGORY_NAME) {
    return {
      ok: false,
      error: `소분류명은 ${MAX_SUBCATEGORY_NAME}자 이내로 입력해주세요.`,
    };
  }
  if (subs.some(s => sameName(s, value))) {
    return { ok: false, error: '같은 이름의 소분류가 이미 있습니다.' };
  }

  const next = [...categories];
  next[index] = { ...target, subs: [...subs, value] };
  persist(next);
  return { ok: true };
};

/** 소분류 이름 변경 (기존 문서의 소분류도 함께 이관) */
export const updateSubcategory = (
  category: string,
  originalName: string,
  nextName: string
): CategoryResult => {
  const categories = getCategories();
  const index = categories.findIndex(c => c.key === category);
  if (index === -1) return { ok: false, error: '분류를 찾을 수 없습니다.' };

  const target = categories[index];
  const subs = Array.isArray(target.subs) ? target.subs : [];
  if (!subs.some(s => s === originalName)) {
    return { ok: false, error: '소분류를 찾을 수 없습니다.' };
  }

  const value = normalize(nextName);
  if (!value) return { ok: false, error: '소분류명을 입력해주세요.' };
  if (value.length > MAX_SUBCATEGORY_NAME) {
    return {
      ok: false,
      error: `소분류명은 ${MAX_SUBCATEGORY_NAME}자 이내로 입력해주세요.`,
    };
  }
  if (subs.some(s => s !== originalName && sameName(s, value))) {
    return { ok: false, error: '같은 이름의 소분류가 이미 있습니다.' };
  }
  if (value === originalName) return { ok: true };

  const next = [...categories];
  next[index] = {
    ...target,
    subs: subs.map(s => (s === originalName ? value : s)),
  };
  persist(next);
  renameDocumentSubcategory(category, originalName, value);
  return { ok: true };
};

/**
 * 소분류 삭제
 * - 해당 소분류를 쓰는 문서가 있으면 reassignTo 로 이동하거나(없으면 소분류 해제)
 * - reassignTo 를 지정하지 않으면 문서의 소분류를 비웁니다.
 */
export const deleteSubcategory = (
  category: string,
  name: string,
  reassignTo?: string
): CategoryResult => {
  const categories = getCategories();
  const index = categories.findIndex(c => c.key === category);
  if (index === -1) return { ok: false, error: '분류를 찾을 수 없습니다.' };

  const target = categories[index];
  const subs = Array.isArray(target.subs) ? target.subs : [];
  if (!subs.some(s => s === name)) {
    return { ok: false, error: '소분류를 찾을 수 없습니다.' };
  }

  if (reassignTo) {
    if (sameName(reassignTo, name)) {
      return { ok: false, error: '다른 소분류를 선택해주세요.' };
    }
    if (!subs.some(s => s === reassignTo)) {
      return { ok: false, error: '이동할 소분류를 찾을 수 없습니다.' };
    }
  }

  const docCount = countDocumentsBySubcategory(category, name);

  const next = [...categories];
  next[index] = { ...target, subs: subs.filter(s => s !== name) };
  persist(next);

  if (docCount > 0) {
    reassignDocumentSubcategory(category, name, reassignTo);
  }
  return { ok: true, docCount };
};

/** 소분류 순서 변경 */
export const moveSubcategory = (
  category: string,
  name: string,
  direction: 'up' | 'down'
): void => {
  const categories = getCategories();
  const index = categories.findIndex(c => c.key === category);
  if (index === -1) return;

  const target = categories[index];
  const subs = Array.isArray(target.subs) ? target.subs : [];
  const i = subs.indexOf(name);
  if (i === -1) return;

  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= subs.length) return;

  const nextSubs = [...subs];
  [nextSubs[i], nextSubs[j]] = [nextSubs[j], nextSubs[i]];

  const next = [...categories];
  next[index] = { ...target, subs: nextSubs };
  persist(next);
};

