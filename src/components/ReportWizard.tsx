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
import {
  createEmptyMeetingAttendee,
  createEmptyWorkScheduleRow,
  ensureBundle,
  saveBundle,
} from '../utils/reportBundleStorage';
import { isAuthenticated } from '../utils/auth';
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
}

/**
 * 수시 위험성평가 작성 마법사
 *
 * 회사 양식을 **한곳에서 위에서 아래로 이어서** 작성·확인합니다.
 *   ① 수시 위험성평가 등록부 (SCM-002-1.01)
 *   ② 위험성평가 상등급 관리  (5페이지)
 *   ③ 안전 회의록             (6페이지)
 *   ④ 참석자 명단             (7페이지)
 *   ⑤ 사진대지                (3·4페이지)
 *   ⑥ 공사 공정표             (A4 가로)
 *   ⑦ 안전보건 일정           (9페이지)
 *   ⑧ 부속 서식 첨부          (10~13페이지 — 일일 재해 有·無 확인현황)
 *   ⑨ 댓글
 *
 * ⚠️ 보기 방식은 **이어 보기 한 가지**입니다. 여덟 개 서식이 위에서 아래로
 *    끊김 없이 이어지고, 맨 마지막에 댓글이 붙습니다.
 *    (모든 서식이 DOM 에 살아 있어 입력한 내용이 사라지지 않습니다)
 *
 * ⚠️ **수정 잠금** — 게시글로 등록되면 서식은 곧바로 잠깁니다.
 *    내용을 고치려면 오른쪽 아래 **[✏️ 수정]** 을 눌러 잠금을 풀어야 합니다.
 *    (실수로 등록된 글을 건드리는 것을 막기 위함입니다)
 */
const STEPS: StepMeta[] = [
  { short: '등록부', label: '수시 위험성평가 등록부' },
  { short: '상등급', label: '위험성평가 상등급 관리' },
  { short: '회의록', label: '안전 회의록' },
  { short: '참석자', label: '참석자 명단' },
  { short: '사진대지', label: '사진대지' },
  { short: '공정표', label: '공사 공정표' },
  { short: '일정', label: '안전보건 일정' },
  { short: '부속서식', label: '부속 서식 첨부 — 일일 재해 有·無 확인현황' },
];

const ReportWizard: React.FC<ReportWizardProps> = ({ siteId, siteName, assessmentId, onClose }) => {
  const canManage = isAuthenticated();

  const [bundle, setBundle] = useState<ReportBundle>(() =>
    ensureBundle(assessmentId, siteId, siteName),
  );
  const [savedAt, setSavedAt] = useState('');
  const [notice, setNotice] = useState('');
  /* 저장 후 단계 배지(✅)를 다시 계산하기 위한 갱신 카운터 */
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  const registered = Boolean(bundle.registeredAt);

  /**
   * 수정 잠금 해제 여부
   *
   *  - 새로 작성하는 글(미등록): 처음부터 열려 있습니다.
   *  - 이미 게시글에 등록된 글 : 잠긴 상태로 열리고, [✏️ 수정]을 눌러야 풀립니다.
   */
  const [unlocked, setUnlocked] = useState(() => !bundle.registeredAt);
  /** 지금 서식을 고칠 수 있는지 */
  const editable = unlocked;

  /* ---------------- 저장 ---------------- */
  const save = useCallback(() => {
    saveBundle(bundle);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setNotice('');
    bump();
  }, [bundle]);

  /** 수정을 마치고 다시 잠급니다. (저장 후 읽기 전용으로) */
  const finishEdit = () => {
    saveBundle(bundle);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setUnlocked(false);
    setNotice('수정한 내용을 저장하고 다시 잠갔습니다. 고치려면 [✏️ 수정]을 누르세요.');
    bump();
  };

  /* ---------------- 게시글 등록 ---------------- */
  const register = () => {
    const now = new Date().toISOString();
    const next: ReportBundle = { ...bundle, registeredAt: bundle.registeredAt ?? now };
    saveBundle(next);
    setBundle(next);
    /* 등록과 동시에 잠급니다 — 등록된 글은 [✏️ 수정] 전까지 고칠 수 없습니다. */
    setUnlocked(false);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setNotice(
      next.registeredAt === now
        ? '게시판에 등록되었습니다. 고치려면 [✏️ 수정]을 누르세요.'
        : '등록 내용을 갱신했습니다. 고치려면 [✏️ 수정]을 누르세요.',
    );
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

  /** 회의록 참석자 한 명 추가 (맨 뒤에 붙입니다) */
  const addMeetingAttendee = () =>
    setBundle(b => ({
      ...b,
      meeting: {
        ...b.meeting,
        attendees: [...b.meeting.attendees, createEmptyMeetingAttendee()],
      },
    }));

  /** 회의록 참석자 한 명 삭제 (최소 1명은 남깁니다) */
  const removeMeetingAttendee = (id: string) =>
    setBundle(b => {
      if (b.meeting.attendees.length <= 1) return b;
      return {
        ...b,
        meeting: {
          ...b.meeting,
          attendees: b.meeting.attendees.filter(a => a.id !== id),
        },
      };
    });

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

  return (
    <div className="rw">
      {/* ---------- 머리글 ---------- */}
      <div className="rw-chrome">
        <div className="rw-head">
          <div className="rw-head-text">
            <h3 className="rw-title">🧾 수시 위험성평가 작성</h3>
            <p className="rw-sub">
              회사 양식 {STEPS.length}종을 <b>위에서 아래로 이어서</b> 작성합니다. 맨 마지막에
              댓글을 남길 수 있고, 한 번에 인쇄할 수 있습니다.
            </p>
          </div>
          <div className="rw-head-right">
            {registered && <span className="rw-badge rw-badge-done">✅ 등록됨</span>}
            {registered && !unlocked && (
              <span className="rw-badge rw-badge-lock">🔒 읽기 전용</span>
            )}
            {editable && registered && <span className="rw-badge rw-badge-edit">✏️ 수정 중</span>}
            <span className="rw-count">서식 {STEPS.length}개</span>
            <button className="btn btn-sm rw-btn-back" onClick={onClose}>
              ← 목록
            </button>
          </div>
        </div>

        {/* ---------- 안내 ---------- */}
        <div className="rw-current">
          <span className="rw-current-title">📜 이어 보기</span>
          <span className="rw-current-hint">
            {editable
              ? '여덟 개 서식을 위에서 아래로 이어서 작성합니다. 다 쓰면 [📝 게시글 등록]을 누르세요.'
              : '등록된 글을 위에서 아래로 이어서 봅니다. 고치려면 오른쪽 아래 [✏️ 수정]을 누르세요.'}
          </span>
        </div>

        {savedAt && <p className="rw-saved">💾 저장되었습니다 ({savedAt})</p>}
        {notice && <p className="rw-notice">{notice}</p>}
      </div>

      {/* ---------- 서식 (여덟 개 모두 펼쳐서 위에서 아래로) ---------- */}
      <div className="rw-body">
        <div className="rw-pane" data-step="register">
          <p className="rw-flow-label">1. 수시 위험성평가 등록부</p>
          <RiskAssessment
            siteId={siteId}
            siteName={siteName}
            initialId={assessmentId}
            startEditInitially={!registered}
            readOnly={!editable}
            embedded
          />
        </div>

        <div className="rw-pane" data-step="high">
          <p className="rw-flow-label">2. 위험성평가 상등급 관리</p>
          <HighGradeControl
            siteId={siteId}
            siteName={siteName}
            autoEdit={!registered}
            readOnly={!editable}
            embedded
          />
        </div>

        <div className="rw-pane" data-step="meeting">
          <p className="rw-flow-label">3. 안전 회의록</p>
          <MeetingMinutesForm
            value={bundle.meeting}
            editing={editable}
            onChange={patchMeeting}
            onAttendeeChange={patchMeetingAttendee}
            onAttendeeAdd={addMeetingAttendee}
            onAttendeeRemove={removeMeetingAttendee}
          />
        </div>

        <div className="rw-pane" data-step="attendees">
          <p className="rw-flow-label">4. 참석자 명단</p>
          <AttendeeListForm
            value={bundle.attendees}
            editing={editable}
            siteName={siteName}
            onChange={patchAttendees}
            onEntryChange={patchAttendeeEntry}
          />
        </div>

        <div className="rw-pane" data-step="photo">
          <p className="rw-flow-label">5. 사진대지</p>
          <div className="rw-photo-stack">
            <p className="rw-sub-head">① 위험성평가 회의 사진대지 (3페이지)</p>
            <PhotoSheetForm
              value={bundle.photoSheets[0]}
              editing={editable}
              siteName={siteName}
              onChange={patch => patchPhotoSheet(0, patch)}
              onItemChange={(id, patch) => patchPhotoItem(0, id, patch)}
            />
            <p className="rw-sub-head">② 모니터링 안전점검 사진대지 (4페이지)</p>
            <PhotoSheetForm
              value={bundle.photoSheets[1]}
              editing={editable}
              siteName={siteName}
              onChange={patch => patchPhotoSheet(1, patch)}
              onItemChange={(id, patch) => patchPhotoItem(1, id, patch)}
            />
          </div>
        </div>

        <div className="rw-pane" data-step="work">
          <p className="rw-flow-label">6. 공사 공정표</p>
          <WorkScheduleForm
            value={bundle.workSchedule}
            editing={editable}
            siteName={siteName}
            onChange={patchWorkSchedule}
            onRowChange={patchWorkRow}
            onAddRow={addWorkRow}
            onRemoveRow={removeWorkRow}
          />
        </div>

        <div className="rw-pane" data-step="schedule">
          <p className="rw-flow-label">7. 안전보건 일정</p>
          <SafetyScheduleForm
            value={bundle.schedule}
            editing={editable}
            siteName={siteName}
            onChange={patchSchedule}
            onNoteChange={setScheduleNote}
          />
        </div>

        <div className="rw-pane" data-step="attach">
          <p className="rw-flow-label">8. 부속 서식 첨부 — 일일 재해 有·無 확인현황</p>
          <DailyDisasterForm
            siteId={siteId}
            siteName={siteName}
            readOnly={!editable || !canManage}
          />
        </div>
      </div>

      {/* ---------- 맨 마지막: 댓글 ---------- */}
      {registered ? (
        <CommentBox targetType="assessment" targetId={assessmentId} siteId={siteId} />
      ) : (
        <p className="rw-comment-hint">💬 댓글은 [📝 게시글 등록] 후에 남길 수 있습니다.</p>
      )}

      {/* ---------- 하단 잠금 / 등록 / 인쇄 ---------- */}
      <div className="rw-nav">
        <div className="rw-nav-left">
          <span className="rw-flow-hint">
            {registered && !unlocked
              ? '🔒 등록된 글입니다. 내용을 고치려면 [✏️ 수정]을 누르세요.'
              : '✏️ 수정 중입니다. 다 고쳤으면 [💾 저장] 또는 [🔒 수정 완료]를 누르세요.'}
          </span>
        </div>

        <div className="rw-nav-right">
          {/* 잠겨 있을 때만 보이는 수정 버튼 */}
          {registered && !unlocked && canManage && (
            <button
              className="btn btn-sm btn-primary rw-btn-edit"
              onClick={() => {
                setUnlocked(true);
                setNotice('');
              }}
            >
              ✏️ 수정
            </button>
          )}

          {/* 수정 중일 때만 보이는 저장 / 등록 / 잠금 */}
          {editable && (
            <>
              <button className="btn btn-sm rw-btn-save" onClick={save}>
                💾 저장
              </button>
              <button className="btn btn-sm rw-btn-register" onClick={register}>
                {registered ? '🔄 등록 갱신' : '📝 게시글 등록'}
              </button>
              {registered && (
                <button className="btn btn-sm rw-btn-lock" onClick={finishEdit}>
                  🔒 수정 완료
                </button>
              )}
            </>
          )}

          <button className="btn btn-sm btn-primary rw-btn-print" onClick={printAll}>
            🖨️ 전체 출력
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportWizard;
