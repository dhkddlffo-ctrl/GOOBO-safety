import { HqCategory } from '../types';

/**
 * 본사 게시판 기본 분류 시드
 *
 * 현장 문서보관함(현장이 쌓는 기록물)과 달리 본사 게시판은
 * 본사가 현장으로 **배포하는** 지침·양식을 담습니다.
 *
 * 실제 목록은 src/utils/hqStorage.ts 의 getHqCategories() 가 관리하며,
 * 관리자가 자유롭게 추가·수정·삭제할 수 있습니다.
 */
export const HQ_CATEGORY_SEED: HqCategory[] = [
  { key: '공지사항', icon: '📢', color: '#dc2626', desc: '본사 공지 · 시행 안내' },
  { key: '안전보건경영매뉴얼', icon: '📕', color: '#1d4ed8', desc: '방침서 · 매뉴얼 · 절차서' },
  { key: '양식', icon: '📋', color: '#0891b2', desc: '위험성평가표 · 점검표 · 교육일지' },
  { key: '법령·고시', icon: '⚖️', color: '#7c3aed', desc: '산업안전보건법 · KOSHA 지침' },
  { key: '교육자료', icon: '🎓', color: '#16a34a', desc: '교육 교안 · OJT 자료' },
  { key: '기술자료', icon: '🔧', color: '#ea580c', desc: '가설재 · 장비 표준도' },
  { key: '기타', icon: '📎', color: '#6b7280', desc: '그 외 본사 배포 자료' },
];

/** 분류를 찾지 못했을 때 문서를 옮겨 담을 기본 분류 */
export const HQ_FALLBACK_CATEGORY = '기타';

/** 화면에 노출하는 기본 분류명 (관리자 선택 UI에서 사용) */
export const DEFAULT_HQ_CATEGORY = HQ_CATEGORY_SEED[0].key;
