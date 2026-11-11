import React, { useEffect, useState } from 'react';
import { DatabaseIcon, MeshIcon, OutboxIcon, KeyboardIcon } from '../icons.jsx';

function deriveFocusContext(el) {
  if (!el || typeof el.tagName !== 'string') return 'general';
  const tag = el.tagName.toUpperCase();
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.closest?.('[role="dialog"]')
  ) {
    return 'typing';
  }
  if (el.getAttribute?.('role') === 'tab') {
    return 'tab';
  }
  return 'general';
}

export default function KeyboardLightRibbon({
  statusMessage,
  wanOffline,
  authorityHealth,
  queuedClaim,
  singleKeyShortcuts,
  onToggleSingleKeyShortcuts,
  onJumpToManageTeam,
  onOpenPalette,
  onOpenHelp
}) {
  const [focusContext, setFocusContext] = useState('general');

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleFocusChange = e => {
      setFocusContext(deriveFocusContext(e?.target || document.activeElement));
    };
    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);
    return () => {
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
    };
  }, []);

  const serverLabel = wanOffline
    ? 'Disconnected'
    : authorityHealth === 'online'
      ? 'Server online'
      : authorityHealth === 'unreachable'
        ? 'Server offline'
        : 'Checking';

  return (
    <footer className="ide-status-ribbon platform-footer no-print" role="contentinfo">
      {/* 1. Polite ARIA Status Announcer */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="ide-status-left live-announcer-bar"
      >
        <span className="live-pulse-indicator" aria-hidden="true">●</span>
        <span className="mono-status-text">{statusMessage}</span>
      </div>

      {/* 2. Contextual Satin Keycap Hints (3-4 hints matched to active focus, zero keystroke logging) */}
      <div className="ide-keycap-cluster" aria-label="Contextual keyboard shortcuts">
        <KeyboardIcon size={14} className="muted-copy" />
        {focusContext === 'typing' ? (
          <>
            <span className="keycap-hint keycap-paused">Typing: single-key shortcuts paused</span>
            <span className="keycap-hint"><kbd>Esc</kbd> Leave field</span>
            <span className="keycap-hint"><kbd>Tab</kbd> Next control</span>
          </>
        ) : focusContext === 'tab' ? (
          <>
            <span className="keycap-hint"><kbd>←</kbd><kbd>→</kbd> Switch tab</span>
            <span className="keycap-hint"><kbd>Enter</kbd> Open</span>
            <span className="keycap-hint"><kbd>Alt+1..4</kbd> Jump step</span>
            {singleKeyShortcuts && (
              <button type="button" className="keycap-btn" onClick={onOpenHelp}>
                <kbd>?</kbd> Guide
              </button>
            )}
          </>
        ) : (
          <>
            <span className="keycap-hint"><kbd>Tab</kbd> Focus</span>
            <span className="keycap-hint"><kbd>Enter</kbd> Activate</span>
            <span className="keycap-hint"><kbd>Alt+1..4</kbd> Steps</span>
            <button type="button" className="keycap-btn" onClick={onOpenPalette}>
              <kbd>{singleKeyShortcuts ? '/' : 'Ctrl+K'}</kbd> Search
            </button>
            <button type="button" className="keycap-btn" onClick={onOpenHelp}>
              <kbd>{singleKeyShortcuts ? '?' : 'F1'}</kbd> Guide
            </button>
          </>
        )}
      </div>

      {/* 3. Network Continuity Status + WCAG 2.1.4 Single-Key Shortcut Switch */}
      <div className="ide-status-right">
        <button
          type="button"
          className="ide-network-status"
          onClick={onJumpToManageTeam}
          title="Open 3. Manage your team to inspect server, peer relay, and saved requests"
        >
          <span className={`coord-item ${wanOffline ? 'coord-warn' : authorityHealth === 'online' ? 'coord-ok' : ''}`}>
            <DatabaseIcon size={12} />
            <span>{serverLabel}</span>
          </span>
          <span className="coord-sep" aria-hidden="true">·</span>
          <span className="coord-item coord-ok">
            <MeshIcon size={12} />
            <span>Peer relay ready</span>
          </span>
          <span className="coord-sep" aria-hidden="true">·</span>
          <span className={`coord-item ${queuedClaim ? 'coord-warn' : ''}`}>
            <OutboxIcon size={12} />
            <span>{queuedClaim ? '1 saved on device' : '0 saved'}</span>
          </span>
        </button>

        <button
          type="button"
          aria-pressed={singleKeyShortcuts}
          className="keycap-toggle-btn"
          onClick={onToggleSingleKeyShortcuts}
          title="WCAG 2.1.4 Character Key Shortcuts: turn single-key '/' and '?' shortcuts on or off"
        >
          Single-key shortcuts: <strong>{singleKeyShortcuts ? 'On' : 'Off'}</strong>
        </button>
      </div>
    </footer>
  );
}
