import React, { useEffect, useRef, useState } from 'react';
import { deleteFile, generateStorageKey, getFile, putFile } from '../utils/documentStorage';

interface SignaturePadProps {
  /** IndexedDB 서명 이미지 키 ('' = 미서명) */
  signatureKey: string;
  /** 서명 확정 시각 (ISO) */
  signedAt: string;
  /** 서명 변경 */
  onChange: (patch: { signatureKey: string; signedAt: string }) => void;
  /** 편집 중인지 (false 면 서명 이미지만 표시) */
  editing: boolean;
  /** 접근성 라벨 (예: "김구보 서명") */
  label: string;
}

/**
 * 손글씨 서명 칸
 *
 * 칸을 누르면 서명 패드가 열리고, 손가락(또는 마우스)으로 사인합니다.
 * 확정하면 PNG 로 만들어 **IndexedDB** 에 저장하고 키만 LocalStorage 에 남깁니다.
 * (사진과 같은 방식 — LocalStorage 5MB 한계를 피합니다)
 *
 * 인쇄할 때는 서명 이미지가 그대로 종이에 찍힙니다.
 */
const SignaturePad: React.FC<SignaturePadProps> = ({
  signatureKey,
  signedAt,
  onChange,
  editing,
  label,
}) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [empty, setEmpty] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const pendingDelete = useRef<string | null>(null);

  /* 저장된 서명 이미지 불러오기 */
  useEffect(() => {
    let cancelled = false;
    let createdUrl = '';

    if (!signatureKey) {
      setUrl('');
      return;
    }

    void (async () => {
      try {
        const blob = await getFile(signatureKey);
        if (!blob) return;
        createdUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(createdUrl);
      } catch {
        /* 읽기 실패 시 빈 칸으로 둡니다. */
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [signatureKey]);

  /* 패드가 열릴 때 캔버스 초기화 (고해상도 대응) */
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';

    setEmpty(true);
    setError('');
  }, [open]);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointOf(e);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    const from = last.current;
    if (!ctx || !from) return;

    const to = pointOf(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    last.current = to;
    setEmpty(false);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drawing.current = false;
    last.current = null;
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setEmpty(true);
    setError('');
  };

  /** 서명 확정 → PNG → IndexedDB */
  const confirm = () => {
    if (empty) {
      setError('서명을 먼저 그려주세요.');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    setError('');

    canvas.toBlob(
      async blob => {
        if (!blob) {
          setBusy(false);
          setError('서명을 저장하지 못했습니다. 다시 시도해주세요.');
          return;
        }
        try {
          const key = generateStorageKey('signature.png');
          await putFile(key, blob);
          /* 이전 서명 파일은 교체 후 정리 대상으로 둡니다. */
          if (signatureKey) pendingDelete.current = signatureKey;
          onChange({ signatureKey: key, signedAt: new Date().toISOString() });
          setOpen(false);
        } catch {
          setError('서명을 저장하지 못했습니다. 다시 시도해주세요.');
        } finally {
          setBusy(false);
        }
      },
      'image/png',
      1,
    );
  };

  /** 서명 지우기 */
  const removeSignature = () => {
    if (signatureKey) pendingDelete.current = signatureKey;
    onChange({ signatureKey: '', signedAt: '' });
  };

  /* 교체·삭제된 이전 서명 파일을 IndexedDB 에서 정리합니다. */
  useEffect(() => {
    const old = pendingDelete.current;
    if (!old || old === signatureKey) return;
    pendingDelete.current = null;
    void deleteFile(old).catch(() => {
      /* 파일이 이미 없어도 무시합니다. */
    });
  }, [signatureKey]);

  return (
    <>
      <div className="rf-sign-cell">
        {url ? (
          <img className="rf-sign-img" src={url} alt={label} />
        ) : (
          <span className="rf-sign-empty">{editing ? '' : ''}</span>
        )}

        {editing && (
          <div className="rf-sign-actions">
            <button type="button" className="rf-sign-btn" onClick={() => setOpen(true)}>
              {url ? '다시' : '서명'}
            </button>
            {url && (
              <button
                type="button"
                className="rf-sign-btn rf-sign-btn-del"
                onClick={removeSignature}
                title="서명 지우기"
              >
                지움
              </button>
            )}
          </div>
        )}

        {/* 서명 시각은 화면에서만 참고용으로 보여주고 인쇄에는 넣지 않습니다. */}
        {signedAt && editing && (
          <span className="rf-sign-time">
            {new Date(signedAt).toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {open && (
        <div
          className="rf-sign-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 입력`}
        >
          <div className="rf-sign-modal">
            <div className="rf-sign-modal-head">
              <h4 className="rf-sign-modal-title">✍️ 서명 입력</h4>
              <p className="rf-sign-modal-sub">
                아래 칸에 손가락(휴대폰) 또는 마우스로 서명해 주세요.
              </p>
            </div>

            <canvas
              ref={canvasRef}
              className="rf-sign-canvas"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />

            {error && <p className="rf-sign-error">⚠️ {error}</p>}

            <div className="rf-sign-modal-foot">
              <button type="button" className="btn btn-sm" onClick={clearPad}>
                지우기
              </button>
              <div className="rf-sign-modal-right">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={confirm}
                  disabled={busy}
                >
                  {busy ? '저장 중…' : '서명 확정'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SignaturePad;
