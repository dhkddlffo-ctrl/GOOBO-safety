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

// 문서 분류의 소분류 (예: 교육일지 → 신규자교육 / 정기안전교육(근로자) …)
export type CategorySub = string;

// 문서 분류 정의
export interface CategoryMeta {
  key: string; // 분류명 (문서에 저장되는 값)
  icon: string; // 아이콘 (이모지)
  color: string; // 대표 색상
  desc: string; // 설명
  /** 소분류 목록 (없으면 undefined, 소분류를 모두 지우면 빈 배열) */
  subs?: CategorySub[];
  createdAt?: string;
}

export interface SiteDocument {
  id: string;
  siteId: number;
  siteName: string;
  title: string;
  category: DocumentCategory;
  /** 소분류 (해당 분류에 소분류가 없으면 undefined) */
  subcategory?: CategorySub;
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
  address: string; // 소재지
  constructionType: string; // 공사분류 (예: 공동주택 신축)
  scale: string; // 규모 (예: 지하 3층 ~ 지상 25층, 3개동)
  contractPeriod: string; // 공사기간 (예: 2024-03 ~ 2027-02)
  contractAmount: string; // 계약금액 (예: 1,250억원)
  startDate: string; // 착공일 (계약상)
  actualStartDate: string; // 실제착공일
  clientName: string; // 발주처
  developerName: string; // 시행사
  contractorName: string; // 시공사
  siteManager: string; // 현장소장
  siteOfficer: string; // 현장공무
  siteAddress: string; // 현장주소
  officePhone: string; // 현장 사무실 연락처
  safetyManagerPhone: string; // 안전관리자 연락처
  workerCount: number; // 현재 인원
  staff: SiteStaff[]; // 관리자(안전인력) 목록
  notes: string; // 비고
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 관리자(안전인력)                                                     */
/* ------------------------------------------------------------------ */

export type StaffRole = '현장소장' | '안전보건관리책임자' | '안전관리자' | '관리감독자';

export const STAFF_ROLES: StaffRole[] = [
  '현장소장',
  '안전보건관리책임자',
  '안전관리자',
  '관리감독자',
];

export interface SiteStaff {
  id: string;
  role: StaffRole;
  name: string; // 성명
  phone?: string; // 연락처
  appointedAt?: string; // 선임일 (관리감독자는 지정일)
  dismissedAt?: string; // 해임일
  trainingDate?: string; // 직무교육 이수일
  newTraining8h?: boolean; // 관리감독자 신규교육(8시간) 이수 여부
  note?: string; // 비고
}

// ---------------- 비상연락망 (게시판 부착용) ----------------

/** 현장 내부 비상연락망 구분 */
export type EmergencyGroup = '원청(현장)' | '본사' | '협력사';
export const EMERGENCY_GROUPS: EmergencyGroup[] = ['원청(현장)', '본사', '협력사'];

/** 현장 내부 비상연락망 1행 */
export interface EmergencyContact {
  id: string;
  group: EmergencyGroup; // 구분
  role: string; // 직책 / 담당업무
  name: string; // 성명
  phone: string; // 연락처 (휴대전화)
  duty: string; // 비상시 주요 임무
}

/** 외부 유관기관 1행 */
export interface ExternalAgency {
  id: string;
  category: string; // 구분 (긴급구조 / 치안·교통 / 노동·안전 …)
  name: string; // 기관명
  phone: string; // 전화번호
  note: string; // 관할 / 비고
  /** 주소 기반 자동 입력 여부 */
  autoFilled?: boolean;
  /** 담당자가 번호를 확인했는지 */
  verified?: boolean;
}

/** 지정병원 1행 */
export interface DesignatedHospital {
  id: string;
  category: string; // 구분 (중증·야간 / 경상·주간)
  name: string; // 병원명
  erPhone: string; // 응급실 직통번호
  address: string; // 도로명 주소
  distance: string; // 거리 / 소요시간
  /** 주소 기반 자동 입력 여부 */
  autoFilled?: boolean;
  /** 담당자가 직통번호를 확인했는지 */
  verified?: boolean;
}

/** 현장별 비상연락망 게시판 */
export interface EmergencyPlan {
  siteId: number;
  siteName: string;
  constructionName: string; // 공사명
  siteAddress: string; // 현장 주소 (도로명 + 출입구 위치)
  author: string; // 작성자 (예: 안전관리자 홍길동)
  entryPoint: string; // 유도자 배치 출입구 (예: 현장 정문)
  /** 지정병원 약도 이미지 (IndexedDB 키) */
  mapImageKey?: string;
  contacts: EmergencyContact[];
  agencies: ExternalAgency[];
  hospitals: DesignatedHospital[];
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 안전 조직도 (현장별)                                                  */
/* ------------------------------------------------------------------ */

/**
 * 조직도 구성원 1인.
 * `position` 은 직급·구분(대표/부사장/소장/차장/공사…)이고,
 * 소속 부서·직책은 상위 `OrgUnit.title` 에 들어갑니다.
 */
export interface OrgMember {
  id: string;
  position: string; // 직급·구분 (예: 대표, 부사장, 소장, 차장, 공사)
  name: string; // 성명
  phone: string; // 연락처
  duties: string[]; // 담당업무 항목
}

/** 조직도 1개 상자 (부서·직책 단위) */
export interface OrgUnit {
  id: string;
  title: string; // 직책·부서 (예: 대표이사, 본사 안전팀, 관리감독자)
  /** 단(段) 안에서의 가로 칸 위치 (0부터). 미지정 시 배열 순서를 사용합니다. */
  col?: number;
  /** true 이면 항상 단의 가운데 칸에 고정됩니다 (이동 불가). */
  pinCenter?: boolean;
  members: OrgMember[];
}

/** 조직도 세로 단(段) — 위에서 아래로 이어지는 한 줄 */
export interface OrgTier {
  id: string;
  /** 가로 정렬: 가운데 / 양끝 / 오른쪽 (구버전 호환용, 현재는 col 로 위치 지정) */
  align: 'center' | 'between' | 'end';
  /** 단의 가로 칸 수. 미지정 시 상자 개수로 계산합니다. */
  cols?: number;
  units: OrgUnit[];
}

/** 현장별 안전 조직도 + 업무분장 */
export interface SiteOrgChart {
  siteId: number;
  siteName: string;
  constructionName: string; // 공사명
  author: string; // 작성자
  tiers: OrgTier[];
  note: string; // 비고 (개정 이력 등)
  updatedAt: string;
  /** 기본 서식 버전. 구버전 데이터는 읽을 때 새 구조로 자동 이전됩니다. */
  layoutVersion?: number;
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
  victimHireDate?: string; // 피해자 입사일 (yyyy-mm-dd, 선택)
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
