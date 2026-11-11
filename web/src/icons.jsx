import React from 'react';

const baseProps = (size = 18, className = '') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.85,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
  className
});

export function BrandMark({ size = 22, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
      <path d="M11 7h4a2 2 0 0 1 2 2v4" />
      <path d="M13 17H9a2 2 0 0 1-2-2v-4" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CompassIcon({ size = 18, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5" />
    </svg>
  );
}

export function GitBranchIcon({ size = 18, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 18, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ZapIcon({ size = 18, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function DatabaseIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

export function MeshIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.5 6h7" />
      <path d="M7.3 8.2 10.8 15.8" />
      <path d="M16.7 8.2 13.2 15.8" />
    </svg>
  );
}

export function OutboxIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function SlidersIcon({ size = 17, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export function CommandIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

export function UserIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 17, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3 4.7-5" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 17, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function SparklesIcon({ size = 17, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

export function ClockIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

export function GlobeIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a14.5 14.5 0 0 0 0 18 14.5 14.5 0 0 0 0-18" />
    </svg>
  );
}

export function CopyIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function TrashIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function PlayIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function HelpIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
      <line x1="12" y1="17.5" x2="12.01" y2="17.5" />
    </svg>
  );
}

export function CloseIcon({ size = 18, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function AwardIcon({ size = 17, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

export function LockIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.2" y2="16.2" />
    </svg>
  );
}

export function EyeIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LayersIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </svg>
  );
}

export function SunIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

export function FileTextIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

export function ColumnsIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9.5" y1="4" x2="9.5" y2="20" />
      <line x1="15.5" y1="4" x2="15.5" y2="20" />
    </svg>
  );
}

export function PaletteIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="13.5" cy="6.5" r="0.8" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.8" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.8" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.43-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.67 1.67 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.56C22 6.05 17.5 2 12 2Z" />
    </svg>
  );
}

export function SplitWipeIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="2" x2="12" y2="22" />
      <polyline points="9 10 7 12 9 14" />
      <polyline points="15 10 17 12 15 14" />
    </svg>
  );
}

export function DownloadIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function KeyboardIcon({ size = 16, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="6" y1="9" x2="6.01" y2="9" />
      <line x1="10" y1="9" x2="10.01" y2="9" />
      <line x1="14" y1="9" x2="14.01" y2="9" />
      <line x1="18" y1="9" x2="18.01" y2="9" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, className = '' }) {
  return (
    <svg {...baseProps(size, className)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
