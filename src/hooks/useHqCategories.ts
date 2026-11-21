import { useState, useEffect, useCallback } from 'react';
import { HqCategory } from '../types';
import { getHqCategories, HQ_CHANGED_EVENT } from '../utils/hqStorage';

/**
 * 본사 게시판 분류 목록 훅
 * - 분류가 추가/수정/삭제되면 커스텀 이벤트로 모든 화면이 즉시 갱신됩니다.
 * - 다른 탭에서 변경한 경우도 storage 이벤트로 동기화됩니다.
 */
export const useHqCategories = (): HqCategory[] => {
  const [categories, setCategories] = useState<HqCategory[]>(() => getHqCategories());

  const refresh = useCallback(() => {
    setCategories(getHqCategories());
  }, []);

  useEffect(() => {
    window.addEventListener(HQ_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(HQ_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  return categories;
};
