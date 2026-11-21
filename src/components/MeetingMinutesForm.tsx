import React from 'react';
import { MeetingAttendee, MeetingMinutes } from '../types';
import { MEETING_ATTENDEE_SLOTS } from '../utils/reportBundleStorage';
import SignaturePad from './SignaturePad';

interface MeetingMinutesFormProps {
  value: MeetingMinutes;
  editing: boolean;
  onChange: (patch: Partial<MeetingMinutes>) => void;
  onAttendeeChange: (id: string, patch: Partial<MeetingAttendee>) => void;
  /** 참석자 한 명 추가 */
  onAttendeeAdd: () => void;
  /** 참석자 한 명 삭제 */
  onAttendeeRemove: (id: string) => void;
}

/** 1장 본문에 담기는 줄 수 (위쪽 표·참석자 표가 자리를 차지합니다) */
const CONTENT_LINES_FIRST = 12;

/** 이어지는 장에 담기는 줄 수 */
const CONTENT_LINES_CONT = 26;

/** 참석자 한 장에 담기는 인원 (양식: 2열 × 6행) */
const ATTENDEES_PER_SHEET = MEETING_ATTENDEE_SLOTS;

/**
 * 회의 내용을 장 단위로 나눕니다. (줄 경계에서 자릅니다)
 *
 * 나눈 조각을 '\n' 으로 다시 이으면 원문과 똑같아지므로,
 * 몇 장으로 나뉘든 저장되는 값은 하나의 긴 문자열 그대로입니다.
 */
const splitContent = (text: string): string[] => {
  const lines = text.split('\n');
  if (lines.length <= CONTENT_LINES_FIRST) return [text];

  const chunks: string[] = [lines.slice(0, CONTENT_LINES_FIRST).join('\n')];
  for (let i = CONTENT_LINES_FIRST; i < lines.length; i += CONTENT_LINES_CONT) {
    chunks.push(lines.slice(i, i + CONTENT_LINES_CONT).join('\n'));
  }
  return chunks;
};

/** 줄 수 */
const lineCount = (text: string): number => text.split('\n').length;

/**
 * 안전 회의록 (양식 SCM-02-2.00 / 6페이지 / A4 세로)
 *
 * 상단 결재란(작성·검토·승인) + 기본정보(제목·우선번호·회의일시·회의장소)
 * + 참석자(2열) + 회의 내용 자유기술 + 별첨.
 *
 * ⚠️ 회의 내용이 길어지면 **1장에 다 담기지 않습니다.**
 *    그래서 내용을 줄 단위로 잘라, 넘치는 부분은 「(계속)」 장을 새로 만들어
 *    위에서 아래로 이어 붙입니다. 장이 늘어나도 인쇄는 한 장씩 나뉘어 나갑니다.
 *
 * ⚠️ 참석자는 **[＋ 참석자 추가] / [✕]** 로 늘리고 줄일 수 있습니다.
 *    한 장(12명)을 넘으면 참석자 「(계속)」 장이 자동으로 생깁니다.
 */
const MeetingMinutesForm: React.FC<MeetingMinutesFormProps> = ({
  value,
  editing,
  onChange,
  onAttendeeChange,
  onAttendeeAdd,
  onAttendeeRemove,
}) => {
  const txt = (v: string) => <span className="rf-cell-text">{v}</span>;

  /* ---------------- 회의 내용 장 나누기 ---------------- */
  const contentChunks = splitContent(value.content);

  /** k번째 조각을 고치면 전체 문자열을 다시 만들어 저장합니다. */
  const setContentChunk = (index: number, next: string) => {
    const chunks = [...contentChunks];
    chunks[index] = next;
    onChange({ content: chunks.join('\n') });
  };

  /** 조각의 textarea 높이 — 내용에 맞추되 장 크기를 넘지 않게 */
  const chunkRows = (chunk: string, isFirst: boolean) => {
    const budget = isFirst ? CONTENT_LINES_FIRST : CONTENT_LINES_CONT;
    return Math.max(6, Math.min(budget, lineCount(chunk) + 2));
  };

  const contentBox = (chunk: string, index: number, isFirst: boolean) => (
    <div className="rf-mm-body">
      {editing ? (
        <textarea
          value={chunk}
          onChange={e => setContentChunk(index, e.target.value)}
          rows={chunkRows(chunk, isFirst)}
          placeholder={
            isFirst
              ? `회의 내용을 입력하세요.\n\n예시)\n1. 위험성평가 결과 공유\n2. 상등급(중점관리) 위험요인 개선조치 이행 확인\n3. 다음 2주 수시위험성평가 일정 협의`
              : '앞 장에서 이어지는 회의 내용입니다.'
          }
          aria-label={isFirst ? '회의 내용' : `회의 내용 (${index + 1}장 계속)`}
        />
      ) : (
        <span className="rf-cell-text" style={{ whiteSpace: 'pre-wrap' }}>
          {chunk}
        </span>
      )}
    </div>
  );

  /* ---------------- 참석자 표 ---------------- */
  const attendeeTable = (people: MeetingAttendee[], showSideLabel: boolean) => {
    const pairs: (MeetingAttendee | undefined)[][] = [];
    for (let i = 0; i < people.length; i += 2) {
      pairs.push([people[i], people[i + 1]]);
    }

    return (
      <table className="rf-table rf-mm-att">
        <colgroup>
          <col style={{ width: '2.6rem' }} />
          <col style={{ width: '5rem' }} />
          <col />
          <col style={{ width: '5rem' }} />
          <col style={{ width: '5rem' }} />
          <col />
          <col style={{ width: '5rem' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>참석자</th>
            <th>직위</th>
            <th>성명</th>
            <th>서명</th>
            <th>직위</th>
            <th>성명</th>
            <th>서명</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, rowIndex) => (
            <tr key={`mm-row-${rowIndex}`}>
              {showSideLabel && rowIndex === 0 ? (
                <td className="rf-c" rowSpan={pairs.length}>
                  <span
                    className="rf-cell-text"
                    style={{
                      writingMode: 'vertical-rl',
                      letterSpacing: '0.35em',
                      fontWeight: 700,
                      margin: '0 auto',
                    }}
                  >
                    참석자
                  </span>
                </td>
              ) : null}
              {pair.map((person, colIndex) =>
                person ? (
                  <React.Fragment key={person.id}>
                    <td>
                      {editing ? (
                        <input
                          className="rf-in rf-c"
                          value={person.position}
                          onChange={e => onAttendeeChange(person.id, { position: e.target.value })}
                          placeholder="직위"
                        />
                      ) : (
                        <span className="rf-cell-text">{person.position}</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <span className="rf-mm-name">
                          <input
                            className="rf-in rf-c"
                            value={person.name}
                            onChange={e => onAttendeeChange(person.id, { name: e.target.value })}
                            placeholder="성명"
                          />
                          <button
                            type="button"
                            className="rf-mm-x"
                            onClick={() => onAttendeeRemove(person.id)}
                            title="이 참석자 삭제"
                            aria-label={`${person.name || '참석자'} 삭제`}
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <span className="rf-cell-text">{person.name}</span>
                      )}
                    </td>
                    <td className="rf-c-sign">
                      <SignaturePad
                        signatureKey={person.signatureKey}
                        signedAt={person.signedAt}
                        onChange={patch => onAttendeeChange(person.id, patch)}
                        editing={editing}
                        label={`${person.name || '참석자'} 서명`}
                      />
                    </td>
                  </React.Fragment>
                ) : (
                  <React.Fragment key={`empty-${rowIndex}-${colIndex}`}>
                    <td />
                    <td />
                    <td />
                  </React.Fragment>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  /* 첫 장에 들어가는 참석자(최대 12명)와, 넘치는 참석자를 12명씩 나눕니다. */
  const firstAttendees = value.attendees.slice(0, ATTENDEES_PER_SHEET);
  const extraAttendeeSheets: MeetingAttendee[][] = [];
  for (let i = ATTENDEES_PER_SHEET; i < value.attendees.length; i += ATTENDEES_PER_SHEET) {
    extraAttendeeSheets.push(value.attendees.slice(i, i + ATTENDEES_PER_SHEET));
  }

  return (
    <>
      {/* ================= 1장 ================= */}
      <section className="rf-sheet rf-sheet--portrait" aria-label="안전 회의록">
        <h2 className="rf-title rf-title--bordered">안 전 회 의 록</h2>

        {/* 화면에서만 보이는 참석자 도구 */}
        {editing && (
          <div className="rf-mm-tools">
            <span className="rf-mm-tools-hint">
              참석자 <b>{value.attendees.length}</b>명 · 한 장에 12명까지 들어갑니다.
            </span>
            <button type="button" className="rf-mm-add" onClick={onAttendeeAdd}>
              ＋ 참석자 추가
            </button>
          </div>
        )}

        <div className="rf-mm">
          <table className="rf-table">
            <colgroup>
              <col style={{ width: '4.2rem' }} />
              <col />
              <col style={{ width: '5rem' }} />
              <col style={{ width: '8rem' }} />
              <col style={{ width: '3rem' }} />
              <col style={{ width: '3.4rem' }} />
              <col style={{ width: '3.4rem' }} />
              <col style={{ width: '3.4rem' }} />
            </colgroup>
            <tbody>
              {/* 제목 / 우선번호 */}
              <tr>
                <th>제목</th>
                <td colSpan={2}>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={value.title}
                      onChange={e => onChange({ title: e.target.value })}
                      placeholder="회의 제목"
                    />
                  ) : (
                    txt(value.title)
                  )}
                </td>
                <th>우선번호</th>
                <td colSpan={4}>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={value.docNo}
                      onChange={e => onChange({ docNo: e.target.value })}
                      placeholder="문서번호"
                    />
                  ) : (
                    txt(value.docNo)
                  )}
                </td>
              </tr>

              {/* 회의일시 / 결재(작성·검토·승인) */}
              <tr>
                <th>회의일시</th>
                <td colSpan={2}>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={value.meetingAt}
                      onChange={e => onChange({ meetingAt: e.target.value })}
                      placeholder="2026-11-20 14:00"
                    />
                  ) : (
                    txt(value.meetingAt)
                  )}
                </td>
                <td className="rf-mm-approval-label" rowSpan={2}>
                  결재
                </td>
                <th>작성</th>
                <th>검토</th>
                <th>승인</th>
                <th />
              </tr>

              {/* 회의장소 */}
              <tr>
                <th>회의장소</th>
                <td colSpan={2}>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={value.place}
                      onChange={e => onChange({ place: e.target.value })}
                      placeholder="회의 장소"
                    />
                  ) : (
                    txt(value.place)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className="rf-in rf-c"
                      value={value.approval.writer}
                      onChange={e =>
                        onChange({ approval: { ...value.approval, writer: e.target.value } })
                      }
                      placeholder="성명"
                    />
                  ) : (
                    <span className="rf-cell-text">{value.approval.writer}</span>
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className="rf-in rf-c"
                      value={value.approval.reviewer}
                      onChange={e =>
                        onChange({ approval: { ...value.approval, reviewer: e.target.value } })
                      }
                      placeholder="성명"
                    />
                  ) : (
                    <span className="rf-cell-text">{value.approval.reviewer}</span>
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className="rf-in rf-c"
                      value={value.approval.approver}
                      onChange={e =>
                        onChange({ approval: { ...value.approval, approver: e.target.value } })
                      }
                      placeholder="성명"
                    />
                  ) : (
                    <span className="rf-cell-text">{value.approval.approver}</span>
                  )}
                </td>
                <td />
              </tr>
            </tbody>
          </table>

          {/* 참석자 (첫 장) */}
          {attendeeTable(firstAttendees, true)}

          {/* 회의 내용 (1장 분량) */}
          {contentBox(contentChunks[0] ?? '', 0, true)}

          {/* 별첨 */}
          <table className="rf-table">
            <colgroup>
              <col style={{ width: '2.6rem' }} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th>별첨</th>
                <td>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={value.remark}
                      onChange={e => onChange({ remark: e.target.value })}
                    />
                  ) : (
                    txt(value.remark)
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="rf-photo-note">
          양식 SCM-02-2.00 · A4(210x297) · 구보공영(주)
          {contentChunks.length > 1 && ` · 회의 내용 ${contentChunks.length}장`}
        </p>
      </section>

      {/* ================= 참석자 (계속) — 12명 초과 시 ================= */}
      {extraAttendeeSheets.map((group, sheetIndex) => (
        <section
          className="rf-sheet rf-sheet--portrait rf-mm-cont"
          aria-label={`안전 회의록 참석자 (계속 ${sheetIndex + 1})`}
          key={`mm-att-sheet-${sheetIndex}`}
        >
          <h2 className="rf-title rf-title--bordered">
            안 전 회 의 록 <span className="rf-mm-cont-tag">— 참석자 (계속)</span>
          </h2>
          <div className="rf-mm rf-mm--cont">{attendeeTable(group, false)}</div>
          <p className="rf-photo-note">양식 SCM-02-2.00 · A4(210x297) · 구보공영(주)</p>
        </section>
      ))}

      {/* ================= 회의 내용 (계속) — 1장을 넘길 때 ================= */}
      {contentChunks.slice(1).map((chunk, index) => (
        <section
          className="rf-sheet rf-sheet--portrait rf-mm-cont"
          aria-label={`안전 회의록 회의 내용 (계속 ${index + 1})`}
          key={`mm-content-sheet-${index}`}
        >
          <h2 className="rf-title rf-title--bordered">
            안 전 회 의 록 <span className="rf-mm-cont-tag">— 회의 내용 (계속)</span>
          </h2>
          <div className="rf-mm rf-mm--cont">{contentBox(chunk, index + 1, false)}</div>
          <p className="rf-photo-note">
            양식 SCM-02-2.00 · A4(210x297) · 구보공영(주) · {index + 2} / {contentChunks.length + 1}
            장
          </p>
        </section>
      ))}
    </>
  );
};

export default MeetingMinutesForm;
