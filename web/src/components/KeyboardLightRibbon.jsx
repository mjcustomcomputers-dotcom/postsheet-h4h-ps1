import React, { useEffect, useState } from 'react';
import {
  DatabaseIcon,
  MeshIcon,
  OutboxIcon,
  KeyboardIcon,
  SearchIcon,
  HelpIcon
} from '../icons.jsx';

export function deriveFocusContext(el) {
  if (!el || typeof el.tagName !== 'string') return 'general';
  const tag = el.tagName.toUpperCase();
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.closest?.('[contenteditable="true"], [contenteditable=""]') ||
    el.closest?.('[role="dialog"]')
  ) {
    return 'typing';
  }
  if (el.getAttribute?.('role') === 'tab') {
    return 'tab';
  }
  return 'general';
}

export function useFocusContext() {
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

  return focusContext;
}

export function UpperShortcutHoloMirror({
  visible = true,
  activeView = 'discover',
  singleKeyShortcuts = true,
  onToggleSingleKeyShortcuts,
  onToggleMirror,
  onOpenPalette,
  onOpenHelp,
  onFocusFilter,
  onNavigate,
  onToggleActingMenu,
  onToggleDisplayMenu,
  onDownloadPlan
}) {
  const focusContext = useFocusContext();

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Peripheral keyboard and click shortcut mirror"
      data-reactive-surface=""
      className="holo-key-mirror no-print"
    >
      <div className="holo-mirror-left">
        <span className="holo-mirror-badge" title="Peripheral keyboard and mouse shortcut bar">
          <KeyboardIcon size={13} />
          <span>Shortcut Mirror</span>
        </span>

        {focusContext === 'typing' ? (
          <span className="holo-typing-state">
            Typing in field: single-key shortcuts paused (<kbd>Esc</kbd> returns to workspace)
          </span>
        ) : (
          <div className="holo-mirror-pills">
            <button
              type="button"
              data-reactive-surface=""
              className="holo-pill holo-pill-search"
              onClick={onOpenPalette}
              title="Open Command Search with mouse or keyboard (Ctrl+K or /)"
            >
              <SearchIcon size={13} />
              <span>Command Search</span>
              <kbd>{singleKeyShortcuts ? '/ or Ctrl+K' : 'Ctrl+K'}</kbd>
            </button>

            <button
              type="button"
              data-reactive-surface=""
              className="holo-pill holo-pill-guide"
              onClick={onOpenHelp}
              title="Open Purpose-First Guide and full shortcut reference (? or F1)"
            >
              <HelpIcon size={13} />
              <span>Guide</span>
              <kbd>{singleKeyShortcuts ? '? or F1' : 'F1'}</kbd>
            </button>

            <button
              type="button"
              className="holo-pill"
              onClick={onFocusFilter}
              title="Jump to Find teammates and focus the skill and name filter"
            >
              <span>Filter people</span>
              <kbd>{singleKeyShortcuts ? 'f' : 'Alt+1'}</kbd>
            </button>

            <div className="holo-step-group" role="group" aria-label="Quick step jump">
              {[
                { id: 'discover', n: '1', label: 'Find' },
                { id: 'architect', n: '2', label: 'Plan' },
                { id: 'authority', n: '3', label: 'Team' },
                { id: 'arena', n: '4', label: 'Race' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={activeView === st.id}
                  className={`holo-step-chip ${activeView === st.id ? 'active' : ''}`}
                  onClick={() => onNavigate?.(st.id)}
                  title={`Step ${st.n}: ${st.label} (${singleKeyShortcuts ? `${st.n} or Alt+${st.n}` : `Alt+${st.n}`})`}
                >
                  <kbd>{singleKeyShortcuts ? st.n : `Alt+${st.n}`}</kbd>
                  <span>{st.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="holo-pill holo-pill-subtle"
              onClick={onToggleActingMenu}
              title="Switch active demo profile or account"
            >
              <span>Profile</span>
              {singleKeyShortcuts && <kbd>p</kbd>}
            </button>

            <button
              type="button"
              className="holo-pill holo-pill-subtle"
              onClick={onToggleDisplayMenu}
              title="Open Display, Contrast, and Scale settings"
            >
              <span>Display</span>
              <kbd>{singleKeyShortcuts ? 'd' : 'Ctrl+Shift+A'}</kbd>
            </button>

            <button
              type="button"
              className="holo-pill holo-pill-subtle"
              onClick={onDownloadPlan}
              title="Download white-paper Team Plan HTML file"
            >
              <span>Export</span>
              {singleKeyShortcuts && <kbd>e</kbd>}
            </button>
          </div>
        )}
      </div>

      <div className="holo-mirror-right">
        <button
          type="button"
          aria-pressed={singleKeyShortcuts}
          className="holo-meta-btn"
          onClick={onToggleSingleKeyShortcuts}
          title="WCAG 2.1.4 Character Key Shortcuts: turn single-key shortcuts on or off"
        >
          Single-key: <strong>{singleKeyShortcuts ? 'On' : 'Off'}</strong>
        </button>
        <button
          type="button"
          className="holo-meta-btn"
          onClick={onToggleMirror}
          title="Hide upper shortcut mirror (restore anytime in Display & A11y)"
        >
          Hide bar
        </button>
      </div>
    </div>
  );
}

export default function KeyboardLightRibbon({
  statusMessage,
  wanOffline,
  authorityHealth,
  queuedClaim,
  singleKeyShortcuts,
  upperKeyMirror = true,
  onToggleSingleKeyShortcuts,
  onToggleUpperKeyMirror,
  onJumpToManageTeam,
  onOpenPalette,
  onOpenHelp,
  onFocusFilter
}) {
  const focusContext = useFocusContext();

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

      {/* 2. Contextual Satin Keycap Hints (matched to active focus, zero keystroke logging) */}
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
            <span className="keycap-hint"><kbd>{singleKeyShortcuts ? '1..4' : 'Alt+1..4'}</kbd> Jump step</span>
            <button type="button" className="keycap-btn" onClick={onOpenPalette}>
              <kbd>{singleKeyShortcuts ? '/' : 'Ctrl+K'}</kbd> Search
            </button>
            <button type="button" className="keycap-btn" onClick={onOpenHelp}>
              <kbd>{singleKeyShortcuts ? '?' : 'F1'}</kbd> Guide
            </button>
          </>
        ) : (
          <>
            <span className="keycap-hint"><kbd>{singleKeyShortcuts ? '1..4' : 'Alt+1..4'}</kbd> Steps</span>
            <button type="button" className="keycap-btn" onClick={onOpenPalette}>
              <kbd>{singleKeyShortcuts ? '/' : 'Ctrl+K'}</kbd> Search
            </button>
            <button type="button" className="keycap-btn" onClick={onFocusFilter}>
              <kbd>{singleKeyShortcuts ? 'f' : 'Alt+1'}</kbd> Filter
            </button>
            <button type="button" className="keycap-btn" onClick={onOpenHelp}>
              <kbd>{singleKeyShortcuts ? '?' : 'F1'}</kbd> Guide
            </button>
          </>
        )}
      </div>

      {/* 3. Network Continuity Status + Upper Mirror Restore + WCAG 2.1.4 Single-Key Switch */}
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

        {onToggleUpperKeyMirror && !upperKeyMirror && (
          <button
            type="button"
            className="keycap-toggle-btn"
            onClick={onToggleUpperKeyMirror}
            title="Show translucent shortcut mirror bar near top of screen"
          >
            Show top shortcut bar
          </button>
        )}

        <button
          type="button"
          aria-pressed={singleKeyShortcuts}
          className="keycap-toggle-btn"
          onClick={onToggleSingleKeyShortcuts}
          title="WCAG 2.1.4 Character Key Shortcuts: turn single-key shortcuts on or off"
        >
          Single-key shortcuts: <strong>{singleKeyShortcuts ? 'On' : 'Off'}</strong>
        </button>
      </div>
    </footer>
  );
}
