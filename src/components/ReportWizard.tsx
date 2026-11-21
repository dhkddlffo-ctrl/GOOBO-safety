import React, { useCallback, useState } from 'react';
import {
  AttendeeList,
  AttendeeListEntry,
  MeetingAttendee,
  MeetingMinutes,
  PhotoSheet,
  PhotoSheetItem,
  ReportBundle,
  SafetySchedule,
  WorkSchedule,
  WorkScheduleRow,
} from '../types';
import { createEmptyWorkScheduleRow, ensureBundle, saveBundle } from '../utils/reportBundleStorage';
import RiskAssessment from './RiskAssessment';
import HighGradeControl from './HighGradeControl';
import MeetingMinutesForm from './MeetingMinutesForm';
import AttendeeListForm from './AttendeeListForm';
import PhotoSheetForm from './PhotoSheetForm';
import WorkScheduleForm from './WorkScheduleForm';
import SafetyScheduleForm from './SafetyScheduleForm';
import DailyDisasterForm from './DailyDisasterForm';
import CommentBox from './CommentBox';
import './ReportForms.css';
import './ReportWizard.css';

interface ReportWizardProps {
  siteId: number;
  siteName: string;
  /** 작성 대상 등록부 id */
  assessmentId: string;
  /** 게시판으로 돌아가기 */
  onClose: () => void;
}

interface StepMeta {
  short: string;
  label: string;
  hint: string;
}

/**
 * 수시 위험성평가 작성 마법사
 *
 * 회사 양식을 **한곳에서 순서대로** 작성합니다.
 *   ① 수시 위험성평가 등록부 (SCM-002-1.01)
 *   ② 위험성평가 상등급 관리  (5페이지)
 *   ③ 안전 회의록             (6페이지)
 *   ④ 참석자 명단             (7페이지)
 *   ⑤ 사진대지                (3·4페이지)
 *   ⑥ 공사 공정표             (A4 가로)
 *   ⑦ 안전보건 일정           (9페이지)
 *   ⑧ 부속 서식 첨부          (10~13페이지 — 일일 재해 有·無 확인현황)
 *
 * 다 쓰고 나면 **게시글 등록**(게시판에 올리기)과 **전체 출력**(한 번에 인쇄)을 합니다.
 *
 * ⚠️ 화면에서는 현재 단계만 보이지만, 모든 단계가 DOM 에 살아 있어
 *    단계를 오가도 입력한 내용이 사라지지 않습니다.
 *    인쇄할 때는 CSS 로 모든 단계를 펼쳐 서식을 순서대로 출력합니다.
 */
const STEPS: StepMeta[] = [
  {
    short: '등록부',
    label: '수시 위험성평가 등록부',
    hint: '강도·빈도를 고르면 평가합계와 등급이 자동 계산됩니다.',
  },
  {
    short: '상등급',
    label: '위험성평가 상등급 관리',
    hint: '등록부에서 평가등급 ‘상’ 항목을 불러와 실천·완료를 확인합니다.',
  },
  {
    short: '회의록',
    label: '안전 회의록',
    hint: '회의 내용과 참석자·결재란을 작성합니다.',
  },
  {
    short: '참석자',
    label: '참석자 명단',
    hint: '업체명·직종·성명·서명을 40칸까지 적을 수 있습니다.',
  },
  {
    short: '사진대지',
    label: '사진대지',
    hint: '회의 사진(3페이지)과 모니터링 점검 사진(4페이지)을 올립니다.',
  },
  {
    short: '공정표',
    label: '공사 공정표',
    hint: '공종별 작업 기간을 넣으면 일자 칸에 막대가 그려집니다.',
  },
  {
    short: '일정',
    label: '안전보건 일정',
    hint: '월 달력에 수시위험성평가·교육 일정을 적습니다.',
  },
  {
    short: '부속서식',
    label: '부속 서식 첨부 — 일일 재해 有·無 확인현황',
    hint: '양식 10~13페이지는 엑셀·한글로 작성해 파일 그대로 올려 보관합니다.',
  },
];

const ReportWizard: React.FC<ReportWizardProps> = ({ siteId, siteName, assessmentId, onClose }) => {
  const [step, setStep] = useState(0);
  /**
   * 보기 방식
   *  - 'step' : 단계별로 하나씩 (작성할 때)
   *  - 'flow' : 8단계 서식을 위에서 아래로 이어서 (확인할 때)
   */
  const [viewMode, setViewMode] = useState<'step' | 'flow'>('step');
  const [bundle, setBundle] = useState<ReportBundle>(() =>
    ensureBundle(assessmentId, siteId, siteName),
  );
  const [savedAt, setSavedAt] = useState('');
  const [notice, setNotice] = useState('');
  /* 저장 후 단계 배지(✅)를 다시 계산하기 위한 갱신 카운터 */
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  const registered = Boolean(bundle.registeredAt);

  /* ---------------- 저장 ---------------- */
  const save = useCallback(() => {
    saveBundle(bundle);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setNotice('');
    bump();
  }, [bundle]);

  /* ---------------- 게시글 등록 ---------------- */
  const register = () => {
    const now = new Date().toISOString();
    const next: ReportBundle = { ...bundle, registeredAt: bundle.registeredAt ?? now };
    saveBundle(next);
    setBundle(next);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setNotice('게시판에 등록되었습니다.');
    bump();
  };

  /* ---------------- 전체 출력 ---------------- */
  const printAll = () => {
    saveBundle(bundle);
    setNotice('저장 후 인쇄합니다. 인쇄 대화상자에서 여백을 “기본”으로 두세요.');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  /* ---------------- 묶음 갱신 헬퍼 ---------------- */
  const patchMeeting = (patch: Partial<MeetingMinutes>) =>
    setBundle(b => ({ ...b, meeting: { ...b.meeting, ...patch } }));

  const patchMeetingAttendee = (id: string, patch: Partial<MeetingAttendee>) =>
    setBundle(b => ({
      ...b,
      meeting: {
        ...b.meeting,
        attendees: b.meeting.attendees.map(a => (a.id === id ? { ...a, ...patch } : a)),
      },
    }));

  const patchAttendees = (patch: Partial<AttendeeList>) =>
    setBundle(b => ({ ...b, attendees: { ...b.attendees, ...patch } }));

  const patchAttendeeEntry = (id: string, patch: Partial<AttendeeListEntry>) =>
    setBundle(b => ({
      ...b,
      attendees: {
        ...b.attendees,
        entries: b.attendees.entries.map(e => (e.id === id ? { ...e, ...patch } : e)),
      },
    }));

  const patchPhotoSheet = (index: number, patch: Partial<PhotoSheet>) =>
    setBundle(b => ({
      ...b,
      photoSheets: b.photoSheets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  const patchPhotoItem = (index: number, id: string, patch: Partial<PhotoSheetItem>) =>
    setBundle(b => ({
      ...b,
      photoSheets: b.photoSheets.map((s, i) =>
        i === index
          ? { ...s, items: s.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }
          : s,
      ),
    }));

  const patchWorkSchedule = (patch: Partial<WorkSchedule>) =>
    setBundle(b => ({ ...b, workSchedule: { ...b.workSchedule, ...patch } }));

  const patchWorkRow = (id: string, patch: Partial<WorkScheduleRow>) =>
    setBundle(b => ({
      ...b,
      workSchedule: {
        ...b.workSchedule,
        rows: b.workSchedule.rows.map(r => (r.id === id ? { ...r, ...patch } : r)),
      },
    }));

  const addWorkRow = () =>
    setBundle(b => ({
      ...b,
      workSchedule: {
        ...b.workSchedule,
        rows: [...b.workSchedule.rows, createEmptyWorkScheduleRow()],
      },
    }));

  /* 마지막 남은 한 줄은 지우지 않습니다. (빈 서식이 되어 버립니다) */
  const removeWorkRow = (id: string) =>
    setBundle(b => {
      if (b.workSchedule.rows.length <= 1) return b;
      return {
        ...b,
        workSchedule: {
          ...b.workSchedule,
          rows: b.workSchedule.rows.filter(r => r.id !== id),
        },
      };
    });

  const patchSchedule = (patch: Partial<SafetySchedule>) =>
    setBundle(b => ({ ...b, schedule: { ...b.schedule, ...patch } }));

  const setScheduleNote = (date: string, text: string) =>
    setBundle(b => ({
      ...b,
      schedule: { ...b.schedule, notes: { ...b.schedule.notes, [date]: text } },
    }));

  /* ---------------- 단계 이동 ---------------- */
  const goStep = (next: number) => {
    if (next < 0 || next >= STEPS.length) return;
    setStep(next);
    /* 단계를 직접 고르면 단계별 보기로 돌아갑니다. */
    setViewMode('step');
    setNotice('');
  };

  const active = STEPS[step];
  const flow = viewMode === 'flow';

  /**
   * 단계 칸의 클래스.
   *  - 단계별 보기: 지금 단계만 보이고 나머지는 숨김
   *  - 이어 보기  : 여덟 단계를 모두 보여줍니다(위에서 아래로)
   */
  const paneCls = (index: number) => `rw-pane${flow || step === index ? '' : ' rw-pane--off'}`;

  return (
    <div className="rw">
      {/* ---------- 머리글 ---------- */}
      <div className="rw-chrome">
        <div className="rw-head">
          <div className="rw-head-text">
            <h3 className="rw-title">🧾 수시 위험성평가 작성</h3>
            <p className="rw-sub">
              회사 양식 {STEPS.length}종을 <b>한곳에서 순서대로</b> 작성합니다. 다 쓰고 나면
              게시판에 등록하고 한 번에 인쇄할 수 있습니다.
            </p>
          </div>
          <div className="rw-head-right">
            {registered && <span className="rw-badge rw-badge-done">✅ 등록됨</span>}
            <span className="rw-count">
              {flow ? `전체 ${STEPS.length}개 서식` : `${step + 1} / ${STEPS.length} 단계`}
            </span>
            <button
              type="button"
              className={`btn btn-sm rw-btn-mode${flow ? ' active' : ''}`}
              onClick={() => {
                setViewMode(flow ? 'step' : 'flow');
                setNotice('');
              }}
              title={
                flow
                  ? '단계별로 하나씩 보기로 돌아갑니다.'
                  : '서식 8개를 위에서 아래로 이어서 봅니다.'
              }
            >
              {flow ? '📑 단계별 보기' : '📜 이어 보기'}
            </button>
            <button className="btn btn-sm rw-btn-back" onClick={onClose}>
              ← 목록
            </button>
          </div>
        </div>

        {/* ---------- 단계 표시 (이어 보기일 때는 숨김) ---------- */}
        {!flow && (
          <nav className="rw-steps" aria-label="작성 단계">
            {STEPS.map((meta, index) => (
              <button
                type="button"
                key={meta.short}
                className={`rw-step-btn${index === step ? ' active' : ''}${
                  index < step ? ' passed' : ''
                }`}
                onClick={() => goStep(index)}
                aria-current={index === step ? 'step' : undefined}
              >
                <span className="rw-step-no">{index + 1}</span>
                <span className="rw-step-label">{meta.short}</span>
              </button>
            ))}
          </nav>
        )}

        {/* ---------- 현재 단계 안내 ---------- */}
        {flow ? (
          <div className="rw-current">
            <span className="rw-current-title">📜 전체 서식 이어 보기</span>
            <span className="rw-current-hint">
              여덟 개 서식을 위에서 아래로 이어서 봅니다. 아래로 내려가며 확인하세요.
            </span>
          </div>
        ) : (
          <div className="rw-current">
            <span className="rw-current-title">
              {step + 1}. {active.label}
            </span>
            <span className="rw-current-hint">{active.hint}</span>
          </div>
        )}

        {savedAt && <p className="rw-saved">💾 저장되었습니다 ({savedAt})</p>}
        {notice && <p className="rw-notice">{notice}</p>}
      </div>

      {/* ---------- 서식 (6단계 모두 마운트, 화면에선 현재 단계만) ---------- */}
      <div className="rw-body">
        <div className={paneCls(0)} data-step="register">
          {flow && <p className="rw-flow-label">1. 수시 위험성평가 등록부</p>}
          <RiskAssessment
            siteId={siteId}
            siteName={siteName}
            initialId={assessmentId}
            startEditInitially={!registered}
            embedded
          />
        </div>

        <div className={paneCls(1)} data-step="high">
          {flow && <p className="rw-flow-label">2. 위험성평가 상등급 관리</p>}
          <HighGradeControl siteId={siteId} siteName={siteName} autoEdit embedded />
        </div>

        <div className={paneCls(2)} data-step="meeting">
          {flow && <p className="rw-flow-label">3. 안전 회의록</p>}
          <MeetingMinutesForm
            value={bundle.meeting}
            editing
            onChange={patchMeeting}
            onAttendeeChange={patchMeetingAttendee}
          />
        </div>

        <div className={paneCls(3)} data-step="attendees">
          {flow && <p className="rw-flow-label">4. 참석자 명단</p>}
          <AttendeeListForm
            value={bundle.attendees}
            editing
            siteName={siteName}
            onChange={patchAttendees}
            onEntryChange={patchAttendeeEntry}
          />
        </div>

        <div className={paneCls(4)} data-step="photo">
          {flow && <p className="rw-flow-label">5. 사진대지</p>}
          <div className="rw-photo-stack">
            <p className="rw-sub-head">① 위험성평가 회의 사진대지 (3페이지)</p>
            <PhotoSheetForm
              value={bundle.photoSheets[0]}
              editing
              siteName={siteName}
              onChange={patch => patchPhotoSheet(0, patch)}
              onItemChange={(id, patch) => patchPhotoItem(0, id, patch)}
            />
            <p className="rw-sub-head">② 모니터링 안전점검 사진대지 (4페이지)</p>
            <PhotoSheetForm
              value={bundle.photoSheets[1]}
              editing
              siteName={siteName}
              onChange={patch => patchPhotoSheet(1, patch)}
              onItemChange={(id, patch) => patchPhotoItem(1, id, patch)}
            />
          </div>
        </div>

        <div className={paneCls(5)} data-step="work">
          {flow && <p className="rw-flow-label">6. 공사 공정표</p>}
          <WorkScheduleForm
            value={bundle.workSchedule}
            editing
            siteName={siteName}
            onChange={patchWorkSchedule}
            onRowChange={patchWorkRow}
            onAddRow={addWorkRow}
            onRemoveRow={removeWorkRow}
          />
        </div>

        <div className={paneCls(6)} data-step="schedule">
          {flow && <p className="rw-flow-label">7. 안전보건 일정</p>}
          <SafetyScheduleForm
            value={bundle.schedule}
            editing
            siteName={siteName}
            onChange={patchSchedule}
            onNoteChange={setScheduleNote}
          />
        </div>

        <div className={paneCls(7)} data-step="attach">
          {flow && <p className="rw-flow-label">8. 부속 서식 첨부 — 일일 재해 有·無 확인현황</p>}
          <DailyDisasterForm siteId={siteId} siteName={siteName} />
        </div>
      </div>

      {/* ---------- 댓글 (등록된 글에만) ---------- */}
      {registered && <CommentBox targetType="assessment" targetId={assessmentId} siteId={siteId} />}

      {/* ---------- 하단 이동 / 등록 / 인쇄 ---------- */}
      <div className="rw-nav">
        <div className="rw-nav-left">
          {flow ? (
            <span className="rw-flow-hint">📜 맨 위부터 아래로 이어서 보는 중입니다.</span>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => goStep(step - 1)} disabled={step === 0}>
                ← 이전
              </button>
              <button
                className="btn btn-sm"
                onClick={() => goStep(step + 1)}
                disabled={step === STEPS.length - 1}
              >
                다음 →
              </button>
            </>
          )}
        </div>

        <div className="rw-nav-right">
          <button className="btn btn-sm rw-btn-save" onClick={save}>
            💾 저장
          </button>
          <button className="btn btn-sm rw-btn-register" onClick={register}>
            {registered ? '🔄 등록 갱신' : '📝 게시글 등록'}
          </button>
          <button className="btn btn-sm btn-primary rw-btn-print" onClick={printAll}>
            🖨️ 전체 출력
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportWizard;
