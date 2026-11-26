/**
 * 업무상 질병 사례 — 「보험가입자 의견서」(근로복지공단 별지 제4호의2) 유틸
 *
 * 사고사례 게시판은 사고(업무상 사고)와 질병(업무상 질병)을 함께 보관합니다.
 * 질병 사례의 작성·출력에 필요한 기본값과 선택지, 표기 변환을 이 파일에 모읍니다.
 */

import {
  AccidentCase,
  AccidentCaseKind,
  DiseaseOpinion,
  DiseaseOpinionAppendix,
  DiseaseOpinionClause,
} from '../types';
import { parseYmd } from './accidentReport';
import { generateId } from './storage';

/** 서식 명칭 (별지 제4호의2) */
export const DISEASE_FORM_TITLE = '보험가입자 의견서';
export const DISEASE_FORM_NO = '별지 제4호의2';

/** 사고사례의 작성 유형 (예전 자료는 값이 없으므로 '사고') */
export const getCaseKind = (accident: Pick<AccidentCase, 'kind'>): AccidentCaseKind =>
  accident.kind === '질병' ? '질병' : '사고';

/** 업무상 질병 사례인지 */
export const isDiseaseCase = (accident: Pick<AccidentCase, 'kind'>): boolean =>
  getCaseKind(accident) === '질병';

/* ------------------------------------------------------------------ */
/* 선택지                                                              */
/* ------------------------------------------------------------------ */

export const EMPLOYMENT_STATUSES = ['상용', '임시', '일용'] as const;
export const EMPLOYMENT_TYPES = ['정규직', '비정규직'] as const;
export const OWNER_STATUSES = ['해당없음', '실제사업주(동업자포함)', '하수급사업주'] as const;

export const RELATIVE_STATUSES = [
  '해당 없음',
  '배우자',
  '부모',
  '자녀',
  '형제자매',
  '기타 친인척',
] as const;

/** 근로자 유형 — 서식의 체크 항목 그대로 */
export const WORKER_TYPES = [
  '근로자',
  '노무제공자',
  '중소기업사업주',
  '중소기업사업주 가족종사자',
  '학생연구자',
  '건강손상자녀',
  '특수형태근로종사자',
  '현장실습생',
] as const;

export const ACKNOWLEDGE_OPTIONS = ['예', '아니오', '기타'] as const;

/** 「3. 업무상 질병판정위원회 심의대상에 대한 진행사항 등 안내」 개인정보 표 */
export const PRIVACY_NOTICE_ROWS = [
  {
    purpose: '업무상 질병판정위원회 심의절차 등 통지',
    items: '성명, 휴대폰번호',
    period: '업무상 질병여부 결정일부터 10년',
  },
] as const;

/* ------------------------------------------------------------------ */
/* 기본값                                                              */
/* ------------------------------------------------------------------ */

export const createEmptyClause = (title = '', body = ''): DiseaseOpinionClause => ({
  id: generateId(),
  title,
  body,
});

export const createEmptyAppendix = (name = '', copies = ''): DiseaseOpinionAppendix => ({
  id: generateId(),
  name,
  copies,
});

/** 별지(2/2) 기본 소제목 — 서식 예시 순서를 따릅니다. (내용은 직접 작성) */
export const DEFAULT_CLAUSE_TITLES = [
  '당 현장에서의 실근로 기간 부족',
  '재해발생일 당시 당 현장과의 근로관계 부존재',
  '장기간의 타 현장 이력 및 퇴행성 질환 가능성',
  '결론',
];

/** 빈 의견서 (신규 작성) */
export const createEmptyDiseaseOpinion = (): DiseaseOpinion => ({
  workerName: '',
  workerResidentId: '',
  onsetDate: '',
  diseaseName: '',

  hireDate: '',
  nationality: '',
  jobType: '',
  workStartTime: '',
  workEndTime: '',
  taskStartTime: '',
  employmentStatus: '',
  employmentType: '',
  ownerStatus: '',
  relativeStatus: '',
  relativeEtc: '',
  workerTypes: [],
  workerTypeEtc: '',
  dutyDescription: '',
  wage: '',
  workHistoryAfter: '',

  acknowledge: '',
  acknowledgeEtc: '',
  rejectReason: '',

  noticeName: '',
  noticePhone: '',
  noticeAgreed: false,

  writtenDate: '',
  workplaceName: '구보공영(주)',
  workplaceAddress: '서울 서초구 논현로 133(양재동 84-5, 구보빌딩)',
  ownerName: '',
  phoneNumber: '02-3444-0411',
  mobileNumber: '',
  email: 'gbcj@goobo.cp.kr',
  recipient: '근로복지공단 귀하',

  attachmentIntro: '',
  attachmentClauses: DEFAULT_CLAUSE_TITLES.map(title => createEmptyClause(title)),
  appendixes: [createEmptyAppendix()],
});

/* ------------------------------------------------------------------ */
/* 저장값 정규화                                                       */
/* ------------------------------------------------------------------ */

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const clauseList = (value: unknown): DiseaseOpinionClause[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Partial<DiseaseOpinionClause> => !!row && typeof row === 'object')
    .map(row => ({
      id: str(row.id) || generateId(),
      title: str(row.title),
      body: str(row.body),
    }));
};

const appendixList = (value: unknown): DiseaseOpinionAppendix[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Partial<DiseaseOpinionAppendix> => !!row && typeof row === 'object')
    .map(row => ({
      id: str(row.id) || generateId(),
      name: str(row.name),
      copies: str(row.copies),
    }));
};

/**
 * 저장된 의견서 → 화면 입력값.
 * 예전 자료·일부만 저장된 자료도 빈 값으로 안전하게 채웁니다.
 */
export const normalizeDiseaseOpinion = (value?: Partial<DiseaseOpinion> | null): DiseaseOpinion => {
  const base = createEmptyDiseaseOpinion();
  if (!value) return base;
  const src = value as Record<string, unknown>;

  const workerTypes = Array.isArray(src.workerTypes)
    ? src.workerTypes.filter((v): v is string => typeof v === 'string')
    : [];

  const clauses = clauseList(src.attachmentClauses);
  const appendixes = appendixList(src.appendixes);

  return {
    ...base,
    workerName: str(src.workerName),
    workerResidentId: str(src.workerResidentId),
    onsetDate: str(src.onsetDate),
    diseaseName: str(src.diseaseName),

    hireDate: str(src.hireDate),
    nationality: str(src.nationality),
    jobType: str(src.jobType),
    workStartTime: str(src.workStartTime),
    workEndTime: str(src.workEndTime),
    taskStartTime: str(src.taskStartTime),
    employmentStatus: (str(src.employmentStatus) || '') as DiseaseOpinion['employmentStatus'],
    employmentType: (str(src.employmentType) || '') as DiseaseOpinion['employmentType'],
    ownerStatus: (str(src.ownerStatus) || '') as DiseaseOpinion['ownerStatus'],
    relativeStatus: (str(src.relativeStatus) || '') as DiseaseOpinion['relativeStatus'],
    relativeEtc: str(src.relativeEtc),
    workerTypes,
    workerTypeEtc: str(src.workerTypeEtc),
    dutyDescription: str(src.dutyDescription),
    wage: str(src.wage),
    workHistoryAfter: str(src.workHistoryAfter),

    acknowledge: (str(src.acknowledge) || '') as DiseaseOpinion['acknowledge'],
    acknowledgeEtc: str(src.acknowledgeEtc),
    rejectReason: str(src.rejectReason),

    noticeName: str(src.noticeName),
    noticePhone: str(src.noticePhone),
    noticeAgreed: src.noticeAgreed === true,

    writtenDate: str(src.writtenDate),
    workplaceName: str(src.workplaceName) || base.workplaceName,
    workplaceAddress: str(src.workplaceAddress) || base.workplaceAddress,
    ownerName: str(src.ownerName),
    phoneNumber: str(src.phoneNumber) || base.phoneNumber,
    mobileNumber: str(src.mobileNumber),
    email: str(src.email) || base.email,
    recipient: str(src.recipient) || base.recipient,

    attachmentIntro: str(src.attachmentIntro),
    attachmentClauses: clauses.length > 0 ? clauses : base.attachmentClauses,
    appendixes: appendixes.length > 0 ? appendixes : base.appendixes,
  };
};

/* ------------------------------------------------------------------ */
/* 표기 변환                                                           */
/* ------------------------------------------------------------------ */

/** '2026-01-02' → '2026년 1월 2일' */
export const formatKoreanDate = (value?: string): string => {
  const ym = parseYmd(value);
  if (!ym) return '';
  return `${ym.y}년 ${ym.m}월 ${ym.d}일`;
};

/** '07:00' → '07시 00분' */
export const formatKoreanTime = (value?: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return (value ?? '').trim();
  return `${m[1].padStart(2, '0')}시 ${m[2]}분`;
};

/** 체크 표시 (☑ / ☐) — 인쇄 서식에서 사용 */
export const checkMark = (checked: boolean): string => (checked ? '☑' : '☐');

/** 선택지 + 기타 의견을 '예 / 기타(내용)' 형태로 표기 */
export const withEtc = (value: string, etc?: string): string => {
  if (!value) return '';
  const extra = (etc ?? '').trim();
  if (value === '기타' && extra) return `${value} (${extra})`;
  if (value === '기타 친인척' && extra) return `기타 친인척 (${extra})`;
  return value;
};

/** 근로자 유형 표기 (선택 항목 + 기타) */
export const formatWorkerTypes = (opinion: DiseaseOpinion): string => {
  const list = opinion.workerTypes.map(type =>
    type === '특수형태근로종사자' && opinion.workerTypeEtc.trim()
      ? `${type}(${opinion.workerTypeEtc.trim()})`
      : type,
  );
  return list.join(', ');
};
