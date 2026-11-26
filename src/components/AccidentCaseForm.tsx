import React, { useMemo, useRef, useState } from 'react';
import {
  AccidentAttachment,
  AccidentCase,
  AccidentSigner,
  DisasterReportStatus,
  NationalityType,
  Site,
  TreatmentResult,
  WitnessStatement,
} from '../types';
import {
  deleteAccidentDraft,
  generateId,
  getAccidentDraftsForSite,
  saveAccidentDraft,
} from '../utils/storage';
import { buildDefaultSigners, formatTenure, resolveSigners } from '../utils/accidentReport';
import { getDeadlineInfo } from '../utils/accidentDeadline';
import {
  MAX_FILE_SIZE,
  formatFileSize,
  generateStorageKey,
  getFile,
  putFile,
  deleteFile,
} from '../utils/documentStorage';
import SituationDiagram from './SituationDiagram';
import SignerEditor from './SignerEditor';
import WitnessEditor from './WitnessEditor';
import AccidentReport from './AccidentReport';
import AccidentDraftDialog from './AccidentDraftDialog';
import './AccidentCaseForm.css';

/**
 * 사고사례 작성 서식
 *
 * 전사 '사고사례 제출' 페이지와 현장별 '사고사례 게시판'에서 함께 씁니다.
 * - sites 를 넘기면 현장을 고를 수 있습니다.
 * - lockSite 를 켜면 현장이 고정됩니다. (현장 상세 게시판에서 작성)
 * 작성이 끝나면 onSaved(accidentCase) 로 넘깁니다.
 */
export interface AccidentCaseFormProps {
  /** 선택 가능한 현장 목록 */
  sites: Site[];
  /** 처음 선택할 현장 */
  preselectedSiteId?: number;
  /** 현장 고정 여부 */
  lockSite?: boolean;
  /** 고정 현장 이름 (lockSite 일 때 표시) */
  lockSiteName?: string;
  /** 수정할 기존 사고사례 (없으면 신규 작성) */
  initialCase?: AccidentCase;
  /** 작성 완료 */
  onSaved: (accidentCase: AccidentCase) => void;
  /** 취소 */
  onCancel: () => void;
  /** 제출 버튼 문구 */
  submitLabel?: string;
}

/** 기존 사고사례 → 폼 입력값 */
const toFormData = (base: AccidentCase) => ({
  siteId: base.siteId,
  accidentDate: base.accidentDate,
  accidentType: base.accidentType,
  severity: base.severity,
  location: base.location,
  victimName: base.victimName === '미제공' ? '' : (base.victimName ?? ''),
  victimAge: base.victimAge != null ? String(base.victimAge) : '',
  victimHireDate: base.victimHireDate ?? '',
  /* 피해자 상세 */
  victimJobType: base.victimJobType ?? '',
  victimBirthDate: base.victimBirthDate ?? '',
  victimRank: base.victimRank ?? '',
  victimMaritalStatus: (base.victimMaritalStatus ?? '') as '' | '미혼' | '기혼' | '기타',
  victimFamily: base.victimFamily ?? '',
  victimPhone: base.victimPhone ?? '',
  victimNationality: (base.victimNationality ?? '내국인') as NationalityType,
  /* 재해(사고) 상황 */
  disasterDate: base.disasterDate ?? '',
  disasterPlace: base.disasterPlace ?? '',
  situationNote: base.situationNote ?? '',
  description: base.description,
  cause: base.cause,
  preventiveMeasures: base.preventiveMeasures,
  /* 사고원인 및 대책 보고서 (서식 FWP-006) */
  actionTaken: base.actionTaken ?? '',
  relatedNotes: base.relatedNotes ?? '',
  relatedEtc: base.relatedEtc ?? '',
  safetyManagerName: base.safetyManagerName ?? '',
  siteManagerName: base.siteManagerName ?? '',
  hqSafetyTeamLeaderName: base.hqSafetyTeamLeaderName ?? '',
  hqSafetyExecutiveName: base.hqSafetyExecutiveName ?? '',
  reporterName: base.reporterName,
  reporterPhone: base.reporterPhone,
  disasterReportSubmitted: (base.disasterReportSubmitted ?? '미제출') as DisasterReportStatus,
  treatmentResult: (base.treatmentResult ?? '미처리') as TreatmentResult,
  primeContractor: base.primeContractor ?? '',
});

const AccidentCaseForm: React.FC<AccidentCaseFormProps> = ({
  sites,
  preselectedSiteId,
  lockSite = false,
  lockSiteName,
  initialCase,
  onSaved,
  onCancel,
  submitLabel,
}) => {
  const [formData, setFormData] = useState(() =>
    initialCase
      ? toFormData(initialCase)
      : {
          siteId: preselectedSiteId || 0,
          accidentDate: '',
          accidentType: '추락' as
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
            | '기타',
          severity: '경상' as '경상' | '중상' | '사망' | '무재해',
          location: '',
          victimName: '',
          victimAge: '',
          victimHireDate: '',
          /* 피해자 상세 */
          victimJobType: '',
          victimBirthDate: '',
          victimRank: '',
          victimMaritalStatus: '' as '' | '미혼' | '기혼' | '기타',
          victimFamily: '',
          victimPhone: '',
          victimNationality: '내국인' as NationalityType,
          /* 재해(사고) 상황 */
          disasterDate: '',
          disasterPlace: '',
          situationNote: '',
          description: '',
          cause: '',
          preventiveMeasures: '',
          /* 사고원인 및 대책 보고서 (서식 FWP-006) */
          actionTaken: '',
          relatedNotes: '',
          relatedEtc: '',
          safetyManagerName: '',
          siteManagerName: '',
          hqSafetyTeamLeaderName: '',
          hqSafetyExecutiveName: '',
          reporterName: '',
          reporterPhone: '',
          disasterReportSubmitted: '미제출' as DisasterReportStatus,
          treatmentResult: '미처리' as TreatmentResult,
          primeContractor: '',
        },
  );

  /** 재해 상황도 (PNG data URL) */
  const [situationDiagram, setSituationDiagram] = useState(
    () => initialCase?.situationDiagram ?? '',
  );
  /** 목격자 진술서 목록 */
  const [witnesses, setWitnesses] = useState<WitnessStatement[]>(
    () => initialCase?.witnesses ?? [],
  );
  /**
   * 서명란 (직책 · 성명) — 자유롭게 추가/삭제합니다.
   * 기존 사고사례를 수정하는 경우 예전 고정 필드 값으로 기본 서명란을 만듭니다.
   */
  const [signers, setSigners] = useState<AccidentSigner[]>(() =>
    initialCase ? resolveSigners(initialCase) : buildDefaultSigners(),
  );
  /** 미리보기로 띄울 사고사례 (null 이면 닫힘) */
  const [previewCase, setPreviewCase] = useState<AccidentCase | null>(null);
  /** 첨부서류 체크란 */
  const [docLaborContract, setDocLaborContract] = useState(() => !!initialCase?.docLaborContract);
  const [docMedicalOpinion, setDocMedicalOpinion] = useState(
    () => !!initialCase?.docMedicalOpinion,
  );
  /** 첨부파일 (본문은 IndexedDB) */
  const [attachments, setAttachments] = useState<AccidentAttachment[]>(
    () => initialCase?.attachments ?? [],
  );
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** 임시저장 불러오기 다이얼로그 */
  const [draftOpen, setDraftOpen] = useState(false);
  /** 임시저장본에서 이어서 작성 중인지 (id 유지) */
  const [draftId, setDraftId] = useState<string | null>(() =>
    initialCase?.isDraft ? initialCase.id : null,
  );
  /** 임시저장 안내 문구 */
  const [draftNotice, setDraftNotice] = useState('');
  /** 저장 버튼 문구 — 수정 모드면 '수정 저장' */
  const buttonLabel = submitLabel ?? (initialCase ? '수정 저장' : '사고사례 등록');
  /** 사업재해조사표 제출 기한 (사고 발생일 + 1개월) */
  const deadline = useMemo(
    () => getDeadlineInfo(formData.accidentDate || undefined),
    [formData.accidentDate],
  );
  /** 저장해 둔 임시저장본 개수 */
  const draftCount = useMemo(
    () => getAccidentDraftsForSite(lockSite ? formData.siteId : undefined).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lockSite, formData.siteId, draftNotice, draftOpen],
  );

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    // <select> 의 값은 항상 문자열이므로 현장 ID 는 숫자로 변환해 보관합니다.
    // (문자열로 두면 handleSubmit 의 `s.id === formData.siteId` 비교가 항상 실패합니다)
    if (name === 'siteId') {
      setFormData(prev => ({ ...prev, siteId: Number(value) }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  /** 현재 입력값으로 사고사례 객체를 만듭니다. (미리보기·저장·임시저장 공용) */
  const collectCase = (): AccidentCase => {
    /*
     * 현장 고정 모드(현장 상세 게시판)에서는 sites 목록을 넘기지 않으므로
     * lockSiteName 으로 현장 이름을 확인합니다.
     */
    const selectedSite = sites.find(s => s.id === formData.siteId);
    const resolvedSiteName = selectedSite?.name ?? (lockSite ? lockSiteName : '') ?? '현장 미지정';
    /* 임시저장본에서 이어 쓸 때는 임시저장 id 를 그대로 유지합니다. */
    const keepId = initialCase?.id ?? draftId ?? generateId();

    return {
      /* 수정 모드에서는 id · 작성일 · 진행상태를 그대로 유지합니다. */
      id: keepId,
      siteId: formData.siteId,
      siteName: resolvedSiteName || '현장 미지정',
      accidentDate: formData.accidentDate,
      accidentType: formData.accidentType,
      severity: formData.severity,
      location: formData.location,
      victimName: formData.victimName || '미제공',
      victimAge: formData.victimAge ? parseInt(formData.victimAge) : undefined,
      victimHireDate: formData.victimHireDate || undefined,
      /* 피해자 상세 */
      victimJobType: formData.victimJobType.trim() || undefined,
      victimBirthDate: formData.victimBirthDate || undefined,
      victimRank: formData.victimRank.trim() || undefined,
      victimMaritalStatus: formData.victimMaritalStatus || undefined,
      victimFamily: formData.victimFamily.trim() || undefined,
      victimPhone: formData.victimPhone.trim() || undefined,
      victimNationality: formData.victimNationality || undefined,
      /* 재해(사고) 상황 */
      disasterDate: formData.disasterDate || undefined,
      disasterPlace: formData.disasterPlace.trim() || undefined,
      situationDiagram: situationDiagram || undefined,
      situationNote: formData.situationNote.trim() || undefined,
      witnesses: witnesses.length > 0 ? witnesses : undefined,
      description: formData.description,
      cause: formData.cause,
      preventiveMeasures: formData.preventiveMeasures,
      /* 사고원인 및 대책 보고서 (서식 FWP-006) */
      actionTaken: formData.actionTaken.trim() || undefined,
      relatedNotes: formData.relatedNotes.trim() || undefined,
      relatedEtc: formData.relatedEtc.trim() || undefined,
      safetyManagerName: formData.safetyManagerName.trim() || undefined,
      siteManagerName: formData.siteManagerName.trim() || undefined,
      hqSafetyTeamLeaderName: formData.hqSafetyTeamLeaderName.trim() || undefined,
      hqSafetyExecutiveName: formData.hqSafetyExecutiveName.trim() || undefined,
      /*
       * 서명란은 이 배열이 원본입니다. (항상 저장 — 전부 지운 경우까지 반영)
       * 직책·성명이 모두 비어 있는 행만 걸러냅니다.
       */
      signers: signers
        .map(s => ({ ...s, role: s.role.trim(), name: s.name?.trim() || undefined }))
        .filter(s => s.role || s.name),
      /* 산재(원청) 선택 시에만 원청사를 보관합니다. */
      primeContractor:
        formData.treatmentResult === '산재(원청)'
          ? formData.primeContractor.trim() || undefined
          : undefined,
      /* 첨부서류 체크란 + 첨부파일 */
      docLaborContract: docLaborContract || undefined,
      docMedicalOpinion: docMedicalOpinion || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      /* 사고 현장 사진 기능은 제거되었습니다. 기존 자료는 그대로 보존합니다. */
      images: initialCase?.images,
      status: initialCase?.status ?? '접수',
      createdAt: initialCase?.createdAt ?? new Date().toISOString(),
      reporterName: formData.reporterName,
      reporterPhone: formData.reporterPhone,
      disasterReportSubmitted: formData.disasterReportSubmitted,
      treatmentResult: formData.treatmentResult,
    };
  };

  /* ---------------- 첨부파일 (item 3) ---------------- */
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingFile(true);

    const added: AccidentAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name}은(는) ${formatFileSize(MAX_FILE_SIZE)}를 초과합니다.`);
        continue;
      }
      try {
        const storageKey = generateStorageKey(file.name);
        await putFile(storageKey, file);
        added.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          storageKey,
          kind: '기타',
          uploadedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('첨부파일 저장 실패:', error);
        alert(`${file.name} 첨부에 실패했습니다.`);
      }
    }

    if (added.length > 0) setAttachments(prev => [...prev, ...added]);
    setUploadingFile(false);
    e.target.value = '';
  };

  const removeAttachment = async (target: AccidentAttachment) => {
    if (!window.confirm(`'${target.name}' 첨부파일을 삭제할까요?`)) return;
    try {
      await deleteFile(target.storageKey);
    } catch (error) {
      console.warn('첨부파일 본문 삭제 실패:', error);
    }
    setAttachments(prev => prev.filter(a => a.id !== target.id));
  };

  /** 첨부파일 내려받기 (IndexedDB → 브라우저 저장) */
  const downloadAttachment = async (target: AccidentAttachment) => {
    try {
      const blob = await getFile(target.storageKey);
      if (!blob) {
        alert('첨부파일 본문을 찾을 수 없습니다.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = target.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('첨부파일 내려받기 실패:', error);
      alert('첨부파일을 열지 못했습니다.');
    }
  };

  /* ---------------- 임시저장 (item 4) ---------------- */
  const handleSaveDraft = () => {
    if (formData.siteId === 0) {
      alert('현장을 선택해야 임시저장할 수 있습니다.');
      return;
    }
    const draft = collectCase();
    saveAccidentDraft(draft);
    setDraftId(draft.id);
    const stamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setDraftNotice(
      `${pad(stamp.getHours())}:${pad(stamp.getMinutes())} 에 임시저장했습니다. 게시판에는 아직 올라가지 않았습니다.`,
    );
  };

  /** 임시저장본 불러오기 → 폼 전체를 그 내용으로 채웁니다. */
  const openDraft = (draft: AccidentCase) => {
    setFormData(toFormData(draft));
    setSituationDiagram(draft.situationDiagram ?? '');
    setWitnesses(draft.witnesses ?? []);
    setSigners(draft.signers && draft.signers.length > 0 ? draft.signers : resolveSigners(draft));
    setDocLaborContract(!!draft.docLaborContract);
    setDocMedicalOpinion(!!draft.docMedicalOpinion);
    setAttachments(draft.attachments ?? []);
    setDraftId(draft.id);
    setDraftOpen(false);
    setDraftNotice('임시저장본을 불러왔습니다. 이어서 작성해 주세요.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.siteId === 0) {
      alert('현장을 선택해주세요.');
      return;
    }

    if (!formData.accidentDate) {
      alert('사고 발생 일시를 입력해주세요.');
      return;
    }

    const selectedSite = sites.find(s => s.id === formData.siteId);
    const resolvedSiteName = selectedSite?.name ?? (lockSite ? lockSiteName : undefined);
    if (!resolvedSiteName) {
      alert('선택한 현장을 찾을 수 없습니다.');
      return;
    }

    /* 등록하면 임시저장본은 정리합니다. (게시판에만 남도록) */
    if (draftId) deleteAccidentDraft(draftId);
    onSaved(collectCase());
  };

  /** 미리보기 — 입력한 내용 그대로 회사 서식(A4)으로 확인합니다. */
  const openPreview = () => {
    setPreviewCase(collectCase());
  };

  return (
    <div className="acf">
      <form onSubmit={handleSubmit} className="accident-form">
        {/* 현장 */}
        {lockSite ? (
          <div className="form-group">
            <label>현장</label>
            <p className="acf-locked">{lockSiteName || '-'}</p>
          </div>
        ) : (
          <>
            {/* 현장 선택 */}
            <div className="form-group">
              <label htmlFor="siteId">현장 선택 *</label>
              <select
                id="siteId"
                name="siteId"
                value={formData.siteId}
                onChange={handleInputChange}
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
          </>
        )}

        {/* 사고 발생 일시 */}
        <div className="form-group">
          <label htmlFor="accidentDate">사고 발생 일시 *</label>
          <input
            type="datetime-local"
            id="accidentDate"
            name="accidentDate"
            value={formData.accidentDate}
            onChange={handleInputChange}
            required
          />
        </div>

        {/* 사고 유형 및 심각도 */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="accidentType">사고 유형 *</label>
            <select
              id="accidentType"
              name="accidentType"
              value={formData.accidentType}
              onChange={handleInputChange}
              required
            >
              <option value="추락">추락</option>
              <option value="낙하비래">낙하비래</option>
              <option value="전도">전도</option>
              <option value="협착">협착</option>
              <option value="전기감전">전기감전</option>
              <option value="화재폭발">화재폭발</option>
              <option value="끼임">끼임</option>
              <option value="부딪힘">부딪힘</option>
              <option value="넘어짐">넘어짐</option>
              <option value="질병">질병</option>
              <option value="기타">기타</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="severity">심각도 *</label>
            <select
              id="severity"
              name="severity"
              value={formData.severity}
              onChange={handleInputChange}
              required
            >
              <option value="무재해">무재해</option>
              <option value="경상">경상</option>
              <option value="중상">중상</option>
              <option value="사망">사망</option>
            </select>
          </div>
        </div>

        {/* 사업재해조사표 및 처리결과 */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="disasterReportSubmitted">사업재해조사표 제출 여부</label>
            <select
              id="disasterReportSubmitted"
              name="disasterReportSubmitted"
              value={formData.disasterReportSubmitted}
              onChange={handleInputChange}
            >
              <option value="미제출">미제출</option>
              <option value="제출">제출</option>
              <option value="제출대상 아님">제출대상 아님</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="treatmentResult">사고 처리결과</label>
            <select
              id="treatmentResult"
              name="treatmentResult"
              value={formData.treatmentResult}
              onChange={handleInputChange}
            >
              <option value="미처리">미처리</option>
              <option value="공상">공상</option>
              <option value="산재">산재</option>
              <option value="산재(원청)">산재(원청)</option>
              <option value="질병성">질병성</option>
            </select>
          </div>
        </div>

        {/* 산재(원청) 선택 시 원청사 입력 */}
        {formData.treatmentResult === '산재(원청)' && (
          <div className="form-group acf-reveal">
            <label htmlFor="primeContractor">원청사 *</label>
            <input
              type="text"
              id="primeContractor"
              name="primeContractor"
              value={formData.primeContractor}
              onChange={handleInputChange}
              placeholder="예: 삼성물산(주), 현대건설(주)"
            />
            <p className="field-hint">산재(원청) 처리 시 원청사명을 함께 기록합니다.</p>
          </div>
        )}

        {/* 사업재해조사표 제출 기한 (사고 발생일 + 1개월) */}
        {formData.accidentDate && formData.disasterReportSubmitted === '미제출' && (
          <div className={`acf-deadline${deadline ? ` ${deadline.className}` : ''}`}>
            <strong className="acf-deadline-title">⏰ 사업재해조사표 제출 기한</strong>
            <span className="acf-deadline-body">
              사고 발생일로부터 <b>1개월 이내</b> 제출해야 합니다.
              {deadline ? (
                <>
                  {' '}
                  기한 <b>{deadline.deadlineLabel}</b>
                  <span className="acf-deadline-dday">{deadline.ddayLabel}</span>
                </>
              ) : null}
            </span>
          </div>
        )}

        {/* 발생 장소 */}
        <div className="form-group">
          <label htmlFor="location">사고 발생 장소 *</label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            placeholder="예: 5층 작업장, 외부 비계"
            required
          />
        </div>

        {/* 피해자 정보 (선택) */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="victimName">피해자 성명 (선택)</label>
            <input
              type="text"
              id="victimName"
              name="victimName"
              value={formData.victimName}
              onChange={handleInputChange}
              placeholder="미입력 시 '미제공'으로 표시"
            />
          </div>

          <div className="form-group">
            <label htmlFor="victimAge">피해자 나이 (선택)</label>
            <input
              type="number"
              id="victimAge"
              name="victimAge"
              value={formData.victimAge}
              onChange={handleInputChange}
              placeholder="예: 35"
              min="1"
              max="100"
            />
          </div>

          <div className="form-group">
            <label htmlFor="victimHireDate">피해자 입사일 (선택)</label>
            <input
              type="date"
              id="victimHireDate"
              name="victimHireDate"
              value={formData.victimHireDate}
              onChange={handleInputChange}
              max={formData.accidentDate ? formData.accidentDate.slice(0, 10) : undefined}
            />
            <p className="field-hint">
              {formData.victimHireDate
                ? `근속기간: ${formatTenure(formData.victimHireDate, formData.accidentDate)} (사고 발생일 기준)`
                : '사고보고서에 근속기간이 함께 출력됩니다.'}
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="victimNationality">피해자 국적 (선택)</label>
            <select
              id="victimNationality"
              name="victimNationality"
              value={formData.victimNationality}
              onChange={handleInputChange}
            >
              <option value="내국인">내국인</option>
              <option value="외국인">외국인</option>
            </select>
          </div>
        </div>

        {/* 피해자 상세 정보 — 직종 / 결혼여부 / 가족관계 / 연락처 */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="victimJobType">피해자 직종 (선택)</label>
            <input
              type="text"
              id="victimJobType"
              name="victimJobType"
              value={formData.victimJobType}
              onChange={handleInputChange}
              placeholder="예: 철근공, 형틀목공, 신호수"
              list="jobTypeOptions"
            />
            <datalist id="jobTypeOptions">
              <option value="철근공" />
              <option value="형틀목공" />
              <option value="비계공" />
              <option value="신호수" />
              <option value="장비운전원" />
              <option value="전기공" />
              <option value="용접공" />
              <option value="보통인부" />
              <option value="배관공" />
              <option value="보온공" />
              <option value="덕트공" />
              <option value="내선전공" />
            </datalist>
          </div>

          <div className="form-group">
            <label htmlFor="victimMaritalStatus">결혼여부 (선택)</label>
            <select
              id="victimMaritalStatus"
              name="victimMaritalStatus"
              value={formData.victimMaritalStatus}
              onChange={handleInputChange}
            >
              <option value="">선택 안 함</option>
              <option value="미혼">미혼</option>
              <option value="기혼">기혼</option>
              <option value="기타">기타</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="victimBirthDate">생년월일 (선택)</label>
            <input
              type="date"
              id="victimBirthDate"
              name="victimBirthDate"
              value={formData.victimBirthDate}
              onChange={handleInputChange}
            />
            <p className="field-hint">사고원인 및 대책 보고서의 성명란에 나이와 함께 표시됩니다.</p>
          </div>

          <div className="form-group">
            <label htmlFor="victimRank">직급 (선택)</label>
            <input
              type="text"
              id="victimRank"
              name="victimRank"
              value={formData.victimRank}
              onChange={handleInputChange}
              placeholder="예: 배관(배관공), 반장"
            />
          </div>

          <div className="form-group">
            <label htmlFor="victimFamily">가족관계 (선택)</label>
            <input
              type="text"
              id="victimFamily"
              name="victimFamily"
              value={formData.victimFamily}
              onChange={handleInputChange}
              placeholder="예: 배우자 1명, 자녀 2명"
            />
          </div>

          <div className="form-group">
            <label htmlFor="victimPhone">피해자 연락처 (선택)</label>
            <input
              type="tel"
              id="victimPhone"
              name="victimPhone"
              value={formData.victimPhone}
              onChange={handleInputChange}
              placeholder="010-0000-0000"
            />
          </div>
        </div>

        {/* 재해(사고) 상황 */}
        <div className="form-section">
          <h3 className="form-section-title">🏗️ 재해(사고) 상황</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="disasterDate">재해 발생일</label>
              <input
                type="date"
                id="disasterDate"
                name="disasterDate"
                value={formData.disasterDate}
                onChange={handleInputChange}
                max={formData.accidentDate ? formData.accidentDate.slice(0, 10) : undefined}
              />
              <p className="field-hint">미입력 시 사고 발생 일시의 날짜가 사용됩니다.</p>
            </div>

            <div className="form-group">
              <label htmlFor="disasterPlace">재해 발생 장소</label>
              <input
                type="text"
                id="disasterPlace"
                name="disasterPlace"
                value={formData.disasterPlace}
                onChange={handleInputChange}
                placeholder="예: 지하 2층 타워크레인 설치 구간"
              />
              <p className="field-hint">미입력 시 위의 ‘사고 발생 장소’가 사용됩니다.</p>
            </div>
          </div>

          <div className="form-group">
            <label>재해 상황도 (선택)</label>
            <SituationDiagram
              value={situationDiagram}
              onChange={setSituationDiagram}
              /* 사고 발생일을 입력하면 상황도에 재해 발생일이 함께 표시됩니다. (item 1) */
              disasterDate={formData.disasterDate || formData.accidentDate}
            />
          </div>

          <div className="form-group">
            <label htmlFor="situationNote">상황 설명 (선택)</label>
            <textarea
              id="situationNote"
              name="situationNote"
              value={formData.situationNote}
              onChange={handleInputChange}
              rows={2}
              placeholder="상황도의 기호·표시에 대한 보충 설명 (예: 붉은 화살표 = 추락 방향)"
            />
          </div>
        </div>

        {/* 사고 경위 */}
        <div className="form-group">
          <label htmlFor="description">사고 경위 *</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={4}
            placeholder="사고가 발생한 경위를 상세히 기술해주세요"
            required
          />
        </div>

        {/* 사고 원인 */}
        <div className="form-group">
          <label htmlFor="cause">사고 원인 *</label>
          <textarea
            id="cause"
            name="cause"
            value={formData.cause}
            onChange={handleInputChange}
            rows={3}
            placeholder="사고 발생의 근본 원인을 분석해주세요"
            required
          />
        </div>

        {/* 재발 방지 대책 */}
        <div className="form-group">
          <label htmlFor="preventiveMeasures">재발 방지 대책 *</label>
          <textarea
            id="preventiveMeasures"
            name="preventiveMeasures"
            value={formData.preventiveMeasures}
            onChange={handleInputChange}
            rows={3}
            placeholder="동일한 사고를 예방하기 위한 대책을 제안해주세요"
            required
          />
        </div>

        {/* 사고원인 및 대책 보고서 (서식 FWP-006) */}
        <div className="form-section">
          <h3 className="form-section-title">📋 사고원인 및 대책 보고서 (서식 FWP-006)</h3>
          <p className="form-section-desc">
            회사 서식 ‘사고원인 및 대책 보고서’에 함께 출력되는 항목입니다.
          </p>

          <div className="form-group">
            <label htmlFor="actionTaken">조치 사항 (선택)</label>
            <textarea
              id="actionTaken"
              name="actionTaken"
              value={formData.actionTaken}
              onChange={handleInputChange}
              rows={4}
              placeholder={
                '시간 순서대로 조치한 내용을 입력해주세요.\n예)\n- 15시00분 이서진 대리와 함께 자차로 인천메트로경도의원으로 이동\n- 15시30분 삼성 이대훈 프로 보고(원청 TBM시 삼성 구역별 팀장에게 보고)'
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="relatedNotes">관련원부 — 안전관리팀장 현장방문 확인내용 (선택)</label>
            <textarea
              id="relatedNotes"
              name="relatedNotes"
              value={formData.relatedNotes}
              onChange={handleInputChange}
              rows={3}
              placeholder={
                '예)\n1. 금일 출역인원 현장소장 1명, 관리자 3명, SHOP 1명, 근로자 7명 총 12명 확인\n2. 안전관리자(피해자) 근로자 작업지시 및 현장관리 중임'
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="relatedEtc">관련원부 — 기타 (선택)</label>
            <textarea
              id="relatedEtc"
              name="relatedEtc"
              value={formData.relatedEtc}
              onChange={handleInputChange}
              rows={3}
              placeholder={
                '예)\n4. 3일 뒤 재방문 후 부상정도 및 치료소견 파악됨\n5. 전 현장에 전도와 관련하여 공유/예방 활동을 진행하겠음'
              }
            />
          </div>

          {/* 서명란 — 직책을 자유롭게 추가·삭제 */}
          <div className="form-group">
            <label>서명란 (선택)</label>
            <p className="field-hint">
              보고서 서명란에 인쇄할 직책을 추가하거나 삭제할 수 있습니다. 인쇄 후 수기로
              서명합니다.
            </p>
            <SignerEditor value={signers} onChange={setSigners} />
          </div>
        </div>

        {/* 첨부서류 및 체크란 (item 3) */}
        <div className="form-section">
          <h3 className="form-section-title">📎 첨부서류 및 체크란</h3>
          <p className="form-section-desc">
            확보한 서류를 체크하고, 파일이 있으면 함께 첨부해주세요. 첨부한 파일은 이 사고사례에
            보관되며 언제든 내려받을 수 있습니다.
          </p>

          <div className="acf-checks">
            <label className="acf-check">
              <input
                type="checkbox"
                checked={docLaborContract}
                onChange={e => setDocLaborContract(e.target.checked)}
              />
              <span>근로계약서</span>
            </label>
            <label className="acf-check">
              <input
                type="checkbox"
                checked={docMedicalOpinion}
                onChange={e => setDocMedicalOpinion(e.target.checked)}
              />
              <span>진단서 및 의사소견서</span>
            </label>
          </div>

          <div className="acf-files">
            <div className="acf-files-head">
              <strong className="acf-files-title">첨부파일 ({attachments.length}개)</strong>
              <button
                type="button"
                className="btn btn-sm acf-file-add"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                {uploadingFile ? '첨부 중...' : '+ 파일 첨부'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="acf-file-input"
                onChange={handleAttachmentUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.hwpx,.jpg,.jpeg,.png,.gif,.webp,.zip,.txt"
              />
            </div>

            {attachments.length === 0 ? (
              <p className="acf-files-empty">
                첨부된 파일이 없습니다. (PDF · HWP · 이미지 등, 파일당 최대{' '}
                {formatFileSize(MAX_FILE_SIZE)})
              </p>
            ) : (
              <ul className="acf-file-list">
                {attachments.map(att => (
                  <li key={att.id} className="acf-file-item">
                    <span className="acf-file-name" title={att.name}>
                      📄 {att.name}
                    </span>
                    <span className="acf-file-size">{formatFileSize(att.size)}</span>
                    <button
                      type="button"
                      className="btn btn-xs acf-file-dl"
                      onClick={() => downloadAttachment(att)}
                    >
                      내려받기
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs acf-file-del"
                      onClick={() => removeAttachment(att)}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 목격자 진술서 */}
        <div className="form-section">
          <h3 className="form-section-title">👥 목격자 진술서</h3>
          <p className="form-section-desc">
            사고를 목격한 사람이 있다면 진술을 기록해주세요. 등록한 진술서는 사고보고서에 함께
            인쇄됩니다.
          </p>
          <WitnessEditor value={witnesses} onChange={setWitnesses} />
        </div>

        {/* 보고자 정보 */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="reporterName">보고자 성명 *</label>
            <input
              type="text"
              id="reporterName"
              name="reporterName"
              value={formData.reporterName}
              onChange={handleInputChange}
              placeholder="홍길동"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reporterPhone">보고자 연락처 *</label>
            <input
              type="tel"
              id="reporterPhone"
              name="reporterPhone"
              value={formData.reporterPhone}
              onChange={handleInputChange}
              placeholder="010-0000-0000"
              required
            />
          </div>
        </div>

        {/* 제출 버튼 */}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-draft"
            onClick={handleSaveDraft}
            title="작성 중인 내용을 저장해 두고 나중에 이어서 작성합니다."
          >
            💾 임시저장
          </button>
          <button
            type="button"
            className="btn btn-draft-load"
            onClick={() => setDraftOpen(true)}
            title="임시저장해 둔 사고사례를 불러와 이어서 작성합니다."
          >
            📂 불러오기{draftCount > 0 ? ` (${draftCount})` : ''}
          </button>
          <button
            type="button"
            className="btn btn-preview"
            onClick={openPreview}
            title="지금까지 입력한 내용을 회사 서식(A4)으로 미리 봅니다."
          >
            👁️ 미리보기 (A4)
          </button>
          <button type="submit" className="btn btn-primary">
            {buttonLabel}
          </button>
        </div>

        {draftNotice && (
          <p className="acf-draft-notice" role="status">
            💾 {draftNotice}
          </p>
        )}

        {/* 안내사항 */}
        <div className="info-box">
          <h4>📋 안내사항</h4>
          <ul>
            <li>제출하신 사고사례는 안전관리팀에서 검토합니다</li>
            <li>재발 방지 대책 수립 및 전 현장 공유에 활용됩니다</li>
            <li>개인정보는 사고 조사 목적으로만 사용됩니다</li>
            <li>사진은 최대 5개까지 첨부 가능하며, 각 파일당 5MB 이하여야 합니다</li>
          </ul>
        </div>
      </form>

      {/* ---------- 미리보기 (회사 서식 A4) ---------- */}
      {previewCase && (
        <AccidentReport accident={previewCase} onClose={() => setPreviewCase(null)} />
      )}

      {/* ---------- 임시저장 불러오기 ---------- */}
      {draftOpen && (
        <AccidentDraftDialog
          siteId={lockSite ? formData.siteId : undefined}
          onClose={() => setDraftOpen(false)}
          onOpen={openDraft}
        />
      )}
    </div>
  );
};

export default AccidentCaseForm;
