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

// 피해자 결혼여부
export type MaritalStatus = '미혼' | '기혼' | '기타';

// 목격자 진술서 (회사 서식 FWP-006-3.01)
export interface WitnessStatement {
  id: string;
  /** 목격자 성명 */
  name: string;
  /** 목격자 연락처 */
  phone?: string;
  /** 목격자 직종 */
  jobType?: string;
  /** 피해자와의 관계 (동료, 반장 등) */
  relation?: string;
  /** 진술 내용 */
  statement: string;
  /** 진술 작성일 (yyyy-mm-dd) */
  statementDate?: string;
  /** '사실과 같음' 확인 여부 */
  confirmed?: boolean;
  /* ---- 서식 FWP-006-3.01 본인사항 ---- */
  /** 본적 */
  permanentAddress?: string;
  /** 주소 */
  address?: string;
  /** 주민등록번호 */
  residentId?: string;
  /** 소속 (예: 구보공영) */
  affiliation?: string;
  /* ---- 서식 FWP-006-3.01 작업사항 ---- */
  /** 사고자가 하던 일 */
  victimTask?: string;
  /** 목격자가 하던 일 */
  witnessTask?: string;
  /** 같이 일하던 사람 */
  coworker?: string;
}

// 사고사례 타입
export interface AccidentCase {
  id: string;
  siteId: number;
  siteName: string;
  accidentDate: string; // 사고 발생 일시
  accidentType:
    | '추락'
    | '낙하비래'
    | '전도'
    | '협착'
    | '전기감전'
    | '화재폭발'
    | '끼임'
    | '부딪힘'
    | '넘어짐'
    | '질병'
    | '기타';
  severity: '경상' | '중상' | '사망' | '무재해';
  location: string; // 사고 발생 장소
  victimName?: string; // 피해자 성명 (선택)
  victimAge?: number; // 피해자 나이
  victimHireDate?: string; // 피해자 입사일 (yyyy-mm-dd, 선택)
  /* ---- 피해자 상세 정보 ---- */
  victimJobType?: string; // 직종
  victimBirthDate?: string; // 생년월일 (yyyy-mm-dd)
  victimRank?: string; // 직급 (예: 배관공, 반장)
  victimMaritalStatus?: MaritalStatus; // 결혼여부
  victimFamily?: string; // 가족관계
  victimPhone?: string; // 연락처
  /* ---- 사고원인 및 대책 보고서 (서식 FWP-006) ---- */
  actionTaken?: string; // 조치 사항
  relatedNotes?: string; // 관련원부 — 안전관리팀장 현장방문 확인내용
  relatedEtc?: string; // 관련원부 — 기타
  safetyManagerName?: string; // 안전관리자
  siteManagerName?: string; // 현장소장대리인
  /* ---- 재해(사고) 상황 ---- */
  disasterDate?: string; // 재해 발생일 (yyyy-mm-dd)
  disasterPlace?: string; // 재해 발생 장소
  situationDiagram?: string; // 재해 상황도 (PNG data URL)
  situationNote?: string; // 상황도 설명
  witnesses?: WitnessStatement[]; // 목격자 진술서
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

/* ------------------------------------------------------------------ */
/* 위험성평가 (서식 SCM-002-1.01 위험성평가표 / 등록부)                  */
/* ------------------------------------------------------------------ */

/**
 * 강도 · 빈도 점수. 양식 기준으로 1(하) 또는 2(상)만 사용합니다.
 * (등급표: 가) 강도/빈도 1(하) 2(상))
 */
export type RiskScore = 1 | 2;

/**
 * 평가 등급.
 * ⚠️ 양식의 '평가합계'는 강도 × 빈도 가 아니라 **강도 + 빈도** 입니다.
 *    합계 2~3 → 하(일상관리), 합계 4 → 상(중점관리)
 */
export type RiskGrade = '하' | '상';

/** 위험요인 1행 */
export interface RiskRow {
  id: string;
  workPeriod: string; // 작업 기간
  workLocation: string; // 작업 위치
  hazardFinder: string; // 위험요인 도출자
  hazard: string; // 위험요인(Hazard) — 근본적인 원인 도출
  accidentType: string; // 재해 형태 (까임, 끼임, 추락 …)
  intensity: RiskScore | 0; // 강도 (0 = 미선택)
  frequency: RiskScore | 0; // 빈도 (0 = 미선택)
  manageRegistered: 'O' | 'X' | ''; // 관리 등록 여부
  improvementPlan: string; // 개선조치계획
  actionDueDate: string; // 조치예정일 (yyyy-mm-dd)
  actionDoneDate: string; // 조치완료일 (yyyy-mm-dd)
  inspector: string; // 점검 담당자
  /**
   * 이 행에서 사용자가 직접 고친 조치/점검 항목 목록.
   * 여기에 들어 있는 항목은 '아래 행에 함께 적용'에서 제외됩니다.
   * (위에서 값을 내려받기만 한 행은 기록되지 않으므로 계속 따라갑니다)
   */
  actionEdited?: ('actionDueDate' | 'actionDoneDate' | 'inspector')[];
}

/** 위험성평가표 / 등록부 1건 */
export interface RiskAssessment {
  id: string;
  siteId: number;
  siteName: string;
  constructionName: string; // 공사명 (표 상단)
  author: string; // 작성자(팀장/반장)
  writtenAt: string; // 작성일 (yyyy-mm-dd)
  rows: RiskRow[]; // 기본 5행 (1장) — 화면에서 행 추가·삭제 가능, 5행 초과 시 2장부터 6행씩
  extraHazards: string; // 추가위험요인 (필요시/소장)
  monitoringNote: string; // 모니터링 실천통보 (조치내용/요약, 결과)
  note: string; // 비고
  /**
   * 조치/점검 값을 아래 행에 함께 적용할지 여부.
   * 한 행에서 점검일·점검자를 지정하면 그 아래 행들도 같은 값으로 채워집니다.
   * (개별 행은 이후에 따로 수정할 수 있습니다)
   * 저장된 예전 자료에는 이 값이 없으므로 undefined = 적용(켜짐) 으로 봅니다.
   */
  actionCascade?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 위험성평가 부속 서식 첨부 (양식 10~13페이지 등)
 *
 * 10~13페이지(일일 재해 有/無 확인현황)는 인원별 일일 대장이라
 * 화면에서 직접 입력받지 않고, 작성한 파일을 그대로 올려 보관합니다.
 * 파일 본문은 IndexedDB(documentStorage)에, 정보는 LocalStorage에 저장합니다.
 */
export interface RiskAttachment {
  id: string;
  siteId: number;
  siteName: string;
  title: string; // 문서명 (예: 2026년 11월 일일 재해 유무 확인현황)
  period: string; // 해당 연월 (예: 2026-11)
  fileName: string;
  fileSize: number; // bytes
  fileType: string; // MIME type
  storageKey: string; // IndexedDB 파일 키
  uploadedBy: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* 위험성평가 상등급 관리 (양식 5페이지 / A4 가로)                       */
/* ------------------------------------------------------------------ */

/**
 * 상등급(중점관리) 위험요인 1행.
 *
 * 등록부(SCM-002-1.01)에서 평가등급이 '상'으로 나온 항목을 모아
 * 실제 개선조치의 이행 여부를 확인·관리하는 표입니다.
 * 양식 5페이지 구성: 작업기간 / 작업위치 / 위험요인 도출자 /
 *                   위험요인(Hazard) / 개선조치계획 / 실천·완료 / 확인자
 */
export interface HighGradeRow {
  id: string;
  workPeriod: string; // 작업 기간
  workLocation: string; // 작업 위치
  hazardFinder: string; // 위험요인 도출자
  hazard: string; // 위험요인(Hazard)
  improvementPlan: string; // 개선조치계획
  /** 실천/완료 — 조치 실행 내용과 완료 여부 */
  actionResult: string;
  /** 실천/완료 확인자 */
  confirmer: string;
}

/** 상등급 관리 시트 1건 (현장별 작성일 단위) */
export interface HighGradeRecord {
  id: string;
  siteId: number;
  siteName: string;
  writtenAt: string; // 작성일 (yyyy-mm-dd)
  rows: HighGradeRow[];
  note: string; // 비고
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 위험성평가 보고서 묶음 — 등록부 1건에 딸린 부속 서식                   */
/* ------------------------------------------------------------------ */

/**
 * 회의록 결재란 (작성 / 검토 / 승인).
 * 양식 6페이지 상단 우측 결재 칸에 해당합니다.
 */
export interface ApprovalLine {
  writer: string; // 작성
  reviewer: string; // 검토
  approver: string; // 승인
}

/** 안전 회의록 참석자 1명 (직위 / 성명 / 서명) */
export interface MeetingAttendee {
  id: string;
  position: string; // 직위
  name: string; // 성명
  signature: string; // 서명
}

/**
 * 안전 회의록 (양식 SCM-02-2.00 / 6페이지, A4 세로)
 *
 * 회의 내용은 자유 기술란이므로 textarea 한 칸으로 받습니다.
 */
export interface MeetingMinutes {
  title: string; // 제목
  docNo: string; // 우선번호
  meetingAt: string; // 회의일시
  place: string; // 회의장소
  approval: ApprovalLine;
  attendees: MeetingAttendee[]; // 12칸 (2열 × 6행)
  content: string; // 회의 내용
  remark: string; // 별첨
}

/** 위험성평가 참석자 명단 1명 (7페이지) */
export interface AttendeeListEntry {
  id: string;
  company: string; // 업체명
  jobType: string; // 직종
  name: string; // 성명
  signature: string; // 서명
}

/**
 * 위험성평가 참석자 명단 (양식 7페이지, A4 세로)
 * 양식은 40칸(2열 × 20행) 고정입니다.
 */
export interface AttendeeList {
  year: string;
  month: string;
  day: string;
  entries: AttendeeListEntry[];
}

/** 사진대지 사진 1장. 본문(Blob)은 IndexedDB, 정보만 여기에 저장합니다. */
export interface PhotoSheetItem {
  id: string;
  date: string; // 일자
  location: string; // 위치
  caption: string; // 사진설명
  description: string; // 안전시설 점검내용 (모니터링 사진대지)
  storageKey: string; // IndexedDB 파일 키
  fileName: string;
}

/**
 * 사진대지 (양식 3·4페이지)
 *  - meeting   : [KOSAH-MS 관련 위험성평가 회의]  (3페이지, A4 세로)
 *  - monitoring: 모니터링 안전점검 사진대지        (4페이지, A4 가로)
 */
export interface PhotoSheet {
  title: string;
  kind: 'meeting' | 'monitoring';
  constructionName: string; // 공사명 / 현장명
  items: PhotoSheetItem[];
}

/**
 * ( ) 월 안전보건 일정 (양식 SCM-005-2.00 / 9페이지, A4 가로)
 * 일자별로 적는 내용은 notes['YYYY-MM-DD'] 에 보관합니다.
 */
export interface SafetySchedule {
  year: string;
  month: string;
  approval: {
    writer: string; // 작성
    review1: string; // 검토
    review2: string;
    review3: string;
    approver: string; // 승인
  };
  notes: Record<string, string>;
}

/**
 * 등록부 1건에 딸린 부속 서식 묶음.
 * '한곳에서 순서대로 작성'하는 마법사의 저장 단위입니다.
 */
export interface ReportBundle {
  assessmentId: string;
  siteId: number;
  siteName: string;
  meeting: MeetingMinutes;
  attendees: AttendeeList;
  /** 사진대지 2장 — [0] 회의(3페이지), [1] 모니터링 안전점검(4페이지) */
  photoSheets: PhotoSheet[];
  schedule: SafetySchedule;
  /** 게시글 등록 시각 (없으면 미등록) */
  registeredAt?: string;
  updatedAt: string;
}
