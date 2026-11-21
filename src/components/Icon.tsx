import React from 'react';

/**
 * 공용 라인 아이콘 (stroke 1.8 / round cap)
 *
 * - 이모지 대신 SVG 를 씁니다. 일부 환경(샌드박스·리눅스)에서 컬러 이모지가
 *   두부(□)로 렌더링되기 때문입니다.
 * - 색은 currentColor 를 따르므로 부모의 color 만 바꾸면 됩니다.
 */
export type IconName =
  | 'shield'
  | 'alert'
  | 'bulb'
  | 'folder'
  | 'megaphone'
  | 'chevron-right'
  | 'chevron-down'
  | 'pin'
  | 'bell'
  | 'file'
  | 'users'
  | 'clock'
  | 'building'
  | 'phone'
  | 'message'
  | 'lock'
  | 'arrow-left'
  | 'check'
  | 'chart';

const PATHS: Record<IconName, React.ReactNode> = {
  shield: (
    <>
      <path d="M12 3l7 2.8V12c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V5.8L12 3z" />
      <path d="M8.8 12.1l2.2 2.2 4.2-4.4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.4L2.9 20h18.2L12 4.4z" />
      <path d="M12 9.9v4.3" />
      <path d="M12 17.3h.01" strokeWidth="2.4" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.4 18h5.2" />
      <path d="M10.4 21h3.2" />
      <path d="M12 3a6 6 0 00-3.6 10.8c.6.45 1 1.15 1 1.95V18h5.2v-2.25c0-.8.4-1.5 1-1.95A6 6 0 0012 3z" />
    </>
  ),
  folder: (
    <path d="M3 7.4A1.4 1.4 0 014.4 6h4.1l2.1 2.6h7A1.4 1.4 0 0119 10v6.6A1.4 1.4 0 0117.6 18H4.4A1.4 1.4 0 013 16.6V7.4z" />
  ),
  megaphone: (
    <>
      <path d="M4 10.2v3.6a1 1 0 001 1h2.2l7 3.7V5.5L7.2 9.2H5a1 1 0 00-1 1z" />
      <path d="M17.6 8.6a4.8 4.8 0 010 6.8" />
    </>
  ),
  'chevron-right': <path d="M9.6 5.8l6.2 6.2-6.2 6.2" />,
  'chevron-down': <path d="M5.8 9.6l6.2 6.2 6.2-6.2" />,
  pin: (
    <>
      <path d="M12 3.2v8.6" />
      <path d="M8.2 11.8h7.6l-.9 3.1H9.1l-.9-3.1z" />
      <path d="M12 14.9v6" />
    </>
  ),
  bell: (
    <>
      <path d="M6.2 9.4a5.8 5.8 0 1111.6 0c0 3.8 1.5 5.3 2 5.8H4.2c.5-.5 2-2 2-5.8z" />
      <path d="M9.6 18.3a2.5 2.5 0 004.8 0" />
    </>
  ),
  file: (
    <>
      <path d="M14 3.4H7.4a1.4 1.4 0 00-1.4 1.4v14.4a1.4 1.4 0 001.4 1.4h9.2a1.4 1.4 0 001.4-1.4V7.4L14 3.4z" />
      <path d="M13.9 3.4v4.1h4.1" />
    </>
  ),
  users: (
    <>
      <circle cx="9.2" cy="8.2" r="3.1" />
      <path d="M3.8 19.6c.6-3.1 2.8-4.9 5.4-4.9s4.8 1.8 5.4 4.9" />
      <path d="M16.2 5.7a3 3 0 010 5.4" />
      <path d="M17.6 19.6c-.2-1.5-.6-2.8-1.3-3.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l2.9 1.9" />
    </>
  ),
  building: (
    <>
      <path d="M4.4 20V6.6L12 3.4l7.6 3.2V20" />
      <path d="M3.4 20h17.2" />
      <path d="M9.4 20v-4.4h5.2V20" />
      <path d="M9 9.2h1.6M13.4 9.2H15M9 12.3h1.6M13.4 12.3H15" />
    </>
  ),
  phone: (
    <path d="M6.6 3.6h2.9l1.5 3.9-1.9 1.4a12.4 12.4 0 006 6l1.4-1.9 3.9 1.5v2.9a2 2 0 01-2 2c-8 0-14.4-6.4-14.4-14.4a2 2 0 012-2z" />
  ),
  message: (
    <path d="M20.2 12.4c0 3.5-3.6 6.4-8.1 6.4-1 0-2-.14-2.9-.4L4.6 20l1.2-3.3a6.2 6.2 0 01-1.9-4.3c0-3.5 3.6-6.4 8.2-6.4s8.1 2.9 8.1 6.4z" />
  ),
  lock: (
    <>
      <rect x="4.9" y="10.4" width="14.2" height="9.6" rx="2" />
      <path d="M8.6 10.4V8a3.4 3.4 0 016.8 0v2.4" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5.2" />
      <path d="M11 5.8L4.8 12l6.2 6.2" />
    </>
  ),
  check: <path d="M4.8 12.5l4.7 4.7L19.2 7.4" />,
  chart: (
    <>
      <path d="M4.2 20V4.2" />
      <path d="M4.2 20h15.8" />
      <path d="M8.4 16.4v-4.2M12.4 16.4V7.6M16.4 16.4v-6.4" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const Icon: React.FC<IconProps> = ({ name, size = 18, className, strokeWidth = 1.8 }) => (
  <svg
    className={className ? `icon ${className}` : 'icon'}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {PATHS[name]}
  </svg>
);

export default Icon;
