import React from 'react';
import { MeetingAttendee, MeetingMinutes } from '../types';
import { MEETING_ATTENDEE_SLOTS } from '../utils/reportBundleStorage';
import SignaturePad from './SignaturePad';

interface MeetingMinutesFormProps {
  value: MeetingMinutes;
  editing: boolean;
  onChange: (patch: Partial<MeetingMinutes>) => void;
  onAttendeeChange: (id: string, patch: Partial<MeetingAttendee>) => void;
}

/**
 * 안전 회의록 (양식 SCM-02-2.00 / 6페이지 / A4 세로)
 *
 * 상단 결재란(작성·검토·승인) + 기본정보(제목·우선번호·회의일시·회의장소)
 * + 참석자 12칸(2열 × 6행) + 회의 내용 자유기술 + 별첨.
 */
const MeetingMinutesForm: React.FC<MeetingMinutesFormProps> = ({
  value,
  editing,
  onChange,
  onAttendeeChange,
}) => {
  /* 12칸을 6행 × 2열로 나눠서 그립니다. */
  const rows = Array.from({ length: MEETING_ATTENDEE_SLOTS / 2 }, (_, i) => [
    value.attendees[i * 2],
    value.attendees[i * 2 + 1],
  ]);

  const txt = (v: string) => <span className="rf-cell-text">{v}</span>;

  return (
    <section className="rf-sheet rf-sheet--portrait" aria-label="안전 회의록">
      <h2 className="rf-title rf-title--bordered">안 전 회 의 록</h2>

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

        {/* 참석자 */}
        <table className="rf-table">
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
            {rows.map((pair, rowIndex) => (
              <tr key={`mm-row-${rowIndex}`}>
                {rowIndex === 0 ? (
                  <td className="rf-c" rowSpan={rows.length}>
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
                            onChange={e =>
                              onAttendeeChange(person.id, { position: e.target.value })
                            }
                            placeholder="직위"
                          />
                        ) : (
                          <span className="rf-cell-text">{person.position}</span>
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="rf-in rf-c"
                            value={person.name}
                            onChange={e => onAttendeeChange(person.id, { name: e.target.value })}
                            placeholder="성명"
                          />
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

        {/* 회의 내용 */}
        <div className="rf-mm-body">
          {editing ? (
            <textarea
              value={value.content}
              onChange={e => onChange({ content: e.target.value })}
              placeholder={`회의 내용을 입력하세요.\n\n예시)\n1. 위험성평가 결과 공유\n2. 상등급(중점관리) 위험요인 개선조치 이행 확인\n3. 다음 2주 수시위험성평가 일정 협의`}
              aria-label="회의 내용"
            />
          ) : (
            <span className="rf-cell-text" style={{ whiteSpace: 'pre-wrap' }}>
              {value.content}
            </span>
          )}
        </div>

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

      <p className="rf-photo-note">양식 SCM-02-2.00 · A4(210x297) · 구보공영(주)</p>
    </section>
  );
};

export default MeetingMinutesForm;
