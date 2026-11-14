import React, { useState, useRef, useMemo, useEffect } from 'react';
import ModalDialog from './ModalDialog.jsx';
import {
  THEME_OPTIONS,
  SCALE_OPTIONS,
  DENSITY_OPTIONS,
  MOTION_OPTIONS,
  FLASHLIGHT_TINTS,
  FLASHLIGHT_POWERS,
  CVD_MODE_OPTIONS,
  STAGE_DIRECTOR_OPTIONS,
  LIGHT_SURFACE_MODES,
  BLUE_GLARE_OPTIONS,
  DISABILITY_PRESETS,
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
  const raw = String(actorId).trim();
  const map = {
    'leader-aurora': 'Aurora',
    aurora: 'Aurora',
    'builder-kai': 'Kai',
    kai: 'Kai',
    'builder-priya': 'Priya',
    priya: 'Priya',
    'relay-mateo': 'Mateo',
    mateo: 'Mateo',
    'sanjay-steward': 'Sanjay',
    sanjay: 'Sanjay',
    'race-leader': 'Race Lead'
  };
  if (map[raw]) return map[raw];
  const lower = raw.toLowerCase();
  if (map[lower]) return map[lower];
  const knownPrefix = /^(aurora|kai|priya|mateo|sanjay)-/.exec(lower);
  if (knownPrefix) {
    return knownPrefix[1].charAt(0).toUpperCase() + knownPrefix[1].slice(1);
  }
  const memNamed = /^mem-([a-z]{2,14})-/.exec(lower);
  if (memNamed && !/^\d+$/.test(memNamed[1])) {
    const slug = memNamed[1] === 'sanjaystew' ? 'sanjay' : memNamed[1];
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  }
  const leadNamed = /^lead-([a-z]{2,14})-/.exec(lower);
  if (leadNamed) {
    return `Lead (${leadNamed[1]})`;
  }
  const cleaned = raw.replace(/^(leader|builder|relay)-/, '');
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handingOffRef = useRef(false);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    handingOffRef.current = false;
    const prevFocus = document.activeElement;
    const focusTimer = setTimeout(() => {
      const firstFocusable = menuRef.current?.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) firstFocusable.focus();
      else menuRef.current?.focus();
    }, 10);

    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        const trigger =
          document.querySelector('[data-acting-trigger]') ||
          (prevFocus && prevFocus.isConnected && prevFocus !== document.body ? prevFocus : null);
        trigger?.focus();
      }
    };
    const onPointerDown = e => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest?.('[data-acting-trigger]')) {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      if (!handingOffRef.current && menuRef.current?.contains(document.activeElement)) {
        document.querySelector('[data-acting-trigger]')?.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const profiles = [
    { id: 'leader-aurora', name: 'Aurora', role: 'Team lead · Backend & API (UTC-6)' },
    { id: 'builder-kai', name: 'Kai', role: 'Accessible UI · Frontend (UTC-6)' },
    { id: 'builder-priya', name: 'Priya', role: 'E2E Integration · Handoff (UTC+5:30)' },
    { id: 'relay-mateo', name: 'Mateo', role: 'Connected Teammate Relay · Database (UTC-5)' }
  ];

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Switch demo profile or account session"
      data-popover-owner="acting"
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
            handingOffRef.current = true;
            document.querySelector('[data-acting-trigger]')?.focus();
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handingOffRef = useRef(false);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    handingOffRef.current = false;
    const prevFocus = document.activeElement;
    const focusTimer = setTimeout(() => {
      const firstFocusable = popRef.current?.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) firstFocusable.focus();
      else popRef.current?.focus();
    }, 10);

    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        const trigger =
          document.querySelector('[data-display-trigger]') ||
          (prevFocus && prevFocus.isConnected && prevFocus !== document.body ? prevFocus : null);
        trigger?.focus();
      }
    };
    const onPointerDown = e => {
      if (popRef.current && !popRef.current.contains(e.target) && !e.target.closest?.('[data-display-trigger]')) {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      if (!handingOffRef.current && popRef.current?.contains(document.activeElement)) {
        document.querySelector('[data-display-trigger]')?.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  function patch(next) {
    onChange({ ...settings, ...next });
  }

  const isAutoScale = !settings.scaleLocked;

  return (
    <div
      ref={popRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Display and accessibility settings"
      data-popover-owner="display"
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
      <section className="ide-popover-section popover-section" aria-labelledby="heading-contrast-surface">
        <h3 id="heading-contrast-surface" className="ide-popover-label popover-section-title">
          2. CONTRAST &amp; SURFACE
        </h3>

        <div className="ide-seg-row popover-pill-grid-3" role="group" aria-label="Primary theme mode">
          <button
            type="button"
            className={`ide-seg-btn popover-pill ${settings.theme !== 'warm-paper' && settings.theme !== 'light' && settings.theme !== 'aaa-contrast' ? 'active is-active' : ''}`}
            aria-pressed={settings.theme !== 'warm-paper' && settings.theme !== 'light' && settings.theme !== 'aaa-contrast'}
            onClick={() => patch({ theme: 'h4h-glass', blueGlareShield: 'matte-balanced', lightSurface: 'moonlit-pearl' })}
          >
            Moonlight Dark
          </button>

          <button
            type="button"
            className={`ide-seg-btn popover-pill ${settings.theme === 'aaa-contrast' ? 'active is-active' : ''}`}
            aria-pressed={settings.theme === 'aaa-contrast'}
            onClick={() => patch({ theme: 'aaa-contrast', blueGlareShield: 'matte-balanced', lightSurface: 'moonlit-pearl' })}
          >
            High Contrast
          </button>

          <button
            type="button"
            className={`ide-seg-btn popover-pill ${(settings.theme === 'warm-paper' || settings.theme === 'light') && (settings.lightSurface || 'moonlit-pearl') === 'moonlit-pearl' && (settings.blueGlareShield || 'matte-balanced') === 'matte-balanced' ? 'active is-active' : ''}`}
            aria-pressed={(settings.theme === 'warm-paper' || settings.theme === 'light') && (settings.lightSurface || 'moonlit-pearl') === 'moonlit-pearl' && (settings.blueGlareShield || 'matte-balanced') === 'matte-balanced'}
            onClick={() => patch({ theme: 'warm-paper', lightSurface: 'moonlit-pearl', blueGlareShield: 'matte-balanced' })}
            title={LIGHT_SURFACE_MODES[0].description}
          >
            Moonlit Pearl (Light)
          </button>
        </div>

        {/* Optical Glare & Ambient Compensation Row */}
        <div
          className="ide-seg-row popover-pill-grid-2"
          role="group"
          aria-label="Light glare protection and outdoor sunlight modes"
          style={{ marginTop: '6px' }}
        >
          <button
            type="button"
            className={`ide-seg-btn popover-pill ${(settings.theme === 'warm-paper' || settings.theme === 'light') && (settings.lightSurface === 'blue-glare-shield' || settings.blueGlareShield === 'shield-max') ? 'active is-active' : ''}`}
            aria-pressed={(settings.theme === 'warm-paper' || settings.theme === 'light') && (settings.lightSurface === 'blue-glare-shield' || settings.blueGlareShield === 'shield-max')}
            onClick={() => patch({ theme: 'warm-paper', lightSurface: 'blue-glare-shield', blueGlareShield: 'shield-max' })}
            title={LIGHT_SURFACE_MODES[1].description}
          >
            Blue-Glare Shield (-34% Blue)
          </button>

          <button
            type="button"
            className={`ide-seg-btn popover-pill ${(settings.theme === 'warm-paper' || settings.theme === 'light') && (settings.lightSurface === 'daylight-sun' || settings.blueGlareShield === 'sunlight-day') ? 'active is-active' : ''}`}
            aria-pressed={(settings.theme === 'warm-paper' || settings.theme === 'light') && (settings.lightSurface === 'daylight-sun' || settings.blueGlareShield === 'sunlight-day')}
            onClick={() => patch({ theme: 'warm-paper', lightSurface: 'daylight-sun', blueGlareShield: 'sunlight-day' })}
            title={LIGHT_SURFACE_MODES[2].description}
          >
            Daylight Sun (Outdoor)
          </button>
        </div>
      </section>

      {/* Essential Control 3: CRR Layout & Affordalume */}
      <div className="ide-popover-section">
        <div className="ide-popover-label">3. CRR Layout &amp; Affordalume</div>
        <div className="ide-seg-grid" role="group" aria-label="CRR layout and Affordalume">
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
            Affordalume Shading
          </button>
          <button
            type="button"
            aria-pressed={settings.motion === 'off'}
            className={`ide-seg-btn ${settings.motion === 'off' ? 'active' : ''}`}
            onClick={() => patch({ motion: 'off' })}
          >
            Static Off
          </button>
          <button
            type="button"
            aria-pressed={settings.upperKeyMirror === true}
            className={`ide-seg-btn span-full ${settings.upperKeyMirror === true ? 'active' : ''}`}
            onClick={() => patch({ upperKeyMirror: settings.upperKeyMirror !== true })}
          >
            Shortcut Reference Bar: {settings.upperKeyMirror === true ? 'Visible' : 'Collapsed'}
          </button>
        </div>
      </div>

      <div className="ide-popover-section">
        <span className="ide-popover-label">4. Flashlight Shade &amp; Clarity Aids</span>
        <div className="ide-seg-grid two-col">
          {FLASHLIGHT_TINTS.slice(0, 4).map(tint => {
            const active = (settings.flashlightTint || 'emerald') === tint.id;
            return (
              <button
                key={tint.id}
                type="button"
                aria-pressed={active}
                className={`ide-seg-btn ${active ? 'active' : ''}`}
                onClick={() => patch({ flashlightTint: tint.id, crrMode: 'crr' })}
              >
                <span className="swatch-dot" style={{ background: tint.hex }} aria-hidden="true" />
                <span>{tint.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={settings.taskGuide !== false}
            className={`ide-seg-btn ${settings.taskGuide !== false ? 'active' : ''}`}
            onClick={() => patch({ taskGuide: settings.taskGuide === false })}
          >
            Step Guide: {settings.taskGuide !== false ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            aria-pressed={settings.textSpacing === 'wcag-1412'}
            className={`ide-seg-btn ${settings.textSpacing === 'wcag-1412' ? 'active' : ''}`}
            onClick={() => patch({ textSpacing: settings.textSpacing === 'wcag-1412' ? 'standard' : 'wcag-1412' })}
          >
            SC 1.4.12 Spacing
          </button>
          <button
            type="button"
            aria-pressed={settings.readingRuler === true}
            className={`ide-seg-btn ${settings.readingRuler === true ? 'active' : ''}`}
            onClick={() => patch({ readingRuler: !settings.readingRuler })}
          >
            Reading Ruler
          </button>
          <button
            type="button"
            aria-pressed={settings.cvdMode === 'cvd-safe'}
            className={`ide-seg-btn ${settings.cvdMode === 'cvd-safe' ? 'active' : ''}`}
            onClick={() => patch({ cvdMode: settings.cvdMode === 'cvd-safe' ? 'none' : 'cvd-safe' })}
          >
            CVD Safe + Hatch
          </button>
          <button
            type="button"
            aria-pressed={(settings.stageDirector || 'cinema-guided') !== 'minimal'}
            className={`ide-seg-btn span-full ${(settings.stageDirector || 'cinema-guided') !== 'minimal' ? 'active' : ''}`}
            onClick={() =>
              patch({
                stageDirector: (settings.stageDirector || 'cinema-guided') === 'minimal' ? 'cinema-guided' : 'minimal'
              })
            }
          >
            Cinema Purpose Cues: {(settings.stageDirector || 'cinema-guided') !== 'minimal' ? 'On' : 'Minimal'}
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
            handingOffRef.current = true;
            document.querySelector('[data-display-trigger]')?.focus();
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

export function WhyPurposeFirstModal({
  open,
  onClose,
  onJumpScenario,
  onNavigate,
  onOpenPalette
}) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      eyebrow="POST SHEET · HOW THIS PLATFORM WORKS & SHORTCUT GUIDE"
      title="Purpose-First Team Planning & Keyboard Guide"
    >
      <blockquote className="thesis-quote">
        "Connecting people through purpose: start from the work to be done, check that everyone's skills and hours fit together, and let the server confirm every spot."
      </blockquote>

      {/* Prominent Mouse / Touch Command Search Card (No Keyboard Needed) */}
      <div
        data-reactive-surface=""
        className="subcard guide-search-spotlight"
      >
        <div className="row-between wrap-gap">
          <div>
            <span className="eyebrow-tag">INSTANT NAVIGATION · NO KEYBOARD REQUIRED</span>
            <h3>Command Search: Find People, Skills, Scenarios, or Actions</h3>
            <p className="small-copy muted-copy top-gap-xs">
              Jump straight to any teammate, skill filter, schedule scenario, display contrast mode, offline relay test, 50-person race, or white-paper download with a single click or tap.
            </p>
          </div>
          {onOpenPalette && (
            <button
              type="button"
              data-reactive-surface=""
              className="btn btn-primary guide-open-search-btn"
              onClick={() => {
                onClose();
                onOpenPalette();
              }}
            >
              <SearchIcon size={15} /> Open Command Search
            </button>
          )}
        </div>
      </div>

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
            <li><strong>Server-Confirmed Spots &amp; Offline Forwarding:</strong> 50-person race safety and offline request forwarding through a connected teammate.</li>
          </ul>
        </div>
      </div>

      <div className="subcard top-gap-sm">
        <div className="row-between wrap-gap">
          <h3>Verified Keyboard &amp; Accessibility Shortcuts</h3>
          <span className="badge-pill">Paused automatically inside text inputs</span>
        </div>
        <div className="shortcut-reference-grid top-gap-xs small-copy">
          <div className="shortcut-ref-item"><kbd>?</kbd> or <kbd>g</kbd> or <kbd>F1</kbd> <span>Open this Guide</span></div>
          <div className="shortcut-ref-item"><kbd>/</kbd> or <kbd>Ctrl+K</kbd> <span>Open Command Search</span></div>
          <div className="shortcut-ref-item"><kbd>1..4</kbd> or <kbd>Alt+1..4</kbd> <span>Switch steps 1 through 4</span></div>
          <div className="shortcut-ref-item"><kbd>f</kbd> <span>Focus teammate &amp; skill filter</span></div>
          <div className="shortcut-ref-item"><kbd>[</kbd> and <kbd>]</kbd> <span>Previous / next team page</span></div>
          <div className="shortcut-ref-item"><kbd>p</kbd> <span>Switch Acting-As profile</span></div>
          <div className="shortcut-ref-item"><kbd>d</kbd> or <kbd>Ctrl+Shift+A</kbd> <span>Display, Scale &amp; Contrast</span></div>
          <div className="shortcut-ref-item"><kbd>e</kbd> <span>Download Team Plan HTML</span></div>
          <div className="shortcut-ref-item"><kbd>r</kbd> <span>Refresh live server board</span></div>
          <div className="shortcut-ref-item"><kbd>Esc</kbd> <span>Close dialog or leave input</span></div>
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
            { id: 'builder-priya', name: 'Priya', desc: 'Integration · Handoff (UTC+5:30)' },
            { id: 'relay-mateo', name: 'Mateo', desc: 'Connected Teammate Relay · Database (UTC-5)' }
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
        <div
          className="tab-strip"
          role="tablist"
          aria-label="Account authentication mode"
          onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const next =
              e.key === 'Home'
                ? 'login'
                : e.key === 'End'
                  ? 'register'
                  : mode === 'login'
                    ? 'register'
                    : 'login';
            setMode(next);
            setLocalError('');
            const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
            const targetBtn = next === 'login' ? tabs[0] : tabs[1];
            requestAnimationFrame(() => targetBtn?.focus());
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            tabIndex={mode === 'login' ? 0 : -1}
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
            tabIndex={mode === 'register' ? 0 : -1}
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
      returnFocusSelector="[data-display-trigger]"
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
        <div className="option-pills-grid top-gap-xs" role="radiogroup" aria-label="Synthetic blue-glare safety switch and sunlight mode">
          {BLUE_GLARE_OPTIONS.map(bg => {
            const active = (settings.blueGlareShield || 'matte-balanced') === bg.id;
            return (
              <button
                key={bg.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ blueGlareShield: bg.id })}
              >
                <strong>{bg.label}</strong>
                <span className="muted-copy">{bg.desc}</span>
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
          {STAGE_DIRECTOR_OPTIONS.map(sd => {
            const active = (settings.stageDirector || 'cinema-guided') === sd.id;
            return (
              <button
                key={sd.id}
                type="button"
                aria-pressed={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ stageDirector: sd.id })}
              >
                <strong>{sd.label}</strong>
                <span className="muted-copy">{sd.desc}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={settings.singleKeyShortcuts}
            className={`studio-option-card compact ${settings.singleKeyShortcuts ? 'selected' : ''}`}
            onClick={() => update({ singleKeyShortcuts: !settings.singleKeyShortcuts })}
          >
            <strong>Single-Key Shortcuts (/, ?, 1-4, f, p, d, e, r): {settings.singleKeyShortcuts ? 'On' : 'Off'}</strong>
            <span className="muted-copy">WCAG 2.1.4 character-key control; automatically paused inside text fields</span>
          </button>
          <button
            type="button"
            aria-pressed={settings.upperKeyMirror === true}
            className={`studio-option-card compact ${settings.upperKeyMirror === true ? 'selected' : ''}`}
            onClick={() => update({ upperKeyMirror: settings.upperKeyMirror !== true })}
          >
            <strong>Upper Shortcut Reference Bar: {settings.upperKeyMirror === true ? 'Visible' : 'Collapsed'}</strong>
            <span className="muted-copy">Expandable top bar with keyboard shortcut reference pills</span>
          </button>
        </div>
      </div>

      <div className="section-block">
        <h3>5. Reading Line Width &amp; Comprehension Aids</h3>
        <div className="studio-stack">
          <button
            type="button"
            aria-pressed={settings.taskGuide !== false}
            className={`studio-option-card compact ${settings.taskGuide !== false ? 'selected' : ''}`}
            onClick={() => update({ taskGuide: settings.taskGuide === false })}
          >
            <strong>Plain-Language Task Clarity Guide (W3C COGA): {settings.taskGuide !== false ? 'Active' : 'Minimized'}</strong>
            <span className="muted-copy">
              Pins current step goal, live state memory anchors, safe consequence preview, and next action in Grade &lt;= 6 English.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={settings.textSpacing === 'wcag-1412'}
            className={`studio-option-card compact ${settings.textSpacing === 'wcag-1412' ? 'selected' : ''}`}
            onClick={() => update({ textSpacing: settings.textSpacing === 'wcag-1412' ? 'standard' : 'wcag-1412' })}
          >
            <strong>Dyslexia &amp; Low-Vision Text Spacing (WCAG 1.4.12): {settings.textSpacing === 'wcag-1412' ? 'On' : 'Standard'}</strong>
            <span className="muted-copy">
              Applies &gt;=1.5 line height, 0.12em letter spacing, and 0.16em word spacing with zero clipped controls.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={settings.readingRuler === true}
            className={`studio-option-card compact ${settings.readingRuler === true ? 'selected' : ''}`}
            onClick={() => update({ readingRuler: !settings.readingRuler })}
          >
            <strong>Focus Reading Ruler Band: {settings.readingRuler ? 'On' : 'Off'}</strong>
            <span className="muted-copy">
              Soft horizontal line-tracking band following pointer or keyboard focus for Dyslexia and ADHD line tracking.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={settings.calmFirewall === true}
            className={`studio-option-card compact ${settings.calmFirewall === true ? 'selected' : ''}`}
            onClick={() => update({ calmFirewall: !settings.calmFirewall })}
          >
            <strong>Cognitive Firewall Calm Mode: {settings.calmFirewall ? 'On' : 'Standard'}</strong>
            <span className="muted-copy">
              Freezes background invite countdown ticks and softens peripheral visual contrast for calm executive focus.
            </span>
          </button>
          <button
            type="button"
            aria-pressed={settings.readingLock}
            className={`studio-option-card compact ${settings.readingLock ? 'selected' : ''}`}
            onClick={() => update({ readingLock: !settings.readingLock })}
          >
            <strong>68-Character Comfortable Line Width: {settings.readingLock ? 'On (68ch)' : 'Full width'}</strong>
            <span className="muted-copy">
              Keeps paragraphs and explanations comfortable to scan on wide monitors.
            </span>
          </button>
        </div>
      </div>

      <div className="section-block">
        <h3>6. Affordalume Matte Flashlight Shade &amp; Beam Power</h3>
        <div className="studio-grid">
          {FLASHLIGHT_TINTS.map(tint => {
            const active = (settings.flashlightTint || 'emerald') === tint.id;
            return (
              <button
                key={tint.id}
                type="button"
                aria-pressed={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ flashlightTint: tint.id, crrMode: 'crr' })}
              >
                <div className="row-between">
                  <strong>{tint.label}</strong>
                  <span className="swatch-dot" style={{ background: tint.hex }} aria-hidden="true" />
                </div>
                <span className="muted-copy">{tint.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="pill-row top-gap-xs" role="group" aria-label="Flashlight beam intensity">
          {FLASHLIGHT_POWERS.map(pw => {
            const active = (settings.flashlightPower || 'balanced') === pw.id;
            return (
              <button
                key={pw.id}
                type="button"
                aria-pressed={active}
                className={`btn ${active ? 'btn-primary' : 'btn-secondary'} btn-compact`}
                onClick={() => update({ flashlightPower: pw.id })}
              >
                Beam: {pw.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-block">
        <h3>7. Color-Vision Deficiency (CVD) Safe Mode &amp; Simulator</h3>
        <div className="studio-grid">
          {CVD_MODE_OPTIONS.map(cvd => {
            const active = (settings.cvdMode || 'none') === cvd.id;
            return (
              <button
                key={cvd.id}
                type="button"
                aria-pressed={active}
                className={`studio-option-card compact ${active ? 'selected' : ''}`}
                onClick={() => update({ cvdMode: cvd.id })}
              >
                <strong>{cvd.label}</strong>
                <span className="muted-copy">{cvd.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-block">
        <h3>8. One-Click Disability &amp; Comprehension Presets</h3>
        <div className="pill-row wrap-gap" role="group" aria-label="Disability and comprehension presets">
          {DISABILITY_PRESETS.map(pr => (
            <button
              key={pr.id}
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => update(pr.patch)}
            >
              {pr.label}
            </button>
          ))}
        </div>
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
      eyebrow="COMMAND SEARCH (CLICK, CTRL+K, OR /)"
      title="Search Teammates, Skills, Steps, Scenarios, Display, or Export"
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
          placeholder="Search people (Priya, Mateo), skills (backend, ui), steps, contrast, 50 race..."
          aria-label="Filter platform commands"
          className="palette-input"
        />
      </div>

      <div className="pill-row palette-quick-chips" role="group" aria-label="Quick command categories">
        {[
          { label: 'All', q: '' },
          { label: 'Teammates', q: 'Teammates' },
          { label: 'Skills', q: 'Skill Filter' },
          { label: 'Scenarios', q: 'Example Plans' },
          { label: 'Live Tests', q: 'Live Tests' },
          { label: 'Display', q: 'Display' }
        ].map(cat => (
          <button
            key={cat.label}
            type="button"
            aria-pressed={query.toLowerCase() === cat.q.toLowerCase()}
            className={`mini-preset-chip ${query.toLowerCase() === cat.q.toLowerCase() ? 'active' : ''}`}
            onClick={() => {
              setQuery(cat.q);
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
          >
            {cat.label}
          </button>
        ))}
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
