// 현장 정보 타입
export interface Site {
  id: number;
  name: string;
  location: string;
  status: 'active' | 'inactive' | 'completed';
  completedAt?: string;
}

// 건의사항 타입
export interface Suggestion {
  id: string;
  siteId: number;
  siteName: string;
  workerName: string;
  phone: string;
  category: '안전' | '환경' | '작업조건' | '기타';
  title: string;
  content: string;
  images?: string[];
  status: '접수' | '검토중' | '완료' | '반려';
  createdAt: string;
  response?: string;
  respondedAt?: string;
  responseImages?: string[];
}

// 작업중지권 타입
export interface WorkStopRequest {
  id: string;
  siteId: number;
  siteName: string;
  workerName: string;
  phone: string;
  location: string;
  dangerType: '추락' | '낙하비래' | '전도' | '협착' | '전기' | '화재폭발' | '기타';
  description: string;
  images?: string[];
  status: '요청' | '승인' | '작업재개' | '반려';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  resumedAt?: string;
  remarks?: string;
  resumeImages?: string[];
}

// 현장문서 타입
// 분류는 관리자가 직접 추가·수정·삭제할 수 있으므로 동적 문자열입니다.
// (기본 분류 목록은 src/data/documentCategories.ts 의 시드 참고)
export type DocumentCategory = string;

// 문서 분류 정의
export interface CategoryMeta {
  key: string; // 분류명 (문서에 저장되는 값)
  icon: string; // 아이콘 (이모지)
  color: string; // 대표 색상
  desc: string; // 설명
  createdAt?: string;
}

export interface SiteDocument {
  id: string;
  siteId: number;
  siteName: string;
  title: string;
  category: DocumentCategory;
  period?: string; // 해당 연월/기간 (예: 2026-11, 2026년 1분기)
  fileName: string;
  fileSize: number; // bytes
  fileType: string; // MIME type
  version: string; // 예: v1.0
  uploadedBy: string;
  description?: string;
  storageKey: string; // IndexedDB 파일 키 (추후 R2 오브젝트 키로 교체 가능)
  createdAt: string;
}

// 현장 기본정보 타입
export interface SiteInfo {
  siteId: number;
  siteName: string;
  address: string; // 현장 주소
  constructionType: string; // 공사 종류 (예: 공동주택 신축)
  scale: string; // 규모 (예: 지하 3층 ~ 지상 25층, 3개동)
  contractPeriod: string; // 도급 기간 (예: 2024-03 ~ 2027-02)
  contractAmount: string; // 도급 금액 (예: 1,250억원)
  progressRate: number; // 공정률 (%)
  clientName: string; // 발주처
  contractorName: string; // 시공사
  siteManager: string; // 현장소장
  safetyManager: string; // 안전관리자
  safetyManagerPhone: string; // 안전관리자 연락처
  officePhone: string; // 현장 사무실
  workerCount: number; // 현재 인원
  notes: string; // 비고
  updatedAt: string;
}

// 사고사례 타입
export interface AccidentCase {
  id: string;
  siteId: number;
  siteName: string;
  accidentDate: string; // 사고 발생 일시
  accidentType: '추락' | '낙하비래' | '전도' | '협착' | '전기감전' | '화재폭발' | '끼임' | '부딪힘' | '넘어짐' | '질병' | '기타';
  severity: '경상' | '중상' | '사망' | '무재해';
  location: string; // 사고 발생 장소
  victimName?: string; // 피해자 성명 (선택)
  victimAge?: number; // 피해자 나이
  description: string; // 사고 경위
  cause: string; // 사고 원인
  preventiveMeasures: string; // 재발 방지 대책
  images?: string[]; // 사고 현장 사진
  status: '접수' | '조사중' | '완료';
  createdAt: string;
  reporterName: string; // 보고자
  reporterPhone: string;
  completedAt?: string;
  investigationResult?: string; // 조사 결과
  investigationImages?: string[];
  // 새로 추가되는 필드
  disasterReportSubmitted?: '제출' | '미제출'; // 사업재해조사표 제출 여부
  treatmentResult?: '공상' | '산재' | '질병성' | '미처리'; // 사고 처리결과
}
