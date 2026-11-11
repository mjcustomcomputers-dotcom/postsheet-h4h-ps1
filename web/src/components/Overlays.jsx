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

export function WhyPurposeFirstModal({ open, onClose, onJumpScenario, onNavigate }) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      eyebrow="POST SHEET x SYNCHRONICITY · CORE THESIS"
      title="Why Purpose First? Inverting Hackathon Team Formation"
    >
      <blockquote className="thesis-quote">
        "Start from what you are building, prove critical-path ability and UTC handoffs, and commit scarce seats atomically."
      </blockquote>

      <div className="comparison-grid">
        <div className="subcard tone-warn">
          <h3>Conventional Profile-First Boards</h3>
          <ul className="clean-list">
            <li>Filter people by static skill tags, cities, or prestige labels.</li>
            <li>Stop checking readiness the moment seats hit <code>4 / 4</code> or <code>5 / 5</code>.</li>
            <li>Fail silently when one versatile builder is double-booked across two simultaneous critical-path tasks (<strong>Hall Capacity Deficit</strong>).</li>
            <li>Reject 11.5-hour timezone pairs even when asynchronous dependency handoffs align cleanly.</li>
            <li>Overfill scarce final seats or lose pending joins during venue Wi-Fi / WAN drops.</li>
          </ul>
        </div>

        <div className="subcard tone-ok">
          <h3>Post Sheet Purpose-First Inversion</h3>
          <ul className="clean-list">
            <li><strong>Backward-Slack Critical-Path DAG:</strong> Schedules tightest Earliest-Due-Date (<code>ES..LF</code>) tasks first and proves directed UTC baton-passes.</li>
            <li><strong>Wildcard Omega &amp; P9R Gate:</strong> Asks <strong>zero questions</strong> when an unconditional witness exists (<code>EXISTS_FORALL_ROBUST</code>), or emits the single highest-gain Shannon VOI check.</li>
            <li><strong>Zero-Displacement Hall Repair:</strong> Adds complementary builders without evicting accepted teammates.</li>
            <li><strong>Layer-A SQLite Serializability + Layer-B Peer Relay:</strong> Single-winner 50-way burst safety + signed offline claim forwarding.</li>
          </ul>
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
          <SparklesIcon /> Try Async UTC Baton-Pass
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onClose();
            onJumpScenario('hall');
          }}
        >
          Try Hall Contention Repair
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onClose();
            onNavigate('arena');
          }}
        >
          <ZapIcon /> Run 50-Claimant Race Oracle
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
      setLocalError('Password must be at least 8 characters (scrypt KDF policy).');
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
        setLocalError('Demo personas are disabled (PS1_DEMO_AUTH=0). Register or sign in with salted scrypt below.');
      }
    } catch (err) {
      setLocalError(err.message || 'Demo persona switch failed. Register a salted scrypt account below.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      initialFocusRef={userInputRef}
      eyebrow="LAYER-A BEARER HMAC + SCRYPT KDF"
      title="Judge Personas & Verified Account Session"
    >
      {authPromptMessage && (
        <div role="alert" className="inline-alert tone-warn">
          <div className="pill-row">
            <AlertTriangleIcon size={16} />
            <strong>Queued Action Ready for Replay:</strong>
          </div>
          <p className="small-top">{authPromptMessage}</p>
        </div>
      )}

      <div className="subcard">
        <div className="row-between wrap-gap">
          <div>
            <strong>Current Authenticated Subject:</strong>{' '}
            <span className="mono-pill">{actorId || 'Unauthenticated'}</span>
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
              Sign Out &amp; Revoke Bearer Token
            </button>
          )}
        </div>
        <p className="muted-copy small-top">
          All Layer-A mutations bind identity strictly from the verified HMAC-SHA256 Bearer subject (client-supplied <code>actorId</code> fields are ignored). Logout hashes and revokes the token in SQLite <code>ps1_revoked_tokens</code>.
        </p>
      </div>

      <div className="section-block">
        <h3>1-Click Judge Quick Personas (<code>/api/auth/demo</code>)</h3>
        <p className="muted-copy">Switch instantly while auto-arming <code>relay-mateo</code> for WAN-drop peer relay tests:</p>
        <div className="pill-row">
          {[
            { id: 'leader-aurora', desc: 'Team Leader · Backend/DB (UTC-6)' },
            { id: 'builder-kai', desc: 'Builder · Accessible UI (UTC-6)' },
            { id: 'builder-priya', desc: 'Builder · Async Relay (UTC+5:30)' }
          ].map(p => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              className={`btn ${actorId === p.id && token ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleQuickPersona(p.id)}
            >
              <UserIcon /> {p.id} <span className="btn-sub">{p.desc}</span>
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
            Sign In (<code>/api/auth/login</code>)
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
            Register Account (<code>/api/auth/register</code>)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stack-form">
          <label className="field-label">
            <span>Username (Actor ID)</span>
            <input
              ref={userInputRef}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. judge-alex"
              autoComplete="username"
              required
            />
          </label>
          <label className="field-label">
            <span>Password (minimum 8 characters · salted Node <code>scryptSync</code>)</span>
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
                <span>Primary UTC Window</span>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONE_PRESETS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.value}</option>
                  ))}
                </select>
              </label>
              <fieldset className="field-fieldset">
                <legend>Declared Skills</legend>
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
                  ? 'Create Salted scrypt Account & Continue'
                  : 'Sign In with scrypt & Continue'}
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
      eyebrow="POSTSHEET WORKSTATION · WCAG 2.2 AA / AAA STUDIO"
      title="Accessibility & Calm-FOV Studio"
    >
      <p className="muted-copy">
        Calibrate luminance, optical header rim vs. matte reading surfaces, field-of-view scale, panoramic workbench density, motion physics, and macular reading width. Persisted in <code>localStorage</code> and honoring OS media queries.
      </p>

      <div className="section-block">
        <h3>1. Visual Theme &amp; Contrast Surface</h3>
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
        <h3>2. FOV &amp; Typographic Scale Calibration</h3>
        <div className="option-pills-grid" role="radiogroup" aria-label="FOV and scale calibration">
          {SCALE_OPTIONS.map(s => {
            const active = settings.scale === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ scale: s.id })}
              >
                <strong>{s.label}</strong>
                <span className="muted-copy">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-block">
        <h3>3. Information Density &amp; Workbench Architecture</h3>
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
        <h3>4. Motion Safety</h3>
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
      </div>

      <div className="section-block">
        <h3>5. Macular Reading Comfort</h3>
        <button
          type="button"
          aria-pressed={settings.readingLock}
          className={`studio-option-card ${settings.readingLock ? 'selected' : ''}`}
          onClick={() => update({ readingLock: !settings.readingLock })}
        >
          <div className="row-between">
            <strong>68ch Optimal Macular Reading Width Lock</strong>
            <span className="badge-pill">{settings.readingLock ? 'ACTIVE (68ch)' : 'UNLOCKED (Full)'}</span>
          </div>
          <span className="muted-copy">
            Constrains narrative explanations, diagnostics, and audit prose to 68 characters per line to eliminate horizontal saccade fatigue on wide monitors.
          </span>
        </button>
      </div>

      <div className="row-between">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange(detectOsDefaults())}
        >
          Reset to OS-Calibrated Defaults
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
      eyebrow="KEYBOARD COMMAND PALETTE (CTRL+K OR /)"
      title="Jump to Any View, Scenario, Theme, Panorama, or Proof"
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
          placeholder="Type a command: baton, hall, panorama, charter, race 50, spatial glass..."
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
          <p className="muted-copy empty-pad">No commands match "{query}". Try "Scenario", "Panorama", or "Theme".</p>
        )}
      </div>
    </ModalDialog>
  );
}
