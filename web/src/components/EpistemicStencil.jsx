import React from 'react';
import { DatabaseIcon, SparklesIcon, LockIcon, EyeIcon } from '../icons.jsx';

const STENCIL_META = {
  SQLITE_AUTHORITY: {
    label: 'SQLITE_AUTHORITY',
    glyph: '●',
    cls: 'stencil-sqlite',
    title: 'Authoritative Layer-A SQLite BEGIN IMMEDIATE state or verified witness',
    Icon: DatabaseIcon
  },
  PLAN_PREVIEW: {
    label: 'PLAN_PREVIEW',
    glyph: '◎',
    cls: 'stencil-preview',
    title: 'Local <2ms schedule preview; not yet joined or confirmed on server',
    Icon: EyeIcon
  },
  VOI_PROVISIONAL: {
    label: 'VOI_PROVISIONAL',
    glyph: '◆',
    cls: 'stencil-voi',
    title: 'Provisional Wildcard Omega / Shannon Value-of-Information frontier state',
    Icon: SparklesIcon
  },
  PEER_CIPHERTEXT_ONLY: {
    label: 'PEER_CIPHERTEXT_ONLY',
    glyph: '▲',
    cls: 'stencil-peer',
    title: 'Layer-B AES-256-GCM + P-256 ECDSA artifact; never mutates Layer-A seats directly',
    Icon: LockIcon
  }
};

export default function EpistemicStencil({ kind = 'SQLITE_AUTHORITY', compact = false }) {
  const spec = STENCIL_META[kind] || STENCIL_META.SQLITE_AUTHORITY;
  const Icon = spec.Icon;
  return (
    <span
      className={`epistemic-stencil ${spec.cls}${compact ? ' stencil-compact' : ''}`}
      title={spec.title}
    >
      <span className="stencil-shape-glyph" aria-hidden="true">{spec.glyph}</span>
      <Icon size={compact ? 11 : 12} />
      <span>{spec.label}</span>
    </span>
  );
}
