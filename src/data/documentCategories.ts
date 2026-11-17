import { DocumentCategory } from '../types';

export interface CategoryMeta {
  key: DocumentCategory;
  icon: string;
  color: string;
  desc: string;
}

/**
 * 현장 문서 분류 정의 (단일 출처)
 * - 현장별 문서보관함의 카테고리 카드, 업로드 폼, 필터가 모두 이 정의를 사용합니다.
 */
export const CATEGORY_META: CategoryMeta[] = [
  {
    key: '안전보건관리대장',
    icon: '📕',
    color: '#dc2626',
    desc: '현장 안전보건 업무 총괄 기록',
  },
  {
    key: '안전계획서',
    icon: '📘',
    color: '#2563eb',
    desc: '안전보건관리계획서 및 변경본',
  },
  {
    key: '안전관리비',
    icon: '💰',
    color: '#16a34a',
    desc: '안전관리비 집행계획·사용내역',
  },
  {
    key: '교육일지',
    icon: '🎓',
    color: '#7c3aed',
    desc: '정기·신규·특별안전교육 기록',
  },
  {
    key: '안전점검표',
    icon: '✅',
    color: '#0891b2',
    desc: '일일·주간·월간 안전점검 결과',
  },
  {
    key: '위험성평가',
    icon: '⚠️',
    color: '#ea580c',
    desc: '유해·위험요인 평가서',
  },
  {
    key: '도면',
    icon: '📐',
    color: '#4f46e5',
    desc: '시공도면, 구조도면, 상세도',
  },
  {
    key: '계약서',
    icon: '📜',
    color: '#78716c',
    desc: '도급·하도급 계약 관련 서류',
  },
  {
    key: '시공보고서',
    icon: '📊',
    color: '#0d9488',
    desc: '공정·품질·시공 보고서',
  },
  {
    key: '사진대지',
    icon: '🖼️',
    color: '#db2777',
    desc: '현장 사진 및 사진대지',
  },
  {
    key: '기타',
    icon: '📎',
    color: '#6b7280',
    desc: '그 외 현장 문서',
  },
];

export const CATEGORY_KEYS: DocumentCategory[] = CATEGORY_META.map(c => c.key);

export const getCategoryMeta = (key: DocumentCategory): CategoryMeta =>
  CATEGORY_META.find(c => c.key === key) || {
    key,
    icon: '📎',
    color: '#6b7280',
    desc: '',
  };
