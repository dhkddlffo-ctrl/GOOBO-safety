import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateKo, parseYmd } from '../utils/accidentReport';
import './SituationDiagram.css';

/** 캔버스 내부 해상도 (CSS 로 반응형 축소) */
const CANVAS_W = 900;
const CANVAS_H = 520;
const GRID = 20;
const GRID_BOLD = 100;

/** 재해 발생일 표시판 (고정 위치·고정 크기 → 다시 그려도 이전 표시를 완전히 덮습니다) */
const STAMP_W = 268;
const STAMP_H = 38;
const STAMP_MARGIN = 10;
const STAMP_X = CANVAS_W - STAMP_W - STAMP_MARGIN;
const STAMP_Y = STAMP_MARGIN;

type Tool = 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'text' | 'eraser';

const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: 'pen', label: '펜', icon: '✏️' },
  { key: 'line', label: '직선', icon: '╱' },
  { key: 'arrow', label: '화살표', icon: '↗' },
  { key: 'rect', label: '사각형', icon: '▭' },
  { key: 'circle', label: '원', icon: '◯' },
  { key: 'text', label: '글자', icon: 'A' },
  { key: 'eraser', label: '지우개', icon: '🧽' },
];

const COLORS = ['#111827', '#dc2626', '#2563eb', '#059669'];

const WIDTHS: { value: number; label: string }[] = [
  { value: 2, label: '얇게' },
  { value: 4, label: '보통' },
  { value: 8, label: '굵게' },
];

const FONT = "'Malgun Gothic', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif";

interface SituationDiagramProps {
  /** 현재 상황도 (PNG data URL). 없으면 빈 상태 */
  value?: string;
  /** 그리기 완료/초기화 시 호출 */
  onChange: (dataUrl: string) => void;
  /**
   * 재해 발생일 (yyyy-mm-dd · yyyy-mm-ddTHH:mm).
   * 사고 발생일을 입력하면 상황도 오른쪽 위에 재해 발생일이 함께 인쇄되도록
   * 이미지에 함께 그려 넣습니다.
   */
  disasterDate?: string;
}

/** '2026-11-25' / '2026-11-25T14:30' → '2026. 11. 25.' (형식이 아니면 '') */
const stampTextOf = (value?: string): string => {
  if (!value) return '';
  if (!parseYmd(value)) return '';
  return formatDateKo(value);
};

/**
 * 재해(사고) 상황도 작성기
 *
 * 1) 사진·도면 이미지를 첨부하면 캔버스 배경으로 깔립니다.
 * 2) 그 위에 펜·직선·화살표·도형·글자로 사고 지점을 표시합니다.
 * 3) 사고 발생일을 입력하면 상황도 오른쪽 위에 '재해 발생일'이 함께 그려집니다.
 * 결과는 PNG(data URL)로 저장되어 사고보고서에 그대로 인쇄됩니다.
 */
const SituationDiagram: React.FC<SituationDiagramProps> = ({ value, onChange, disasterDate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 다시 그리기를 위한 스냅샷 (도형 미리보기용) */
  const snapshotRef = useRef<ImageData | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  /** 실행 취소 스택 ('' = 빈 도화지) */
  const historyRef = useRef<string[]>(['']);
  /** 마지막으로 캔버스에 반영된 값 (부모 → 자식 동기화 판단용) */
  const appliedRef = useRef<string | undefined>(undefined);
  /** 캔버스에 현재 그려져 있는 재해 발생일 표시 ('' = 없음) */
  const stampedRef = useRef<string | undefined>(undefined);
  /** 첨부한 배경 이미지 (안내용) */
  const [backgroundName, setBackgroundName] = useState('');

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(WIDTHS[1].value);
  const [strokeCount, setStrokeCount] = useState(0);

  const stampText = stampTextOf(disasterDate);

  /* ---------------- 배경(모눈종이) ---------------- */
  const paintBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.strokeStyle = '#e9eef4';
    ctx.lineWidth = 1;
    for (let x = GRID; x < CANVAS_W; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CANVAS_H);
      ctx.stroke();
    }
    for (let y = GRID; y < CANVAS_H; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CANVAS_W, y + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = '#d5dee8';
    for (let x = GRID_BOLD; x < CANVAS_W; x += GRID_BOLD) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CANVAS_H);
      ctx.stroke();
    }
    for (let y = GRID_BOLD; y < CANVAS_H; y += GRID_BOLD) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CANVAS_W, y + 0.5);
      ctx.stroke();
    }
  }, []);

  /* ---------------- 재해 발생일 표시 ---------------- */
  /**
   * 오른쪽 위 고정 위치에 재해 발생일을 그립니다.
   * 위치·크기가 고정이므로 날짜가 바뀌어 다시 그려도 이전 표시가 완전히 덮입니다.
   * 날짜가 없으면 흰 사각형만 그려 이전 표시를 지웁니다.
   */
  const paintStamp = useCallback((ctx: CanvasRenderingContext2D, text: string) => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(STAMP_X, STAMP_Y, STAMP_W, STAMP_H);
    if (text) {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(STAMP_X + 0.8, STAMP_Y + 0.8, STAMP_W - 1.6, STAMP_H - 1.6);

      ctx.fillStyle = '#111827';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.font = `700 16px ${FONT}`;
      ctx.fillText('재해 발생일  ', STAMP_X + STAMP_W - 13, STAMP_Y + STAMP_H / 2 + 0.5);

      const labelWidth = ctx.measureText('재해 발생일  ').width;
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText(text, STAMP_X + STAMP_W - 13 - labelWidth, STAMP_Y + STAMP_H / 2 + 0.5);
    }
    ctx.restore();
  }, []);

  const resetCanvas = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    paintBackground(ctx);
  }, [paintBackground]);

  /* ---------------- 초기 렌더 + 외부 값 동기화 ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (value === appliedRef.current) return;
    appliedRef.current = value;

    if (!value) {
      paintBackground(ctx);
      /*
       * 빈 도화지: 사고 발생일이 이미 입력되어 있으면 바로 표시해 둡니다.
       * (그림을 그리기 전에도 상황도에 재해 발생일이 보이도록)
       */
      stampedRef.current = stampText;
      paintStamp(ctx, stampText);
      if (stampText) {
        const url = canvas.toDataURL('image/png');
        historyRef.current = [url];
        appliedRef.current = url;
        setStrokeCount(1);
        onChange(url);
      }
      return;
    }

    const img = new Image();
    img.onload = () => {
      paintBackground(ctx);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      /* 저장된 이미지에는 이미 표시가 함께 그려져 있습니다. */
      stampedRef.current = stampText;
    };
    img.src = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, paintBackground, paintStamp]);

  /* ---------------- 사고 발생일 변경 → 상황도에 다시 표시 ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (stampedRef.current === stampText) return;
    /* 아직 아무것도 그리지 않았고 날짜도 없으면 그릴 필요 없음 */
    if (!stampedRef.current && !stampText) return;

    stampedRef.current = stampText;
    paintStamp(ctx, stampText);

    const url = canvas.toDataURL('image/png');
    const h = historyRef.current;
    historyRef.current = h.length <= 1 ? [url] : [...h, url];
    appliedRef.current = url;
    setStrokeCount(historyRef.current.length - 1);
    onChange(url);
  }, [stampText, paintStamp, onChange]);

  /* ---------------- 좌표 변환 ---------------- */
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width === 0 ? 1 : CANVAS_W / rect.width;
    const sy = rect.height === 0 ? 1 : CANVAS_H / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * sx),
      y: Math.round((e.clientY - rect.top) * sy),
    };
  };

  const applyStrokeStyle = (ctx: CanvasRenderingContext2D, isEraser = false) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isEraser) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(lineWidth * 3, 12);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }
  };

  const drawArrowHead = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 8 + lineWidth * 2;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - size * Math.cos(angle - Math.PI / 7),
      y2 - size * Math.sin(angle - Math.PI / 7),
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - size * Math.cos(angle + Math.PI / 7),
      y2 - size * Math.sin(angle + Math.PI / 7),
    );
    ctx.stroke();
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    historyRef.current = [...historyRef.current, url];
    appliedRef.current = url;
    setStrokeCount(historyRef.current.length - 1);
    onChange(url);
  };

  /* ---------------- 사진/도면 첨부 ---------------- */
  const handleAttachImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG)만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('이미지는 10MB 이하만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const img = new Image();
      img.onload = () => {
        /* 비율을 유지하며 캔버스 안에 꽉 차게(contain) 배치 → 잘림 없음 */
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const x = Math.round((CANVAS_W - w) / 2);
        const y = Math.round((CANVAS_H - h) / 2);

        paintBackground(ctx);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(img, x, y, w, h);
        paintStamp(ctx, stampText);

        setBackgroundName(file.name);
        const url = canvas.toDataURL('image/png');
        /* 첨부 이미지는 배경이므로 이 상태부터 다시 실행 취소하도록 초기화 */
        historyRef.current = [url];
        appliedRef.current = url;
        setStrokeCount(1);
        onChange(url);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => alert('이미지를 읽지 못했습니다.');
    e.target.value = '';
  };

  const handleRemoveBackground = () => {
    if (!backgroundName) return;
    if (
      !window.confirm(
        '첨부한 사진/도면을 지우고 모눈종이로 되돌릴까요?\n그 위에 그린 표시도 함께 지워집니다.',
      )
    )
      return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    paintBackground(ctx);
    paintStamp(ctx, stampText);
    setBackgroundName('');
    const url = canvas.toDataURL('image/png');
    historyRef.current = [url];
    appliedRef.current = url;
    setStrokeCount(1);
    onChange(url);
  };

  /* ---------------- 포인터 이벤트 ---------------- */
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);

    if (tool === 'text') {
      const text = window.prompt('삽입할 글자를 입력하세요. (예: 추락 지점, 안전난간 없음)');
      if (!text || !text.trim()) return;
      ctx.fillStyle = color;
      ctx.font = `700 ${12 + lineWidth * 3}px ${FONT}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(text.trim(), pos.x, pos.y);
      emit();
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    startRef.current = pos;
    snapshotRef.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

    if (tool === 'pen' || tool === 'eraser') {
      applyStrokeStyle(ctx, tool === 'eraser');
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
      ctx.stroke();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const start = startRef.current;
    const snapshot = snapshotRef.current;
    if (!ctx || !start || !snapshot) return;
    const pos = getPos(e);

    if (tool === 'pen' || tool === 'eraser') {
      applyStrokeStyle(ctx, tool === 'eraser');
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    /* 도형은 매 이동마다 시작 스냅샷으로 되돌린 뒤 미리보기를 그림 */
    ctx.putImageData(snapshot, 0, 0);
    applyStrokeStyle(ctx);

    if (tool === 'line' || tool === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      if (tool === 'arrow') drawArrowHead(ctx, start.x, start.y, pos.x, pos.y);
      return;
    }

    if (tool === 'rect') {
      ctx.beginPath();
      ctx.rect(start.x, start.y, pos.x - start.x, pos.y - start.y);
      ctx.stroke();
      return;
    }

    if (tool === 'circle') {
      const rx = Math.abs(pos.x - start.x) / 2;
      const ry = Math.abs(pos.y - start.y) / 2;
      const cx = (start.x + pos.x) / 2;
      const cy = (start.y + pos.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    emit();
  };

  /* ---------------- 실행 취소 / 전체 지우기 ---------------- */
  const loadFromUrl = (url: string) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (!url) {
      paintBackground(ctx);
      paintStamp(ctx, stampText);
      return;
    }
    const img = new Image();
    img.onload = () => {
      paintBackground(ctx);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    };
    img.src = url;
  };

  const handleUndo = () => {
    const h = historyRef.current;
    if (h.length <= 1) return;
    const next = h.slice(0, -1);
    historyRef.current = next;
    const url = next[next.length - 1];
    appliedRef.current = url;
    loadFromUrl(url);
    setStrokeCount(next.length - 1);
    onChange(url);
  };

  const handleClear = () => {
    if (!window.confirm('상황도를 모두 지우시겠습니까?\n(첨부한 사진/도면도 함께 지워집니다)'))
      return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    paintBackground(ctx);
    paintStamp(ctx, stampText);
    setBackgroundName('');

    const url = stampText ? canvasRef.current!.toDataURL('image/png') : '';
    historyRef.current = stampText ? [url] : [''];
    appliedRef.current = url;
    resetCanvas();
    if (stampText) paintStamp(ctx, stampText);
    setStrokeCount(stampText ? 1 : 0);
    onChange(url);
  };

  const isEmpty = strokeCount === 0;

  return (
    <div className="situation-diagram">
      <div className="sd-toolbar">
        <div className="sd-tool-group" role="group" aria-label="사진·도면 첨부">
          <label
            className="sd-tool sd-tool-attach"
            title="사진이나 도면 이미지를 상황도 배경으로 첨부합니다."
          >
            <span aria-hidden="true">🖼️</span>
            <span className="sd-tool-label">사진·도면 첨부</span>
            <input type="file" accept="image/*" onChange={handleAttachImage} />
          </label>
          {backgroundName && (
            <button
              type="button"
              className="sd-action sd-action-danger"
              onClick={handleRemoveBackground}
              title={backgroundName}
            >
              배경 지우기
            </button>
          )}
        </div>

        <div className="sd-tool-group" role="group" aria-label="그리기 도구">
          {TOOLS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`sd-tool ${tool === t.key ? 'is-active' : ''}`}
              onClick={() => setTool(t.key)}
              title={t.label}
              aria-pressed={tool === t.key}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="sd-tool-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="sd-tool-group" role="group" aria-label="색상">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`sd-color ${color === c ? 'is-active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              aria-label={`색상 ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </div>

        <div className="sd-tool-group" role="group" aria-label="선 굵기">
          {WIDTHS.map(w => (
            <button
              key={w.value}
              type="button"
              className={`sd-width ${lineWidth === w.value ? 'is-active' : ''}`}
              onClick={() => setLineWidth(w.value)}
              aria-pressed={lineWidth === w.value}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="sd-tool-group sd-tool-group-end">
          <button type="button" className="sd-action" onClick={handleUndo} disabled={isEmpty}>
            ↩ 실행 취소
          </button>
          <button
            type="button"
            className="sd-action sd-action-danger"
            onClick={handleClear}
            disabled={isEmpty}
          >
            전체 지우기
          </button>
        </div>
      </div>

      <div className="sd-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="sd-canvas"
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {isEmpty && (
          <div className="sd-placeholder" aria-hidden="true">
            <span className="sd-placeholder-icon">🖊️</span>
            <span>사진·도면을 첨부하거나 위 도구로 사고 현장을 그려주세요</span>
            <span className="sd-placeholder-sub">예: 작업대·비계·추락 지점·차량 진행방향</span>
          </div>
        )}
      </div>

      <p className="sd-caption">
        그린 상황도는 <strong>사고보고서</strong>에 자동으로 첨부됩니다. (마우스·터치 모두 지원)
        {stampText ? (
          <>
            <br />
            <span className="sd-caption-stamp">
              📅 사고 발생일이 입력되어 상황도에 <strong>재해 발생일 {stampText}</strong> 이(가)
              함께 표시됩니다.
            </span>
          </>
        ) : (
          <>
            <br />
            <span className="sd-caption-stamp is-off">
              📅 위 <strong>사고 발생 일시</strong>를 입력하면 상황도에 재해 발생일이 함께
              표시됩니다.
            </span>
          </>
        )}
      </p>
    </div>
  );
};

export default SituationDiagram;
