import React, { useMemo, useState } from 'react';
import { AccidentCase, DiseaseOpinion, DiseaseOpinionClause, Site } from '../types';
import { deleteAccidentDraft, generateId, saveAccidentDraft } from '../utils/storage';
import {
  ACKNOWLEDGE_OPTIONS,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  OWNER_STATUSES,
  RELATIVE_STATUSES,
  WORKER_TYPES,
  createEmptyAppendix,
  createEmptyClause,
  createEmptyDiseaseOpinion,
  normalizeDiseaseOpinion,
} from '../utils/diseaseOpinion';
import DiseaseOpinionReport from './DiseaseOpinionReport';
import AccidentDraftDialog from './AccidentDraftDialog';
import './DiseaseOpinionForm.css';

interface DiseaseOpinionFormProps {
  /** 선택 가능한 현장 목록 */
  sites: Site[];
  /** 처음 선택할 현장 */
  preselectedSiteId?: number;
  /** 현장 고정 여부 */
  lockSite?: boolean;
  /** 고정 현장 이름 */
  lockSiteName?: string;
  /** 수정할 기존 질병 사례 */
  initialCase?: AccidentCase;
  /** 작성 완료 */
  onSaved: (accidentCase: AccidentCase) => void;
  /** 취소 */
  onCancel: () => void;
  /** 제출 버튼 문구 */
  submitLabel?: string;
}

/**
 * 업무상 질병 작성 서식 — 「보험가입자 의견서」(근로복지공단 별지 제4호의2)
 *
 * 업무상 질병(발병)을 주장하는 요양급여 신청에 대한 **사업주 의견**을
 * 근로복지공단 서식 순서 그대로 입력합니다.
 * 1장은 서식 항목, 2장(별지)은 자유 서술이며, 인쇄하면 2장으로 출력됩니다.
 */
const DiseaseOpinionForm: React.FC<DiseaseOpinionFormProps> = ({
  sites,
  preselectedSiteId,
  lockSite = false,
  lockSiteName,
  initialCase,
  onSaved,
  onCancel,
  submitLabel,
}) => {
  const [siteId, setSiteId] = useState<number>(() => initialCase?.siteId ?? preselectedSiteId ?? 0);
  const [opinion, setOpinion] = useState<DiseaseOpinion>(() =>
    initialCase?.diseaseOpinion
      ? normalizeDiseaseOpinion(initialCase.diseaseOpinion)
      : createEmptyDiseaseOpinion(),
  );
  /** 임시저장본에서 이어 쓰는 경우 그 id 를 유지합니다. */
  const [draftId, setDraftId] = useState<string | null>(() =>
    initialCase?.isDraft ? initialCase.id : null,
  );
  /** 미리보기로 띄운 질병 사례 */
  const [previewCase, setPreviewCase] = useState<AccidentCase | null>(null);
  /** 임시저장 불러오기 다이얼로그 */
  const [draftOpen, setDraftOpen] = useState(false);
  /** 임시저장 안내 문구 */
  const [draftNotice, setDraftNotice] = useState('');
  /** 저장 버튼 문구 */
  const buttonLabel = submitLabel ?? (initialCase ? '수정 저장' : '질병 사례 등록');

  const resolvedSiteName = useMemo(() => {
    const found = sites.find(s => s.id === siteId);
    if (found) return found.name;
    return lockSite ? (lockSiteName ?? '') : '';
  }, [sites, siteId, lockSite, lockSiteName]);

  /** 의견서의 한 항목만 갱신 */
  const update = <K extends keyof DiseaseOpinion>(key: K, value: DiseaseOpinion[K]) => {
    setOpinion(prev => ({ ...prev, [key]: value }));
  };

  /** 근로자 유형 체크 토글 */
  const toggleWorkerType = (type: string) => {
    setOpinion(prev => {
      const has = prev.workerTypes.includes(type);
      return {
        ...prev,
        workerTypes: has ? prev.workerTypes.filter(t => t !== type) : [...prev.workerTypes, type],
      };
    });
  };

  /* ---------------- 별지 항목 ---------------- */
  const updateClause = (id: string, patch: Partial<DiseaseOpinionClause>) => {
    setOpinion(prev => ({
      ...prev,
      attachmentClauses: prev.attachmentClauses.map(c => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const addClause = () => {
    setOpinion(prev => ({
      ...prev,
      attachmentClauses: [...prev.attachmentClauses, createEmptyClause()],
    }));
  };

  const removeClause = (id: string) => {
    setOpinion(prev => ({
      ...prev,
      attachmentClauses: prev.attachmentClauses.filter(c => c.id !== id),
    }));
  };

  /* ---------------- 별첨 서류 ---------------- */
  const updateAppendix = (id: string, patch: { name?: string; copies?: string }) => {
    setOpinion(prev => ({
      ...prev,
      appendixes: prev.appendixes.map(a => (a.id === id ? { ...a, ...patch } : a)),
    }));
  };

  const addAppendix = () => {
    setOpinion(prev => ({ ...prev, appendixes: [...prev.appendixes, createEmptyAppendix()] }));
  };

  const removeAppendix = (id: string) => {
    setOpinion(prev => ({
      ...prev,
      appendixes: prev.appendixes.filter(a => a.id !== id),
    }));
  };

  /* ---------------- 사고사례 변환 ---------------- */
  /**
   * 의견서 → 사고사례(게시판 1건).
   * 게시판 공통 열(발생일시 · 유형 · 발생장소 등)은 의견서 값에서 채웁니다.
   */
  const collectCase = (): AccidentCase => {
    const keepId = initialCase?.id ?? draftId ?? generateId();
    return {
      id: keepId,
      siteId,
      siteName: resolvedSiteName || '현장 미지정',
      kind: '질병',
      diseaseOpinion: opinion,
      /* 게시판 표시용 — 발병일 · 상병명 */
      accidentDate: opinion.onsetDate,
      accidentType: '질병',
      severity: '질병',
      location: opinion.diseaseName.trim() || resolvedSiteName || '-',
      victimName: opinion.workerName.trim() || '미제공',
      description: opinion.attachmentIntro.trim() || opinion.rejectReason.trim(),
      cause: opinion.rejectReason.trim(),
      preventiveMeasures: '',
      status: initialCase?.status ?? '접수',
      createdAt: initialCase?.createdAt ?? new Date().toISOString(),
      reporterName: opinion.noticeName.trim() || opinion.ownerName.trim(),
      reporterPhone: opinion.noticePhone.trim() || opinion.mobileNumber.trim(),
      /* 질병은 사업(산업)재해조사표 제출 대상이 아닙니다. */
      disasterReportSubmitted: '제출대상 아님',
      treatmentResult: '질병성',
      signers: initialCase?.signers,
      images: initialCase?.images,
      attachments: initialCase?.attachments,
    };
  };

  const validate = (): string => {
    if (!siteId) return '현장을 선택해 주세요.';
    if (!opinion.workerName.trim()) return '재해자(신청인) 성명을 입력해 주세요.';
    if (!opinion.onsetDate) return '재해(발병) 발생일을 입력해 주세요.';
    return '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = validate();
    if (message) {
      alert(message);
      return;
    }
    if (draftId) deleteAccidentDraft(draftId);
    onSaved(collectCase());
  };

  const handleSaveDraft = () => {
    const draft = { ...collectCase(), isDraft: true };
    saveAccidentDraft(draft);
    setDraftId(draft.id);
    setDraftNotice(
      `${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 에 임시저장했습니다.`,
    );
  };

  const openDraft = (draft: AccidentCase) => {
    setDraftOpen(false);
    setSiteId(draft.siteId);
    setOpinion(normalizeDiseaseOpinion(draft.diseaseOpinion));
    setDraftId(draft.id);
    setDraftNotice('임시저장본을 불러왔습니다. 이어서 작성해 주세요.');
  };

  return (
    <div className="dof">
      <form className="dof-card" onSubmit={handleSubmit}>
        <div className="dof-doc-head">
          <h3 className="dof-doc-title">보험가입자 의견서</h3>
          <p className="dof-doc-sub">
            근로복지공단 별지 제4호의2 서식 · 업무상 질병 요양급여 신청에 대한 사업주 의견
          </p>
        </div>

        {/* ---------- 현장 ---------- */}
        {lockSite ? (
          <div className="dof-field dof-wide" style={{ marginBottom: '1.25rem' }}>
            <span className="dof-label">현장</span>
            <p className="dof-hint">{resolvedSiteName || lockSiteName || '-'}</p>
          </div>
        ) : (
          <div className="dof-field dof-wide" style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="dof-site">현장 선택 *</label>
            <select
              id="dof-site"
              value={siteId}
              onChange={e => setSiteId(Number(e.target.value))}
              required
            >
              <option value={0}>현장을 선택하세요</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ---------- 표제 정보 ---------- */}
        <div className="dof-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="dof-field">
            <label htmlFor="dof-workerName">재해자 성명 *</label>
            <input
              id="dof-workerName"
              type="text"
              value={opinion.workerName}
              onChange={e => update('workerName', e.target.value)}
              placeholder="홍길동"
              required
            />
          </div>
          <div className="dof-field">
            <label htmlFor="dof-workerResidentId">주민등록번호</label>
            <input
              id="dof-workerResidentId"
              type="text"
              value={opinion.workerResidentId}
              onChange={e => update('workerResidentId', e.target.value)}
              placeholder="000000-0******"
            />
          </div>
          <div className="dof-field">
            <label htmlFor="dof-onsetDate">재해 발생일 (발병일) *</label>
            <input
              id="dof-onsetDate"
              type="date"
              value={opinion.onsetDate}
              onChange={e => update('onsetDate', e.target.value)}
              required
            />
          </div>
          <div className="dof-field">
            <label htmlFor="dof-diseaseName">상병명</label>
            <input
              id="dof-diseaseName"
              type="text"
              value={opinion.diseaseName}
              onChange={e => update('diseaseName', e.target.value)}
              placeholder="예: 요추 2-3번 추간판장애"
            />
          </div>
        </div>

        {/* ---------- 1. 신청인 관련사항 ---------- */}
        <div className="dof-section">
          <h4 className="dof-section-title">
            1. 신청인과 관련하여 아래사항을 구체적으로 기재해 주세요
          </h4>

          <div className="dof-grid">
            <div className="dof-field">
              <label htmlFor="dof-hireDate">채용일자</label>
              <input
                id="dof-hireDate"
                type="date"
                value={opinion.hireDate}
                onChange={e => update('hireDate', e.target.value)}
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-nationality">국적</label>
              <input
                id="dof-nationality"
                type="text"
                value={opinion.nationality}
                onChange={e => update('nationality', e.target.value)}
                placeholder="대한민국"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-jobType">직종</label>
              <input
                id="dof-jobType"
                type="text"
                value={opinion.jobType}
                onChange={e => update('jobType', e.target.value)}
                placeholder="예: 배관공"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-workStartTime">출근시간</label>
              <input
                id="dof-workStartTime"
                type="time"
                value={opinion.workStartTime}
                onChange={e => update('workStartTime', e.target.value)}
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-workEndTime">퇴근시간</label>
              <input
                id="dof-workEndTime"
                type="time"
                value={opinion.workEndTime}
                onChange={e => update('workEndTime', e.target.value)}
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-taskStartTime">작업개시시간</label>
              <input
                id="dof-taskStartTime"
                type="time"
                value={opinion.taskStartTime}
                onChange={e => update('taskStartTime', e.target.value)}
              />
            </div>
          </div>

          <div className="dof-field dof-wide" style={{ marginTop: '0.875rem' }}>
            <span className="dof-label">종사상 지위</span>
            <div className="dof-choices">
              {EMPLOYMENT_STATUSES.map(value => (
                <label className="dof-choice" key={value}>
                  <input
                    type="radio"
                    name="dof-employmentStatus"
                    checked={opinion.employmentStatus === value}
                    onChange={() => update('employmentStatus', value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </div>

          <div className="dof-field dof-wide">
            <span className="dof-label">고용형태</span>
            <div className="dof-choices">
              {EMPLOYMENT_TYPES.map(value => (
                <label className="dof-choice" key={value}>
                  <input
                    type="radio"
                    name="dof-employmentType"
                    checked={opinion.employmentType === value}
                    onChange={() => update('employmentType', value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </div>

          <div className="dof-field dof-wide">
            <span className="dof-label">보험가입자(사업주)와의 관계 — 사업주여부</span>
            <div className="dof-choices">
              {OWNER_STATUSES.map(value => (
                <label className="dof-choice" key={value}>
                  <input
                    type="radio"
                    name="dof-ownerStatus"
                    checked={opinion.ownerStatus === value}
                    onChange={() => update('ownerStatus', value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </div>

          <div className="dof-field dof-wide">
            <span className="dof-label">보험가입자(사업주)와의 관계 — 친인척여부</span>
            <div className="dof-choices">
              {RELATIVE_STATUSES.map(value => (
                <label className="dof-choice" key={value}>
                  <input
                    type="radio"
                    name="dof-relativeStatus"
                    checked={opinion.relativeStatus === value}
                    onChange={() => update('relativeStatus', value)}
                  />
                  {value}
                </label>
              ))}
              <input
                className="dof-inline-input"
                style={{ width: '10rem' }}
                type="text"
                value={opinion.relativeEtc}
                onChange={e => update('relativeEtc', e.target.value)}
                placeholder="기타 친인척 관계"
                aria-label="기타 친인척 관계"
              />
            </div>
          </div>

          <div className="dof-field dof-wide">
            <span className="dof-label">근로자 유형</span>
            <div className="dof-checks">
              {WORKER_TYPES.map(type => (
                <label className="dof-choice" key={type}>
                  <input
                    type="checkbox"
                    checked={opinion.workerTypes.includes(type)}
                    onChange={() => toggleWorkerType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
            <input
              className="dof-inline-input"
              style={{ marginTop: '0.5rem', maxWidth: '22rem' }}
              type="text"
              value={opinion.workerTypeEtc}
              onChange={e => update('workerTypeEtc', e.target.value)}
              placeholder="특수형태근로종사자 등 기타 기재"
              aria-label="근로자 유형 기타"
            />
          </div>

          <div className="dof-grid" style={{ marginTop: '0.875rem' }}>
            <div className="dof-field dof-wide">
              <label htmlFor="dof-dutyDescription">담당업무</label>
              <textarea
                id="dof-dutyDescription"
                value={opinion.dutyDescription}
                onChange={e => update('dutyDescription', e.target.value)}
                placeholder="예: 지하 2층 배관 설치 작업"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-wage">임금 (월급 · 일급 · 시간급 등)</label>
              <input
                id="dof-wage"
                type="text"
                value={opinion.wage}
                onChange={e => update('wage', e.target.value)}
                placeholder="예: 일급 180,000원"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-workHistoryAfter">재해발생 이후 근무이력</label>
              <input
                id="dof-workHistoryAfter"
                type="text"
                value={opinion.workHistoryAfter}
                onChange={e => update('workHistoryAfter', e.target.value)}
                placeholder="예: 2026.01.02 이후 무급 휴무"
              />
            </div>
          </div>
        </div>

        {/* ---------- 2. 재해사실에 대한 의견 ---------- */}
        <div className="dof-section">
          <h4 className="dof-section-title">
            2. 재해사실 또는 발병사실에 대한 의견 (별지 사용 가능)
          </h4>

          <div className="dof-field dof-wide">
            <span className="dof-label">귀사는 신청인의 재해사실을 인정합니까?</span>
            <div className="dof-choices">
              {ACKNOWLEDGE_OPTIONS.map(value => (
                <label className="dof-choice" key={value}>
                  <input
                    type="radio"
                    name="dof-acknowledge"
                    checked={opinion.acknowledge === value}
                    onChange={() => update('acknowledge', value)}
                  />
                  {value}
                </label>
              ))}
              <input
                className="dof-inline-input"
                style={{ width: '16rem' }}
                type="text"
                value={opinion.acknowledgeEtc}
                onChange={e => update('acknowledgeEtc', e.target.value)}
                placeholder="기타 관련내용"
                aria-label="기타 관련내용"
              />
            </div>
            <p className="dof-warning">
              ※ 재해경위 등 주요사항을 사실과 달리 기재하여 보험급여를 지급받게 도와준 경우에는
              산재보험법 제127조에 따라 형사처벌을 받을 수 있으므로 사실대로 기재하여야 합니다.
            </p>
          </div>

          <div className="dof-field dof-wide" style={{ marginTop: '0.875rem' }}>
            <label htmlFor="dof-rejectReason">
              신청인의 재해사실을 인정하지 않는 경우 그 사유를 구체적으로 기재해 주시기 바랍니다
            </label>
            <textarea
              id="dof-rejectReason"
              value={opinion.rejectReason}
              onChange={e => update('rejectReason', e.target.value)}
              placeholder="인정하지 않는 사유를 구체적으로 기재하세요. 자세한 내용은 2장(별지)에 이어서 작성할 수 있습니다."
              style={{ minHeight: '110px' }}
            />
          </div>
        </div>

        {/* ---------- 3. 심의대상 안내 ---------- */}
        <div className="dof-section">
          <h4 className="dof-section-title">
            3. 업무상 질병판정위원회 심의대상에 대한 진행사항 등 안내
          </h4>
          <p className="dof-section-desc">
            업무상질병판정위원회 심의대상인 경우 심의절차, 진행사항, 심의회의 일자 등 안내를 위하여
            사업주 또는 사업장 담당자 휴대폰 번호 확인이 반드시 필요합니다. 만일, 휴대폰 번호가
            확인되지 않거나 정보사용에 동의하지 않는 경우 심의절차 등 안내가 제한될 수 있습니다.
          </p>

          <table className="dof-notice-table">
            <thead>
              <tr>
                <th>개인정보 이용목적</th>
                <th>이용항목 / 보유 및 이용기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  사업주(또는 사업장 담당자) 통지받을 휴대폰번호
                  <br />
                  업무상 질병판정위원회 심의절차 등 통지
                </td>
                <td>성명, 휴대폰번호 / 업무상 질병여부 결정일부터 10년</td>
              </tr>
            </tbody>
          </table>

          <div className="dof-grid" style={{ marginTop: '0.875rem' }}>
            <div className="dof-field">
              <label htmlFor="dof-noticeName">통지받을 담당자 성명</label>
              <input
                id="dof-noticeName"
                type="text"
                value={opinion.noticeName}
                onChange={e => update('noticeName', e.target.value)}
                placeholder="예: 왕일래"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-noticePhone">통지받을 휴대폰번호</label>
              <input
                id="dof-noticePhone"
                type="tel"
                value={opinion.noticePhone}
                onChange={e => update('noticePhone', e.target.value)}
                placeholder="010-0000-0000"
              />
            </div>
          </div>

          <div className="dof-choices" style={{ marginTop: '0.625rem' }}>
            <label className="dof-choice">
              <input
                type="checkbox"
                checked={opinion.noticeAgreed}
                onChange={e => update('noticeAgreed', e.target.checked)}
              />
              위 개인정보 수집·이용에 동의합니다.
            </label>
          </div>
        </div>

        {/* ---------- 확인 및 사업장 정보 ---------- */}
        <div className="dof-section">
          <h4 className="dof-section-title">확인 및 사업장 정보</h4>
          <p className="dof-section-desc">위에 기재한 사실이 모두 사실임을 확인합니다.</p>

          <div className="dof-grid">
            <div className="dof-field">
              <label htmlFor="dof-writtenDate">작성일</label>
              <input
                id="dof-writtenDate"
                type="date"
                value={opinion.writtenDate}
                onChange={e => update('writtenDate', e.target.value)}
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-workplaceName">사업장명</label>
              <input
                id="dof-workplaceName"
                type="text"
                value={opinion.workplaceName}
                onChange={e => update('workplaceName', e.target.value)}
              />
            </div>
            <div className="dof-field dof-wide">
              <label htmlFor="dof-workplaceAddress">소재지</label>
              <input
                id="dof-workplaceAddress"
                type="text"
                value={opinion.workplaceAddress}
                onChange={e => update('workplaceAddress', e.target.value)}
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-ownerName">사업주</label>
              <input
                id="dof-ownerName"
                type="text"
                value={opinion.ownerName}
                onChange={e => update('ownerName', e.target.value)}
                placeholder="예: 이상영"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-phoneNumber">전화번호</label>
              <input
                id="dof-phoneNumber"
                type="tel"
                value={opinion.phoneNumber}
                onChange={e => update('phoneNumber', e.target.value)}
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-mobileNumber">휴대폰</label>
              <input
                id="dof-mobileNumber"
                type="tel"
                value={opinion.mobileNumber}
                onChange={e => update('mobileNumber', e.target.value)}
                placeholder="010-0000-0000"
              />
            </div>
            <div className="dof-field">
              <label htmlFor="dof-email">E-Mail</label>
              <input
                id="dof-email"
                type="email"
                value={opinion.email}
                onChange={e => update('email', e.target.value)}
              />
            </div>
            <div className="dof-field dof-wide">
              <label htmlFor="dof-recipient">수신</label>
              <input
                id="dof-recipient"
                type="text"
                value={opinion.recipient}
                onChange={e => update('recipient', e.target.value)}
                placeholder="근로복지공단 00000 귀하"
              />
            </div>
          </div>
        </div>

        {/* ---------- 별지 (2/2) ---------- */}
        <div className="dof-section">
          <h4 className="dof-section-title">별지 (2/2) — 자유 서술</h4>
          <p className="dof-section-desc">
            인쇄하면 별지가 2장째로 출력됩니다. 항목은 자유롭게 추가·삭제할 수 있습니다.
          </p>

          <div className="dof-field dof-wide">
            <label htmlFor="dof-attachmentIntro">도입 문단</label>
            <textarea
              id="dof-attachmentIntro"
              value={opinion.attachmentIntro}
              onChange={e => update('attachmentIntro', e.target.value)}
              placeholder="예: 당사는 신청인 ○○○의 요양급여신청(업무상 질병)에 대하여 다음과 같은 사유로 업무상 상당인과관계가 성립하지 않음을 확인하오니 공정한 심사를 통해 불승인 처하여 주시기 바랍니다."
              style={{ minHeight: '96px' }}
            />
          </div>

          <div className="dof-repeat-head" style={{ marginTop: '0.875rem' }}>
            <span className="dof-label" style={{ margin: 0 }}>
              번호 항목
            </span>
          </div>

          {opinion.attachmentClauses.map((clause, idx) => (
            <div className="dof-repeat-row" key={clause.id}>
              <div className="dof-repeat-body">
                <input
                  className="dof-inline-input"
                  type="text"
                  value={clause.title}
                  onChange={e => updateClause(clause.id, { title: e.target.value })}
                  placeholder={`${idx + 1}. 소제목`}
                  aria-label={`항목 ${idx + 1} 소제목`}
                />
                <textarea
                  value={clause.body}
                  onChange={e => updateClause(clause.id, { body: e.target.value })}
                  placeholder="서술 내용"
                  aria-label={`항목 ${idx + 1} 내용`}
                  style={{
                    width: '100%',
                    padding: '0.5625rem 0.6875rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    lineHeight: 1.65,
                    resize: 'vertical',
                    minHeight: '76px',
                  }}
                />
              </div>
              <button
                type="button"
                className="dof-repeat-del"
                onClick={() => removeClause(clause.id)}
                title="이 항목 삭제"
              >
                삭제
              </button>
            </div>
          ))}

          <button type="button" className="dof-add" onClick={addClause}>
            ＋ 항목 추가
          </button>

          <div className="dof-repeat-head" style={{ marginTop: '1.25rem' }}>
            <span className="dof-label" style={{ margin: 0 }}>
              5. “별첨”
            </span>
          </div>

          {opinion.appendixes.map(appendix => (
            <div className="dof-repeat-row" key={appendix.id}>
              <div className="dof-repeat-body">
                <div className="dof-appendix-row">
                  <input
                    className="dof-inline-input"
                    type="text"
                    value={appendix.name}
                    onChange={e => updateAppendix(appendix.id, { name: e.target.value })}
                    placeholder="서류명 (예: 근로계약서)"
                    aria-label="별첨 서류명"
                  />
                  <span className="dof-appendix-copies">
                    <input
                      className="dof-inline-input"
                      type="text"
                      value={appendix.copies}
                      onChange={e => updateAppendix(appendix.id, { copies: e.target.value })}
                      placeholder="8매"
                      aria-label="별첨 매수"
                    />
                    매
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="dof-repeat-del"
                onClick={() => removeAppendix(appendix.id)}
                title="이 별첨 삭제"
              >
                삭제
              </button>
            </div>
          ))}

          <button type="button" className="dof-add" onClick={addAppendix}>
            ＋ 별첨 추가
          </button>
        </div>

        {/* ---------- 버튼 ---------- */}
        <div className="dof-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSaveDraft}
            title="작성 중인 내용을 저장해 두고 나중에 이어서 작성합니다."
          >
            💾 임시저장
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDraftOpen(true)}
            title="임시저장해 둔 질병 사례를 불러와 이어서 작성합니다."
          >
            📂 불러오기
          </button>
          <button
            type="button"
            className="btn dof-btn-preview"
            onClick={() => setPreviewCase(collectCase())}
            title="지금까지 입력한 내용을 보험가입자 의견서(A4)로 미리 봅니다."
          >
            👁️ 미리보기 (A4)
          </button>
          <button type="submit" className="btn btn-primary">
            {buttonLabel}
          </button>
        </div>

        {draftNotice && (
          <p className="dof-hint" role="status" style={{ marginTop: '0.625rem' }}>
            {draftNotice}
          </p>
        )}
      </form>

      {previewCase && (
        <DiseaseOpinionReport accident={previewCase} onClose={() => setPreviewCase(null)} />
      )}

      {draftOpen && (
        <AccidentDraftDialog
          siteId={lockSite ? siteId : undefined}
          onClose={() => setDraftOpen(false)}
          onOpen={openDraft}
        />
      )}
    </div>
  );
};

export default DiseaseOpinionForm;
