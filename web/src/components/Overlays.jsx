import React, { useState, useRef, useMemo, useEffect } from 'react';
import ModalDialog from './ModalDialog.jsx';
import {
  THEME_OPTIONS,
  SCALE_OPTIONS,
  DENSITY_OPTIONS,
  MOTION_OPTIONS,
  detectOsDefaults
} from '../ergonomics.js';
import {
  SKILLS_CATALOG,
  TIMEZONE_PRESETS
} from '../presets-and-catalog.js';
import {
  CheckCircleIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ZapIcon,
  UserIcon,
  SearchIcon,
  ArrowRightIcon,
  AlertTriangleIcon
} from '../icons.jsx';

export function formatHumanActorName(actorId, hasToken = true) {
  if (!actorId || !hasToken) return 'Guest';
  const map = {
    'leader-aurora': 'Aurora',
    aurora: 'Aurora',
    'builder-kai': 'Kai',
    kai: 'Kai',
    'builder-priya': 'Priya',
    priya: 'Priya',
    'relay-mateo': 'Mateo',
    mateo: 'Mateo'
  };
  if (map[actorId]) return map[actorId];
  const cleaned = String(actorId).replace(/^(leader|builder|relay)-/, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1, 14);
}

export function ActingAsMenuPopover({
  open,
  onClose,
  actorId,
  token,
  onSwitchPersona,
  onOpenAuthModal,
  onLogout
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = e => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest?.('[data-acting-trigger]')) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const profiles = [
    { id: 'leader-aurora', name: 'Aurora', role: 'Team lead · Backend & API (UTC-6)' },
    { id: 'builder-kai', name: 'Kai', role: 'Accessible UI · Frontend (UTC-6)' },
    { id: 'builder-priya', name: 'Priya', role: 'E2E Integration · Handoff (UTC+5:30)' }
  ];

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Switch demo profile or account session"
      className="ide-popover acting-popover no-print"
    >
      <div className="ide-popover-section">
        <div className="ide-popover-label">Switch demo profile</div>
        <div className="ide-profile-list">
          {profiles.map(p => {
            const active = actorId === p.id && Boolean(token);
            return (
              <button
                key={p.id}
                type="button"
                className={`ide-profile-item ${active ? 'active' : ''}`}
                onClick={async () => {
                  await onSwitchPersona(p.id);
                  onClose();
                }}
              >
                <div>
                  <strong>{active ? '● ' : ''}{p.name}</strong>
                  <span className="ide-profile-sub">{p.role}</span>
                </div>
                <code className="tiny-copy">{p.id}</code>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ide-popover-footer">
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          onClick={() => {
            onClose();
            onOpenAuthModal();
          }}
        >
          <UserIcon size={13} /> {token ? 'Account & password sign-in...' : 'Sign in / Create account...'}
        </button>
        {token && (
          <button
            type="button"
            className="btn btn-danger-outline btn-compact"
            onClick={async () => {
              await onLogout();
              onClose();
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

export function DisplayComfortPopover({
  open,
  onClose,
  settings,
  onChange,
  onOpenFullStudio
}) {
  const popRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = e => {
      if (popRef.current && !popRef.current.contains(e.target) && !e.target.closest?.('[data-display-trigger]')) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function patch(next) {
    onChange({ ...settings, ...next });
  }

  const isAutoScale = !settings.scaleLocked;

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Display and accessibility settings"
      className="ide-popover display-popover no-print"
    >
      {/* Essential Control 1: Text & FOV Scale */}
      <div className="ide-popover-section">
        <div className="ide-popover-label">1. Text &amp; FOV Scale</div>
        <div className="ide-seg-grid" role="group" aria-label="Text and field-of-view scale">
          <button
            type="button"
            aria-pressed={isAutoScale}
            className={`ide-seg-btn span-full ${isAutoScale ? 'active' : ''}`}
            onClick={() => patch({ scaleLocked: false, scale: '60' })}
          >
            Auto (60% Desktop / 100% Mobile)
          </button>
          {[
            { id: '60', label: '60% Panorama' },
            { id: '80', label: '80% Compact' },
            { id: '100', label: '100% Standard' },
            { id: '115', label: '115% Large' }
          ].map(opt => {
            const active = settings.scaleLocked && settings.scale === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                className={`ide-seg-btn ${active ? 'active' : ''}`}
                onClick={() => patch({ scaleLocked: true, scale: opt.id })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Essential Control 2: Contrast & Surface */}
      <div className="ide-popover-section">
        <div className="ide-popover-label">2. Contrast &amp; Surface</div>
        <div className="ide-seg-row" role="group" aria-label="Contrast and surface theme">
          {[
            { id: 'h4h-glass', label: 'Moonlight Dark' },
            { id: 'aaa-contrast', label: 'High Contrast' },
            { id: 'warm-paper', label: 'Moonlit Pearl (Light)' }
          ].map(th => {
            const active = settings.theme === th.id;
            return (
              <button
                key={th.id}
                type="button"
                aria-pressed={active}
                className={`ide-seg-btn ${active ? 'active' : ''}`}
                onClick={() => patch({ theme: th.id })}
              >
                {th.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Essential Control 3: Layout & Motion */}
      <div className="ide-popover-section">
        <div className="ide-popover-label">3. Layout &amp; Motion</div>
        <div className="ide-seg-grid" role="group" aria-label="Workspace layout and motion">
          <button
            type="button"
            aria-pressed={settings.density === 'panoramic-3'}
            className={`ide-seg-btn ${settings.density === 'panoramic-3' ? 'active' : ''}`}
            onClick={() => patch({ density: 'panoramic-3' })}
          >
            3-Column Panorama
          </button>
          <button
            type="button"
            aria-pressed={settings.density !== 'panoramic-3'}
            className={`ide-seg-btn ${settings.density !== 'panoramic-3' ? 'active' : ''}`}
            onClick={() => patch({ density: 'calm-focus' })}
          >
            Single Focus
          </button>
          <button
            type="button"
            aria-pressed={settings.motion !== 'off'}
            className={`ide-seg-btn ${settings.motion !== 'off' ? 'active' : ''}`}
            onClick={() => patch({ motion: 'spring' })}
          >
            Reactive Light
          </button>
          <button
            type="button"
            aria-pressed={settings.motion === 'off'}
            className={`ide-seg-btn ${settings.motion === 'off' ? 'active' : ''}`}
            onClick={() => patch({ motion: 'off' })}
          >
            Static Off
          </button>
        </div>
      </div>

      <div className="ide-popover-footer">
        <button
          type="button"
          className="btn btn-ghost btn-compact"
          onClick={() => patch(detectOsDefaults())}
        >
          Reset defaults
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          onClick={() => {
            onClose();
            onOpenFullStudio();
          }}
        >
          More palettes &amp; shortcuts...
        </button>
      </div>
    </div>
  );
}

export function WhyPurposeFirstModal({ open, onClose, onJumpScenario, onNavigate }) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      eyebrow="POST SHEET · HOW THIS PLATFORM WORKS & SHORTCUT GUIDE"
      title="Purpose-First Team Planning & Keyboard Guide"
    >
      <blockquote className="thesis-quote">
        "Start from the work to be done, check that everyone's skills and hours fit together, and let the server confirm every spot."
      </blockquote>

      <div className="comparison-grid">
        <div className="subcard tone-warn">
          <h3>Profile-Only Directories</h3>
          <ul className="clean-list">
            <li>List people by static skill tags or cities without checking whether hours line up.</li>
            <li>Stop checking readiness once a team hits <code>4 / 4</code> or <code>5 / 5</code> spots.</li>
            <li>Miss when one person is double-booked across two urgent tasks at the same time.</li>
            <li>Filter out 11.5-hour time-zone pairs even when clean handoffs finish work earlier.</li>
            <li>Lose join requests or overfill the last spot when Wi-Fi drops.</li>
          </ul>
        </div>

        <div className="subcard tone-ok">
          <h3>Post Sheet Purpose-First Workflow</h3>
          <ul className="clean-list">
            <li><strong>Schedule &amp; Handoff Check:</strong> Places tightest tasks first and verifies clean cross-timezone handoffs.</li>
            <li><strong>Smart Skill Verification:</strong> Asks <strong>zero questions</strong> when a backup teammate already covers the work, or prompts one quick check when needed.</li>
            <li><strong>Add Help Without Replacing People:</strong> Suggests who unblocks a bottleneck while keeping current teammates.</li>
            <li><strong>Server-Confirmed Spots + Offline Forwarding:</strong> 50-person race safety + offline request forwarding through a connected teammate.</li>
          </ul>
        </div>
      </div>

      <div className="subcard top-gap-sm">
        <h3>Keyboard Shortcuts</h3>
        <div className="pill-row top-gap-xs small-copy">
          <span><kbd>Alt+1..4</kbd> Switch steps 1-4</span>
          <span><kbd>Ctrl+K</kbd> or <kbd>/</kbd> Command search</span>
          <span><kbd>?</kbd> Open this guide</span>
          <span><kbd>Esc</kbd> Close menu or dialog</span>
          <span><kbd>Ctrl+Shift+A</kbd> Full display studio</span>
        </div>
      </div>

      <div className="callout-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onClose();
            onJumpScenario('baton');
          }}
        >
          <SparklesIcon /> Try Cross-Timezone Handoff
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onClose();
            onJumpScenario('hall');
          }}
        >
          Try Double-Booked Task Fix
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onClose();
            onNavigate('arena');
          }}
        >
          <ZapIcon /> Test 50 People for Last Spot
        </button>
      </div>
    </ModalDialog>
  );
}

export function AuthAccountModal({
  open,
  onClose,
  actorId,
  token,
  authPromptMessage,
  onSwitchPersona,
  onAccountAuth,
  onLogout
}) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState(TIMEZONE_PRESETS[0].value);
  const [selectedSkills, setSelectedSkills] = useState(['backend', 'frontend']);
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const userInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setLocalError('');
      if (authPromptMessage && !token) {
        setMode('register');
      }
    }
  }, [open, authPromptMessage, token]);

  function toggleSkill(sk) {
    setSelectedSkills(prev => (prev.includes(sk) ? prev.filter(x => x !== sk) : [...prev, sk]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError('');
    if (!username.trim()) {
      setLocalError('Enter a valid username (letters, numbers, -, _, ., @).');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await onAccountAuth(mode, {
        username: username.trim(),
        password,
        timezone,
        skills: selectedSkills.join(',')
      });
      setPassword('');
      onClose();
    } catch (err) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickPersona(personaId) {
    setLocalError('');
    setBusy(true);
    try {
      const ok = await onSwitchPersona(personaId);
      if (ok !== false) {
        onClose();
      } else {
        setLocalError('Demo profiles are disabled (PS1_DEMO_AUTH=0). Create or sign in with an account below.');
      }
    } catch (err) {
      setLocalError(err.message || 'Demo switch failed. Create an account below.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      initialFocusRef={userInputRef}
      eyebrow="ACCOUNT & DEMO PROFILES"
      title="Switch Profile or Sign In"
    >
      {authPromptMessage && (
        <div role="alert" className="inline-alert tone-warn">
          <div className="pill-row">
            <AlertTriangleIcon size={16} />
            <strong>Action saved and ready to run after sign-in:</strong>
          </div>
          <p className="small-top">{authPromptMessage}</p>
        </div>
      )}

      <div className="subcard">
        <div className="row-between wrap-gap">
          <div>
            <strong>Currently acting as:</strong>{' '}
            <span className="mono-pill">
              {token ? `${formatHumanActorName(actorId, true)} (${actorId})` : 'Signed out'}
            </span>
          </div>
          {token && (
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={async () => {
                await onLogout();
                onClose();
              }}
            >
              Sign out
            </button>
          )}
        </div>
        <p className="muted-copy small-top">
          The server verifies your signed session token on every team change. Signing out revokes the token immediately.
        </p>
      </div>

      <div className="section-block">
        <h3>Quick Demo Profiles</h3>
        <p className="muted-copy">Switch profiles in 1 click to test planning, invites, and offline forwarding:</p>
        <div className="pill-row">
          {[
            { id: 'leader-aurora', name: 'Aurora', desc: 'Team lead · Backend (UTC-6)' },
            { id: 'builder-kai', name: 'Kai', desc: 'Frontend · Accessible UI (UTC-6)' },
            { id: 'builder-priya', name: 'Priya', desc: 'Integration · Handoff (UTC+5:30)' }
          ].map(p => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              className={`btn ${actorId === p.id && token ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleQuickPersona(p.id)}
            >
              <UserIcon /> {p.name} <span className="btn-sub">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-block">
        <div className="tab-strip" role="tablist" aria-label="Account authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`tab-pill ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setLocalError('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`tab-pill ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setLocalError('');
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stack-form">
          <label className="field-label">
            <span>Username</span>
            <input
              ref={userInputRef}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. alex-dev"
              autoComplete="username"
              required
            />
          </label>
          <label className="field-label">
            <span>Password (minimum 8 characters · salted <code>scrypt</code>)</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {mode === 'register' && (
            <>
              <label className="field-label">
                <span>Primary Time Zone</span>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONE_PRESETS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.value}</option>
                  ))}
                </select>
              </label>
              <fieldset className="field-fieldset">
                <legend>Skills</legend>
                <div className="pill-row">
                  {SKILLS_CATALOG.map(sk => {
                    const active = selectedSkills.includes(sk.id);
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        aria-pressed={active}
                        className={`chip-toggle ${active ? 'active' : ''}`}
                        onClick={() => toggleSkill(sk.id)}
                      >
                        {active ? '✓ ' : ''}{sk.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {localError && (
            <div role="alert" className="inline-alert tone-error">
              {localError}
            </div>
          )}

          <div className="row-end">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <ShieldCheckIcon />
              {busy
                ? 'Verifying...'
                : mode === 'register'
                  ? 'Create Account & Continue'
                  : 'Sign In & Continue'}
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
}

export function AccessibilityStudioDrawer({ open, onClose, settings, onChange }) {
  function update(patch) {
    onChange({ ...settings, ...patch });
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      variant="drawer"
      eyebrow="DISPLAY, CONTRAST & KEYBOARD STUDIO"
      title="Extended Display & Comfort Options"
    >
      <p className="muted-copy">
        Adjust color palettes, text and field-of-view scale, multi-column layout, motion, perceptual relief, and single-key shortcuts. Saved automatically on this device.
      </p>

      <div className="section-block">
        <h3>1. Surface &amp; Contrast Palette</h3>
        <div className="theme-grid" role="radiogroup" aria-label="Visual theme">
          {THEME_OPTIONS.map(t => {
            const active = settings.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`studio-option-card ${active ? 'selected' : ''}`}
                onClick={() => update({ theme: t.id })}
              >
                <div className="row-between">
                  <strong>{t.label}</strong>
                  <span className="swatch-row" aria-hidden="true">
                    {t.swatch.map((c, idx) => (
                      <span key={idx} className="swatch-dot" style={{ background: c }} />
                    ))}
                  </span>
                </div>
                <span className="muted-copy">{t.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-block">
        <h3>2. Text &amp; FOV Scale</h3>
        <div className="option-pills-grid" role="radiogroup" aria-label="FOV and scale calibration">
          <button
            type="button"
            role="radio"
            aria-checked={!settings.scaleLocked}
            className={`studio-option-card compact ${!settings.scaleLocked ? 'selected' : ''}`}
            onClick={() => update({ scaleLocked: false, scale: '60' })}
          >
            <strong>Auto (60% Desktop / 100% Mobile)</strong>
            <span className="muted-copy">Adapts automatically across desktop, tablet, and phone</span>
          </button>
          {SCALE_OPTIONS.map(s => {
            const active = settings.scaleLocked && settings.scale === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ scaleLocked: true, scale: s.id })}
              >
                <strong>{s.label}</strong>
                <span className="muted-copy">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-block">
        <h3>3. Workspace Layout</h3>
        <div className="option-pills-grid" role="radiogroup" aria-label="Information density and layout">
          {DENSITY_OPTIONS.map(d => {
            const active = settings.density === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ density: d.id })}
              >
                <strong>{d.label}</strong>
                <span className="muted-copy">{d.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-block">
        <h3>4. Motion &amp; Perceptual Relief</h3>
        <div className="option-pills-grid" role="radiogroup" aria-label="Motion safety">
          {MOTION_OPTIONS.map(m => {
            const active = settings.motion === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ motion: m.id })}
              >
                <strong>{m.label}</strong>
                <span className="muted-copy">{m.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="option-pills-grid top-gap-xs">
          <button
            type="button"
            aria-pressed={settings.crrMode !== 'flat'}
            className={`studio-option-card compact ${settings.crrMode !== 'flat' ? 'selected' : ''}`}
            onClick={() => update({ crrMode: settings.crrMode === 'flat' ? 'crr' : 'flat' })}
          >
            <strong>Cognitive Relief Rendering (CRR): {settings.crrMode === 'flat' ? 'Flat Baseline' : 'Active'}</strong>
            <span className="muted-copy">
              Operable contact shadows, subtle negative-space lift, and cross-panel relationship ridges
            </span>
          </button>
          <button
            type="button"
            aria-pressed={settings.singleKeyShortcuts}
            className={`studio-option-card compact ${settings.singleKeyShortcuts ? 'selected' : ''}`}
            onClick={() => update({ singleKeyShortcuts: !settings.singleKeyShortcuts })}
          >
            <strong>Single-Key Shortcuts (/ and ?): {settings.singleKeyShortcuts ? 'On' : 'Off'}</strong>
            <span className="muted-copy">WCAG 2.1.4 control; automatically paused inside text fields</span>
          </button>
        </div>
      </div>

      <div className="section-block">
        <h3>5. Reading Line Width</h3>
        <button
          type="button"
          aria-pressed={settings.readingLock}
          className={`studio-option-card ${settings.readingLock ? 'selected' : ''}`}
          onClick={() => update({ readingLock: !settings.readingLock })}
        >
          <div className="row-between">
            <strong>68-Character Comfortable Line Width</strong>
            <span className="badge-pill">{settings.readingLock ? 'On (68ch)' : 'Full width'}</span>
          </div>
          <span className="muted-copy">
            Keeps paragraphs and explanations comfortable to scan on wide monitors.
          </span>
        </button>
      </div>

      <div className="row-between">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange(detectOsDefaults())}
        >
          Reset to Defaults
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          <CheckCircleIcon /> Done
        </button>
      </div>
    </ModalDialog>
  );
}

export function CommandPaletteModal({ open, onClose, commands }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      c =>
        c.label.toLowerCase().includes(q) ||
        (c.group || '').toLowerCase().includes(q) ||
        (c.keywords || '').toLowerCase().includes(q)
    );
  }, [commands, query]);

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      onClose();
      cmd.run();
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      variant="palette"
      initialFocusRef={inputRef}
      eyebrow="COMMAND SEARCH (CTRL+K OR /)"
      title="Jump to Any Step, Scenario, Display Mode, or Download"
    >
      <div className="palette-search-wrap">
        <SearchIcon size={18} className="palette-search-icon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search: find teammates, plan, download, high contrast, 50 people..."
          aria-label="Filter platform commands"
          className="palette-input"
        />
      </div>

      <div className="palette-list" role="listbox" aria-label="Available commands">
        {filtered.map((cmd, idx) => {
          const selected = idx === activeIndex;
          return (
            <button
              key={cmd.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`palette-item ${selected ? 'selected' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                onClose();
                cmd.run();
              }}
            >
              <div>
                <span className="palette-group">{cmd.group}</span>
                <strong className="palette-label">{cmd.label}</strong>
              </div>
              <span className="palette-hint">
                {cmd.shortcut ? <kbd>{cmd.shortcut}</kbd> : <ArrowRightIcon size={15} />}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="muted-copy empty-pad">No commands match "{query}". Try "plan", "download", or "contrast".</p>
        )}
      </div>
    </ModalDialog>
  );
}
