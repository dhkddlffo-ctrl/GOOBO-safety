import React, { useState, useEffect, useRef } from 'react';
import {
  SiteSafetyPolicy as SafetyPolicyData,
  SiteSafetyPolicyPlanRow,
  SiteSafetyPolicyEvalItem,
  PolicyDocKind,
  PolicyPaper,
  POLICY_CHECK_CYCLES,
} from '../types';
import {
  getSafetyPolicy,
  saveSafetyPolicy,
  koreanOrdinal,
  formatPolicyDate,
  createPlanRow,
  createEvalItem,
  sumEvalWeight,
  sumEvalScore,
  evalRate,
} from '../utils/safetyPolicyStorage';
import { putFile, getFile, deleteFile, generateStorageKey } from '../utils/documentStorage';
import { isAuthenticated } from '../utils/auth';
import './SiteSafetyPolicy.css';

interface SiteSafetyPolicyProps {
  siteId: number;
  siteName: string;
  /** 현장 기본정보의 현장소장 성명 (서명 기본값) */
  siteManager?: string;
}

const MAX_SEAL_SIZE = 3 * 1024 * 1024; // 3MB

/** 문서 탭 정의 */
const DOC_TABS: { kind: PolicyDocKind; label: string; desc: string }[] = [
  { kind: 'policy', label: '경영방침', desc: '방침 · 목표 · 세부추진계획' },
  { kind: 'plan', label: '세부추진계획표', desc: '관리담당 · 점검주기 · 점검방법' },
  { kind: 'eval', label: '성과평가표', desc: '배점 · 실적 · 획득점수' },
];

const docTitle = (data: SafetyPolicyData, kind: PolicyDocKind): string => {
  if (kind === 'plan') return '현장소장 안전보건경영 방침 및 목표에 따른 세부추진계획표';
  if (kind === 'eval') return '현장소장 안전보건경영 성과평가표';
  return data.title || '현장소장 안전보건 경영방침';
};

/** 점검주기 선택지 (저장된 값이 목록에 없으면 함께 노출) */
const cycleOptions = (current: string): string[] => {
  const list: string[] = [...POLICY_CHECK_CYCLES];
  if (current && !list.includes(current)) list.push(current);
  return list;
};

/**
 * 현장별 현장소장 안전보건 경영방침 (3종 문서)
 *
 * 1) 경영방침   — 회사 서식(표제 · 방침 · 목표 · 세부추진계획 · 서명)
 * 2) 세부추진계획표 — 방침·목표에 따른 추진계획별 관리담당 / 점검주기 / 점검방법 / 목표
 * 3) 성과평가표    — 평가항목별 성과지표 / 측정방법 / 배점 / 실적 / 획득점수 (합계 · 달성률)
 *
 * 문서마다 인쇄 용지(A4 / A3)를 따로 지정할 수 있고, 화면에 보이는 문서가 그대로 출력됩니다.
 */
const SiteSafetyPolicy: React.FC<SiteSafetyPolicyProps> = ({ siteId, siteName, siteManager }) => {
  const [policy, setPolicy] = useState<SafetyPolicyData>(() => getSafetyPolicy(siteId, siteName));
  const [docKind, setDocKind] = useState<PolicyDocKind>('policy');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SafetyPolicyData | null>(null);
  const [error, setError] = useState('');
  const [sealUrl, setSealUrl] = useState('');
  const [sealUploading, setSealUploading] = useState(false);
  const sealInputRef = useRef<HTMLInputElement>(null);

  const canManage = isAuthenticated();
  const current = editing && draft ? draft : policy;
  const paper: PolicyPaper = current.paper[docKind];

  /* 현장 변경 시 다시 읽기 */
  useEffect(() => {
    setPolicy(getSafetyPolicy(siteId, siteName));
    setEditing(false);
    setDraft(null);
    setError('');
  }, [siteId, siteName]);

  /* 도장 이미지 불러오기 */
  useEffect(() => {
    let revoked = '';
    let cancelled = false;

    const load = async () => {
      if (!policy.sealImageKey) {
        setSealUrl('');
        return;
      }
      const blob = await getFile(policy.sealImageKey);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setSealUrl(url);
    };
    load();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [policy.sealImageKey]);

  /* ---------------- 인쇄 용지 ---------------- */
  const changePaper = (next: PolicyPaper) => {
    const nextPolicy: SafetyPolicyData = {
      ...policy,
      paper: { ...policy.paper, [docKind]: next },
    };
    saveSafetyPolicy(nextPolicy);
    setPolicy(nextPolicy);
    setDraft(d => (d ? { ...d, paper: { ...d.paper, [docKind]: next } } : d));
  };

  /* ---------------- 편집 ---------------- */
  const startEdit = () => {
    if (!canManage) {
      alert('경영방침 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    /* 서명 성명이 비어 있으면 현장소장 성명을 기본값으로 채워 둡니다. */
    const base = { ...policy };
    if (!base.signerName && siteManager) base.signerName = siteManager;
    setDraft(base);
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
    setError('');
  };

  const saveEdit = () => {
    if (!draft) return;
    if (docKind === 'policy' && !draft.statement.trim() && !draft.goal.trim()) {
      setError('안전보건 방침 또는 목표를 입력해주세요.');
      return;
    }

    /* 빈 줄(입력하지 않은 행)은 저장하지 않습니다. */
    const cleaned: SafetyPolicyData = {
      ...draft,
      statement: draft.statement.trim(),
      goal: draft.goal.trim(),
      actionPlans: draft.actionPlans.map(p => p.trim()).filter(Boolean),
      planRows: draft.planRows
        .map(row => ({
          ...row,
          plan: row.plan.trim(),
          owner: row.owner.trim(),
          cycle: row.cycle.trim(),
          method: row.method.trim(),
          target: row.target.trim(),
          note: row.note.trim(),
        }))
        .filter(row => row.plan || row.owner || row.method || row.target || row.note),
      evalItems: draft.evalItems
        .map(item => ({
          ...item,
          item: item.item.trim(),
          indicator: item.indicator.trim(),
          method: item.method.trim(),
          result: item.result.trim(),
          note: item.note.trim(),
        }))
        .filter(item => item.item || item.indicator || item.method || item.result || item.weight),
      evalTerm: draft.evalTerm.trim(),
      evalNote: draft.evalNote.trim(),
    };
    saveSafetyPolicy(cleaned);
    setPolicy(getSafetyPolicy(siteId, siteName));
    setEditing(false);
    setDraft(null);
    setError('');
  };

  const setField = <K extends keyof SafetyPolicyData>(key: K, value: SafetyPolicyData[K]) => {
    setDraft(d => (d ? { ...d, [key]: value } : d));
  };

  /* ---------------- 세부추진계획 (경영방침 본문) ---------------- */
  const setPlan = (index: number, value: string) => {
    setDraft(d => {
      if (!d) return d;
      const next = [...d.actionPlans];
      next[index] = value;
      return { ...d, actionPlans: next };
    });
  };

  const addPlan = () => {
    setDraft(d => (d ? { ...d, actionPlans: [...d.actionPlans, ''] } : d));
  };

  const removePlan = (index: number) => {
    setDraft(d => {
      if (!d) return d;
      return { ...d, actionPlans: d.actionPlans.filter((_, i) => i !== index) };
    });
  };

  const movePlan = (index: number, direction: -1 | 1) => {
    setDraft(d => {
      if (!d) return d;
      const target = index + direction;
      if (target < 0 || target >= d.actionPlans.length) return d;
      const next = [...d.actionPlans];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, actionPlans: next };
    });
  };

  /* ---------------- 세부추진계획표 ---------------- */
  const updatePlanRow = (index: number, patch: Partial<SiteSafetyPolicyPlanRow>) => {
    setDraft(d => {
      if (!d) return d;
      return {
        ...d,
        planRows: d.planRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      };
    });
  };

  const addPlanRow = () => {
    setDraft(d => (d ? { ...d, planRows: [...d.planRows, createPlanRow()] } : d));
  };

  const removePlanRow = (index: number) => {
    setDraft(d => {
      if (!d) return d;
      return { ...d, planRows: d.planRows.filter((_, i) => i !== index) };
    });
  };

  const movePlanRow = (index: number, direction: -1 | 1) => {
    setDraft(d => {
      if (!d) return d;
      const target = index + direction;
      if (target < 0 || target >= d.planRows.length) return d;
      const next = [...d.planRows];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, planRows: next };
    });
  };

  /* ---------------- 성과평가표 ---------------- */
  const updateEvalItem = (index: number, patch: Partial<SiteSafetyPolicyEvalItem>) => {
    setDraft(d => {
      if (!d) return d;
      return {
        ...d,
        evalItems: d.evalItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      };
    });
  };

  const addEvalItem = () => {
    setDraft(d => (d ? { ...d, evalItems: [...d.evalItems, createEvalItem()] } : d));
  };

  const removeEvalItem = (index: number) => {
    setDraft(d => {
      if (!d) return d;
      return { ...d, evalItems: d.evalItems.filter((_, i) => i !== index) };
    });
  };

  const moveEvalItem = (index: number, direction: -1 | 1) => {
    setDraft(d => {
      if (!d) return d;
      const target = index + direction;
      if (target < 0 || target >= d.evalItems.length) return d;
      const next = [...d.evalItems];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, evalItems: next };
    });
  };

  /* ---------------- 도장 이미지 ---------------- */
  const handleSealUpload = async (fileList: FileList | null) => {
    const file = fileList && fileList[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('도장·서명은 이미지 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_SEAL_SIZE) {
      setError('도장·서명 이미지는 3MB 이하만 올릴 수 있습니다.');
      return;
    }

    setSealUploading(true);
    setError('');
    try {
      const key = generateStorageKey(file.name || 'seal.png');
      await putFile(key, file);
      /* 편집 중 기존 도장이 있으면 새 파일로 교체합니다. */
      const previous = draft?.sealImageKey;
      if (previous && previous !== key) {
        await deleteFile(previous).catch(() => undefined);
      }
      setDraft(d => (d ? { ...d, sealImageKey: key } : d));
    } catch {
      setError('도장 이미지를 올리지 못했습니다.');
    } finally {
      setSealUploading(false);
    }
  };

  const removeSeal = async () => {
    if (!draft?.sealImageKey) return;
    if (!confirm('등록한 도장·서명 이미지를 삭제하시겠습니까?')) return;
    await deleteFile(draft.sealImageKey).catch(() => undefined);
    setDraft(d => (d ? { ...d, sealImageKey: undefined } : d));
  };

  /* ---------------- 인쇄 ---------------- */
  const handlePrint = () => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    window.print();
  };

  /* ---------------- 공통 조각 ---------------- */
  const signBlock = (data: SafetyPolicyData, seal: string) => (
    <div className="sp-sign">
      <span className="sp-sign-date">{formatPolicyDate(data.declaredAt)}</span>
      <span className="sp-sign-role">
        {data.signerTitle || '현장소장'}
        <strong className="sp-sign-name">{data.signerName || ''}</strong>
      </span>
      {seal ? (
        <img className="sp-sign-seal" src={seal} alt="도장" />
      ) : (
        <span className="sp-sign-mark">(인)</span>
      )}
    </div>
  );

  const sheetClass = (kind: PolicyDocKind) => {
    const p = current.paper[kind];
    return `sp-sheet${p === 'A3' ? ' is-a3' : ' is-a4'}`;
  };

  /* ---------------- 서식 1 : 경영방침 ---------------- */
  const policySheet = (data: SafetyPolicyData, seal: string) => {
    const plans = data.actionPlans.filter(p => p.trim());
    return (
      <div className={sheetClass('policy')}>
        <div className="sp-title-box">
          <h1 className="sp-title">{docTitle(data, 'policy')}</h1>
        </div>

        <div className="sp-body-box">
          <section className="sp-block">
            <h2 className="sp-h">안전보건 방침</h2>
            <p className="sp-line">- {data.statement || '내용을 입력해주세요.'}</p>
          </section>

          <section className="sp-block">
            <h2 className="sp-h">안전보건 목표</h2>
            <p className="sp-line">- {data.goal || '내용을 입력해주세요.'}</p>
          </section>

          <section className="sp-block sp-block-plan">
            <h2 className="sp-h">세부추진계획</h2>
            {plans.length === 0 ? (
              <p className="sp-line">내용을 입력해주세요.</p>
            ) : (
              plans.map((plan, index) => (
                <p key={index} className="sp-plan">
                  <span className="sp-plan-no">{koreanOrdinal(index)}</span>
                  <span className="sp-plan-colon"> : </span>
                  <span className="sp-plan-text">{plan}</span>
                </p>
              ))
            )}
          </section>

          {signBlock(data, seal)}
        </div>

        <div className="sp-foot">{data.siteName}</div>
      </div>
    );
  };

  /* ---------------- 서식 2 : 세부추진계획표 ---------------- */
  const planSheet = (data: SafetyPolicyData, seal: string) => {
    const rows = data.planRows;
    return (
      <div className={`${sheetClass('plan')} sp-sheet-table`}>
        <div className="sp-title-box">
          <h1 className="sp-title sp-title--long">{docTitle(data, 'plan')}</h1>
        </div>

        <div className="sp-body-box sp-body-table">
          <div className="sp-meta">
            <span>현장명 : {data.siteName}</span>
            <span>시행일 : {formatPolicyDate(data.declaredAt) || '-'}</span>
          </div>

          <section className="sp-block sp-block-summary">
            <p className="sp-line">- 안전보건 방침 : {data.statement || '-'}</p>
            <p className="sp-line">- 안전보건 목표 : {data.goal || '-'}</p>
          </section>

          <div className="sp-table-scroll">
            <table className="sp-table sp-table-plan">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>연번</th>
                  <th>추진계획</th>
                  <th>관리담당</th>
                  <th>점검주기</th>
                  <th>점검방법</th>
                  <th>목표</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="sp-td-center" colSpan={7}>
                      등록된 세부추진계획이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="sp-td-num">{index + 1}</td>
                      <td>{row.plan}</td>
                      <td className="sp-td-center">{row.owner}</td>
                      <td className="sp-td-center">{row.cycle}</td>
                      <td>{row.method}</td>
                      <td>{row.target}</td>
                      <td className="sp-td-center">{row.note}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {signBlock(data, seal)}
        </div>

        <div className="sp-foot">{data.siteName}</div>
      </div>
    );
  };

  /* ---------------- 서식 3 : 성과평가표 ---------------- */
  const evalSheet = (data: SafetyPolicyData, seal: string) => {
    const items = data.evalItems;
    return (
      <div className={`${sheetClass('eval')} sp-sheet-table`}>
        <div className="sp-title-box">
          <h1 className="sp-title sp-title--long">{docTitle(data, 'eval')}</h1>
        </div>

        <div className="sp-body-box sp-body-table">
          <div className="sp-meta">
            <span>현장명 : {data.siteName}</span>
            <span>평가기간 : {data.evalTerm || '-'}</span>
          </div>

          <div className="sp-table-scroll">
            <table className="sp-table sp-table-eval">
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>연번</th>
                  <th>평가항목</th>
                  <th>성과지표</th>
                  <th>측정방법</th>
                  <th>배점</th>
                  <th>실적</th>
                  <th>획득점수</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="sp-td-center" colSpan={8}>
                      등록된 평가항목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="sp-td-num">{index + 1}</td>
                      <td>{item.item}</td>
                      <td>{item.indicator}</td>
                      <td>{item.method}</td>
                      <td className="sp-td-center">{item.weight}</td>
                      <td>{item.result}</td>
                      <td className="sp-td-center">{item.score}</td>
                      <td className="sp-td-center">{item.note}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sp-td-center" colSpan={4}>
                    합 계 (달성률 {evalRate(items)}%)
                  </td>
                  <td className="sp-td-center">{sumEvalWeight(items)}</td>
                  <td className="sp-td-center">-</td>
                  <td className="sp-td-center">{sumEvalScore(items)}</td>
                  <td className="sp-td-center">{evalRate(items)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="sp-eval-note">
            <p className="sp-line">- 종합의견 : {data.evalNote || '　'}</p>
          </div>

          {signBlock(data, seal)}
        </div>

        <div className="sp-foot">{data.siteName}</div>
      </div>
    );
  };

  const sheet = (data: SafetyPolicyData, seal: string) => {
    if (docKind === 'plan') return planSheet(data, seal);
    if (docKind === 'eval') return evalSheet(data, seal);
    return policySheet(data, seal);
  };

  /* ---------------- 공통 서명 편집 ---------------- */
  const signEditor = (d: SafetyPolicyData) => (
    <>
      <div className="sp-field-row">
        <div className="sp-field">
          <label>시행일</label>
          <input
            type="date"
            value={d.declaredAt}
            onChange={e => setField('declaredAt', e.target.value)}
          />
        </div>
        <div className="sp-field">
          <label>서명 직책</label>
          <input
            type="text"
            value={d.signerTitle}
            onChange={e => setField('signerTitle', e.target.value)}
            placeholder="현장소장"
          />
        </div>
        <div className="sp-field">
          <label>서명 성명</label>
          <input
            type="text"
            value={d.signerName}
            onChange={e => setField('signerName', e.target.value)}
            placeholder="예) 홍길동"
          />
        </div>
      </div>

      <div className="sp-field">
        <label>
          도장 · 서명 이미지 <span className="sp-label-opt">(선택)</span>
        </label>
        <div className="sp-seal-row">
          {d.sealImageKey ? (
            <span className="sp-seal-on">도장 이미지 등록됨</span>
          ) : (
            <span className="sp-seal-off">등록된 도장 이미지가 없습니다.</span>
          )}
          <label className={`sp-seal-add${sealUploading ? ' is-busy' : ''}`}>
            {sealUploading ? '올리는 중…' : d.sealImageKey ? '교체' : '＋ 이미지 올리기'}
            <input
              ref={sealInputRef}
              type="file"
              accept="image/*"
              disabled={sealUploading}
              onChange={e => {
                void handleSealUpload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          {d.sealImageKey && (
            <button type="button" className="sp-seal-remove" onClick={() => void removeSeal()}>
              삭제
            </button>
          )}
        </div>
        <p className="sp-hint">
          이미지를 올리지 않으면 서식에 <strong>(인)</strong> 표기만 남습니다. 도장이 있는 경우
          스캔·촬영한 이미지를 올려주세요. (3MB 이하)
        </p>
      </div>
    </>
  );

  /* ---------------- 편집 : 경영방침 ---------------- */
  const policyEditor = (d: SafetyPolicyData) => (
    <>
      <div className="sp-field">
        <label>표제</label>
        <input
          type="text"
          value={d.title}
          onChange={e => setField('title', e.target.value)}
          placeholder="현장소장 안전보건 경영방침"
        />
      </div>

      <div className="sp-field">
        <label>안전보건 방침</label>
        <textarea
          rows={2}
          value={d.statement}
          onChange={e => setField('statement', e.target.value)}
          placeholder="예) 적극적인 사고방식으로 전 인원이 참여하는 안전 실현"
        />
      </div>

      <div className="sp-field">
        <label>안전보건 목표</label>
        <textarea
          rows={2}
          value={d.goal}
          onChange={e => setField('goal', e.target.value)}
          placeholder="예) 참여하는 안전으로 무재해 현장 달성"
        />
      </div>

      <div className="sp-field">
        <label>세부추진계획</label>
        <div className="sp-plan-editor">
          {d.actionPlans.map((plan, index) => (
            <div key={index} className="sp-plan-row">
              <span className="sp-plan-row-no">{koreanOrdinal(index)}</span>
              <input
                type="text"
                value={plan}
                onChange={e => setPlan(index, e.target.value)}
                placeholder="추진계획을 입력하세요"
              />
              <button
                type="button"
                className="sp-row-btn"
                onClick={() => movePlan(index, -1)}
                disabled={index === 0}
                title="위로"
              >
                ↑
              </button>
              <button
                type="button"
                className="sp-row-btn"
                onClick={() => movePlan(index, 1)}
                disabled={index === d.actionPlans.length - 1}
                title="아래로"
              >
                ↓
              </button>
              <button
                type="button"
                className="sp-row-btn danger"
                onClick={() => removePlan(index)}
                title="삭제"
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="sp-add-plan" onClick={addPlan}>
            ＋ 추진계획 추가
          </button>
        </div>
      </div>

      {signEditor(d)}
    </>
  );

  /* ---------------- 편집 : 세부추진계획표 ---------------- */
  const planEditor = (d: SafetyPolicyData) => (
    <>
      <p className="sp-hint sp-hint-top">
        방침·목표 문구는 <strong>경영방침</strong> 문서에서 수정합니다. 표의 행을 추가·삭제하며
        관리담당과 점검주기를 지정하세요.
      </p>

      <div className="sp-table-scroll">
        <table className="sp-table sp-table-edit">
          <thead>
            <tr>
              <th className="sp-col-no">연번</th>
              <th>추진계획</th>
              <th className="sp-col-owner">관리담당</th>
              <th className="sp-col-cycle">점검주기</th>
              <th>점검방법</th>
              <th>목표</th>
              <th className="sp-col-note">비고</th>
              <th className="sp-col-act">관리</th>
            </tr>
          </thead>
          <tbody>
            {d.planRows.map((row, index) => (
              <tr key={row.id}>
                <td className="sp-td-num">{index + 1}</td>
                <td>
                  <textarea
                    className="sp-cell-area"
                    rows={2}
                    value={row.plan}
                    onChange={e => updatePlanRow(index, { plan: e.target.value })}
                    placeholder="추진계획"
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={row.owner}
                    onChange={e => updatePlanRow(index, { owner: e.target.value })}
                    placeholder="관리담당"
                  />
                </td>
                <td>
                  <select
                    className="sp-cell-select"
                    value={row.cycle}
                    onChange={e => updatePlanRow(index, { cycle: e.target.value })}
                  >
                    {cycleOptions(row.cycle).map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    className="sp-cell-area"
                    rows={2}
                    value={row.method}
                    onChange={e => updatePlanRow(index, { method: e.target.value })}
                    placeholder="점검방법"
                  />
                </td>
                <td>
                  <textarea
                    className="sp-cell-area"
                    rows={2}
                    value={row.target}
                    onChange={e => updatePlanRow(index, { target: e.target.value })}
                    placeholder="목표"
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={row.note}
                    onChange={e => updatePlanRow(index, { note: e.target.value })}
                    placeholder="비고"
                  />
                </td>
                <td>
                  <div className="sp-row-actions">
                    <button
                      type="button"
                      className="sp-row-btn sm"
                      onClick={() => movePlanRow(index, -1)}
                      disabled={index === 0}
                      title="위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sp-row-btn sm"
                      onClick={() => movePlanRow(index, 1)}
                      disabled={index === d.planRows.length - 1}
                      title="아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="sp-row-btn sm danger"
                      onClick={() => removePlanRow(index)}
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="sp-add-plan" onClick={addPlanRow}>
        ＋ 추진계획 행 추가
      </button>

      {signEditor(d)}
    </>
  );

  /* ---------------- 편집 : 성과평가표 ---------------- */
  const evalEditor = (d: SafetyPolicyData) => (
    <>
      <div className="sp-field">
        <label>평가기간</label>
        <input
          type="text"
          value={d.evalTerm}
          onChange={e => setField('evalTerm', e.target.value)}
          placeholder="예) 2026년 상반기 (2026.01.01 ~ 2026.06.30)"
        />
      </div>

      <div className="sp-table-scroll">
        <table className="sp-table sp-table-edit">
          <thead>
            <tr>
              <th className="sp-col-no">연번</th>
              <th>평가항목</th>
              <th>성과지표</th>
              <th>측정방법</th>
              <th className="sp-col-weight">배점</th>
              <th>실적</th>
              <th className="sp-col-weight">획득점수</th>
              <th className="sp-col-note">비고</th>
              <th className="sp-col-act">관리</th>
            </tr>
          </thead>
          <tbody>
            {d.evalItems.map((item, index) => (
              <tr key={item.id}>
                <td className="sp-td-num">{index + 1}</td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={item.item}
                    onChange={e => updateEvalItem(index, { item: e.target.value })}
                    placeholder="평가항목"
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={item.indicator}
                    onChange={e => updateEvalItem(index, { indicator: e.target.value })}
                    placeholder="성과지표"
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={item.method}
                    onChange={e => updateEvalItem(index, { method: e.target.value })}
                    placeholder="측정방법"
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-num"
                    type="number"
                    min={0}
                    value={item.weight}
                    onChange={e => updateEvalItem(index, { weight: Number(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={item.result}
                    onChange={e => updateEvalItem(index, { result: e.target.value })}
                    placeholder="실적"
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-num"
                    type="number"
                    min={0}
                    value={item.score}
                    onChange={e => updateEvalItem(index, { score: Number(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    className="sp-cell-input"
                    type="text"
                    value={item.note}
                    onChange={e => updateEvalItem(index, { note: e.target.value })}
                    placeholder="비고"
                  />
                </td>
                <td>
                  <div className="sp-row-actions">
                    <button
                      type="button"
                      className="sp-row-btn sm"
                      onClick={() => moveEvalItem(index, -1)}
                      disabled={index === 0}
                      title="위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sp-row-btn sm"
                      onClick={() => moveEvalItem(index, 1)}
                      disabled={index === d.evalItems.length - 1}
                      title="아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="sp-row-btn sm danger"
                      onClick={() => removeEvalItem(index)}
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sp-td-center" colSpan={4}>
                합 계
              </td>
              <td className="sp-td-center">{sumEvalWeight(d.evalItems)}</td>
              <td className="sp-td-center">-</td>
              <td className="sp-td-center">{sumEvalScore(d.evalItems)}</td>
              <td className="sp-td-center">{evalRate(d.evalItems)}%</td>
              <td className="sp-td-center">-</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button type="button" className="sp-add-plan" onClick={addEvalItem}>
        ＋ 평가항목 행 추가
      </button>

      <div className="sp-field sp-field-note">
        <label>종합의견</label>
        <textarea
          rows={3}
          value={d.evalNote}
          onChange={e => setField('evalNote', e.target.value)}
          placeholder="예) 전 항목 목표를 달성하였으며, 개인안전장구 착용률 향상을 위해 지속 지도 예정"
        />
      </div>

      {signEditor(d)}
    </>
  );

  const editor = (d: SafetyPolicyData) => {
    if (docKind === 'plan') return planEditor(d);
    if (docKind === 'eval') return evalEditor(d);
    return policyEditor(d);
  };

  /* ---------------- 렌더 ---------------- */
  return (
    <div className="sp-wrap">
      {/* 툴바 (인쇄 시 숨김) */}
      <div className="sp-toolbar">
        <div className="sp-toolbar-info">
          <strong>현장소장 안전보건 경영방침</strong>
          <span className="sp-toolbar-sub">
            {editing
              ? '내용을 고친 뒤 저장하세요.'
              : '문서별로 A4 · A3 용지를 선택해 출력할 수 있습니다.'}
          </span>
        </div>
        <div className="sp-toolbar-actions">
          {!editing ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={startEdit}>
                수정
              </button>
              <button className="btn btn-primary btn-sm" onClick={handlePrint}>
                인쇄 / PDF 저장
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                취소
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                저장
              </button>
            </>
          )}
        </div>
      </div>

      {/* 문서 선택 + 용지 선택 (인쇄 시 숨김) */}
      <div className="sp-docbar">
        <div className="sp-docs" role="tablist" aria-label="경영방침 문서 선택">
          {DOC_TABS.map(tab => (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              aria-selected={docKind === tab.kind}
              className={`sp-doc-tab${docKind === tab.kind ? ' is-active' : ''}`}
              onClick={() => setDocKind(tab.kind)}
            >
              <span className="sp-doc-tab-label">{tab.label}</span>
              <span className="sp-doc-tab-desc">{tab.desc}</span>
            </button>
          ))}
        </div>

        <div className="sp-paper">
          <span className="sp-paper-label">출력 용지</span>
          <div className="sp-paper-group">
            {(['A4', 'A3'] as PolicyPaper[]).map(size => (
              <button
                key={size}
                type="button"
                className={`sp-paper-btn${paper === size ? ' is-active' : ''}`}
                onClick={() => changePaper(size)}
                aria-pressed={paper === size}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="sp-error">{error}</div>}

      {!editing
        ? sheet(policy, sealUrl)
        : draft && <div className="sp-editor">{editor(draft)}</div>}

      {editing && (
        <div className="sp-editor-foot">
          <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
            취소
          </button>
          <button className="btn btn-primary btn-sm" onClick={saveEdit}>
            저장
          </button>
        </div>
      )}
    </div>
  );
};

export default SiteSafetyPolicy;
