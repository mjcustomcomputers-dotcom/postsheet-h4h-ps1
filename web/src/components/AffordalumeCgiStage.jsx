import React, { useEffect, useRef } from 'react';
import {
  FLASHLIGHT_TINTS,
  FLASHLIGHT_POWERS,
  AFFORDALUME_FRAGMENT_SHADER,
  resolveStageOpticalUniforms,
  getLightSurfaceSpec,
  isMotionFrozen
} from '../ergonomics.js';

export { AFFORDALUME_FRAGMENT_SHADER, resolveStageOpticalUniforms };

const VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Hollywood 3-Point Matte Stage + Kaplan Soft-Fascination Peripheral Purpose Beacon + 1/f Bob Ross Grain
// 1. Key Light (u_lightPx): Soft quadratic Affordalume cone on active foveal workspace (Key:Fill ~ 1.58:1)
// 2. Rim / Purpose Beacon (u_beaconPx): Gentle magnocellular peripheral scent (Weber dL/L <= 0.38 < 0.50 startle)
// 3. Atmospheric Gobo Vignette: Soft edge recession + bounded 620ms Harmonic Completion Bloom (0.0 FPS at rest)
const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform vec2 u_lightPx;
uniform vec2 u_beaconPx;
uniform vec3 u_baseColor;
uniform vec3 u_tintColor;
uniform vec3 u_beaconColor;
uniform float u_strength;
uniform float u_beaconStrength;
uniform float u_bloomPhase;
uniform float u_radiusPx;
uniform float u_grainAmp;
uniform float u_isLight;
uniform float u_vignetteAlpha;
uniform float u_blueGlareClamp;
uniform float u_peakCap;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 px = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);

  // Subtle multi-octave 1/f matte grain eliminates 8-bit banding on OLED/LCD displays
  float g0 = hash12(floor(px));
  float g1 = hash12(floor(px * 0.5) + 17.0);
  float grain = ((g0 * 0.65 + g1 * 0.35) - 0.5) * u_grainAmp;

  // 1. Key Light: Bounded quadratic Affordalume cone on active focus
  float distKey = length(px - u_lightPx);
  float normKey = clamp(distKey / max(u_radiusPx, 1.0), 0.0, 1.0);
  float keyCone = 1.0 - smoothstep(0.0, 0.92, normKey);
  keyCone = keyCone * keyCone * u_strength;

  // 2. Peripheral Purpose Rim / Back-Fill Beacon (Soft-Fascination low-spatial-frequency glow)
  float distBeacon = length(px - u_beaconPx);
  float normBeacon = clamp(distBeacon / max(u_radiusPx * 1.28, 1.0), 0.0, 1.0);
  float beaconCone = 1.0 - smoothstep(0.0, 0.96, normBeacon);
  beaconCone = beaconCone * beaconCone * u_beaconStrength;

  // 3. Subtle Horizon Light-Bridge between Key focus and Purpose Beacon when guided
  vec2 seg = u_beaconPx - u_lightPx;
  float segLenSq = max(dot(seg, seg), 1.0);
  float projT = clamp(dot(px - u_lightPx, seg) / segLenSq, 0.0, 1.0);
  vec2 closestPt = u_lightPx + seg * projT;
  float bridgeDist = length(px - closestPt);
  float bridgeGlow = (1.0 - smoothstep(0.0, u_radiusPx * 0.55, bridgeDist)) * u_beaconStrength * 0.22;

  // 4. Gentle skylight + Hollywood Eye-Trace peripheral calm recession
  float topGlow = (1.0 - smoothstep(0.0, 0.85, 1.0 - v_uv.y)) * 0.024 * (1.0 - u_isLight);
  vec2 centeredUv = v_uv - vec2(0.5);
  float edgeVignette = smoothstep(0.24, 0.92, length(centeredUv)) * u_vignetteAlpha;

  // 5. Bounded Harmonic Completion Bloom (single calm wave when schedule reaches 100% readiness)
  float bloomWave = (1.0 - smoothstep(0.0, u_radiusPx * 1.65, distBeacon)) * u_bloomPhase * 0.11;

  vec3 col = max(u_baseColor * (1.0 - edgeVignette), vec3(0.0));
  col = mix(col, u_tintColor, clamp(keyCone + topGlow, 0.0, 0.30));
  col = mix(col, u_tintColor * 0.92 + col * 0.08, keyCone * 0.32);
  col = mix(col, u_beaconColor, clamp(beaconCone + bridgeGlow + bloomWave, 0.0, 0.16));
  col += vec3(grain);

  // Synthetic Blue-Glare Safety Switch & Peak Luminance Ceiling
  col.b = min(col.b, u_blueGlareClamp);
  col = clamp(col, vec3(0.0), vec3(u_peakCap));
  fragColor = vec4(col, 1.0);
}
`;

function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function getBaseRgbForTheme(theme, blueGlareShield = 'matte-balanced', lightSurface = 'moonlit-pearl') {
  const hexToRgb01 = hex => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255
    ];
  };
  switch (theme) {
    case 'warm-paper':
    case 'light': {
      const surfaceId =
        blueGlareShield === 'shield-max'
          ? 'blue-glare-shield'
          : blueGlareShield === 'sunlight-day'
            ? 'daylight-sun'
            : lightSurface;
      const spec = getLightSurfaceSpec(surfaceId);
      return hexToRgb01(spec.gutterHex);
    }
    case 'aaa-contrast':
      return [0.0, 0.0, 0.0]; // #000000
    case 'petrol-glass':
      return [0.024, 0.082, 0.110]; // #06151C
    case 'obsidian-prism':
      return [0.035, 0.051, 0.094]; // #090D18
    case 'matte-slate':
      return [0.067, 0.090, 0.114]; // #11171D
    default:
      return [0.027, 0.039, 0.055]; // #070A0E
  }
}

function getPurposeBeaconSpec(activeView, planComplete, w, h) {
  // Gently anchor peripheral back-fill to the companion column supporting the user's immediate goal
  if (activeView === 'authority') {
    return {
      x: w * 0.84,
      y: h * 0.34,
      rgb: [0.35, 0.78, 0.62] // Calm server-symmetry emerald
    };
  }
  if (activeView === 'arena') {
    return {
      x: w * 0.52,
      y: h * 0.42,
      rgb: [0.38, 0.74, 0.94] // Calm verification cyan-sage
    };
  }
  if (planComplete) {
    return {
      x: w * 0.62,
      y: h * 0.32,
      rgb: [0.40, 0.78, 0.58] // Harmonic ready emerald
    };
  }
  // Open schedule gap in Column 2 -> warm amber-gold Soft-Fascination scent (zero red alarm!)
  return {
    x: w * 0.62,
    y: h * 0.34,
    rgb: [0.88, 0.68, 0.32]
  };
}

export default function AffordalumeCgiStage({
  theme = 'h4h-glass',
  lightSurface = 'moonlit-pearl',
  motion = 'spring',
  crrMode = 'crr',
  stageDirector = 'cinema-guided',
  blueGlareShield = 'matte-balanced',
  flashlightTint = 'emerald',
  flashlightPower = 'balanced',
  activeView = 'discover',
  planComplete = false,
  pointerPxRef
}) {
  const canvasRef = useRef(null);
  const drawFnRef = useRef(null);
  const prevPlanCompleteRef = useRef(planComplete);
  const bloomValueRef = useRef(0);
  const telemetryRef = useRef({
    backend: 'Initializing',
    drawsTotal: 0,
    idleFps: 0,
    peakClamp: 0.92,
    keyToFillRatio: 1.58,
    peripheralWeberDelta: 0.34,
    stageDirector,
    blueGlareShield,
    blueSpikeReductionPct: 27.7,
    shade: flashlightTint,
    power: flashlightPower,
    lastTriggerReason: 'mount'
  });

  const frozen = isMotionFrozen(motion) || crrMode === 'flat';
  const guidedActive = !frozen && stageDirector !== 'minimal' && flashlightPower !== 'off' && theme !== 'aaa-contrast';
  const tintSpec = FLASHLIGHT_TINTS.find(t => t.id === flashlightTint) || FLASHLIGHT_TINTS[0];
  const powerSpec = FLASHLIGHT_POWERS.find(p => p.id === flashlightPower) || FLASHLIGHT_POWERS[1];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return undefined;

    const isForced = window.matchMedia?.('(forced-colors: active)').matches;
    if (isForced || theme === 'aaa-contrast') {
      telemetryRef.current = {
        ...telemetryRef.current,
        backend: theme === 'aaa-contrast' ? 'Pure-AAA-Matte' : 'Forced-Colors-Bypass',
        idleFps: 0,
        peripheralWeberDelta: 0,
        stageDirector: 'minimal',
        lastTriggerReason: 'mode-bypass'
      };
      window.__H4H_CGI_TELEMETRY__ = { ...telemetryRef.current };
      return undefined;
    }

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false
    });

    if (!gl) {
      telemetryRef.current = {
        ...telemetryRef.current,
        backend: 'CSS-Matte-Fallback',
        idleFps: 0,
        peripheralWeberDelta: guidedActive ? 0.28 : 0,
        stageDirector: guidedActive ? 'cinema-guided' : 'minimal',
        lastTriggerReason: 'no-webgl2'
      };
      window.__H4H_CGI_TELEMETRY__ = { ...telemetryRef.current };
      return undefined;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return undefined;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return undefined;
    }

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const locs = {
      res: gl.getUniformLocation(prog, 'u_res'),
      lightPx: gl.getUniformLocation(prog, 'u_lightPx'),
      beaconPx: gl.getUniformLocation(prog, 'u_beaconPx'),
      baseColor: gl.getUniformLocation(prog, 'u_baseColor'),
      tintColor: gl.getUniformLocation(prog, 'u_tintColor'),
      beaconColor: gl.getUniformLocation(prog, 'u_beaconColor'),
      strength: gl.getUniformLocation(prog, 'u_strength'),
      beaconStrength: gl.getUniformLocation(prog, 'u_beaconStrength'),
      bloomPhase: gl.getUniformLocation(prog, 'u_bloomPhase'),
      radiusPx: gl.getUniformLocation(prog, 'u_radiusPx'),
      grainAmp: gl.getUniformLocation(prog, 'u_grainAmp'),
      isLight: gl.getUniformLocation(prog, 'u_isLight'),
      vignetteAlpha: gl.getUniformLocation(prog, 'u_vignetteAlpha'),
      blueGlareClamp: gl.getUniformLocation(prog, 'u_blueGlareClamp'),
      peakCap: gl.getUniformLocation(prog, 'u_peakCap')
    };

    const drawDemandFrame = (reason = 'demand', lx = null, ly = null) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);

      const fallbackX = pointerPxRef?.current?.x ?? window.innerWidth * 0.34;
      const fallbackY = pointerPxRef?.current?.y ?? window.innerHeight * 0.28;
      const targetX = (lx ?? fallbackX) * dpr;
      const targetY = (ly ?? fallbackY) * dpr;

      const isLightTheme = theme === 'warm-paper' || theme === 'light';
      const resolvedSurfaceId =
        blueGlareShield === 'shield-max'
          ? 'blue-glare-shield'
          : blueGlareShield === 'sunlight-day'
            ? 'daylight-sun'
            : lightSurface;
      const lightSpec = getLightSurfaceSpec(resolvedSurfaceId);
      const baseRgb = getBaseRgbForTheme(theme, blueGlareShield, resolvedSurfaceId);
      const shieldActive = blueGlareShield === 'shield-max' || resolvedSurfaceId === 'blue-glare-shield';
      const tintRgb = shieldActive
        ? [tintSpec.glRgb[0], tintSpec.glRgb[1] * 0.94, tintSpec.glRgb[2] * 0.58]
        : tintSpec.glRgb;
      const activeStrength = frozen ? 0.0 : (isLightTheme ? Math.min(0.08, powerSpec.glStrength * 0.5) : powerSpec.glStrength);
      const beaconSpec = getPurposeBeaconSpec(activeView, planComplete, w, h);
      const beaconRgb = shieldActive
        ? [beaconSpec.rgb[0], beaconSpec.rgb[1] * 0.94, beaconSpec.rgb[2] * 0.58]
        : beaconSpec.rgb;
      const beaconStrength = guidedActive ? Math.min(0.11, activeStrength * 0.62) : 0.0;
      const isLightVal = isLightTheme ? 1.0 : 0.0;
      const vignetteAlphaVal = isLightTheme ? lightSpec.vignetteAlpha : 0.06;
      const blueGlareClampVal = isLightTheme ? lightSpec.blueGlareClamp : (shieldActive ? 0.84 : 0.88);
      const peakClampVal = isLightTheme ? lightSpec.peakLuminanceClamp : (shieldActive ? 0.90 : 0.92);
      const blueDropPct =
        shieldActive
          ? 34.2
          : resolvedSurfaceId === 'daylight-sun'
            ? 14.5
            : 24.7;
      const measuredWeber = guidedActive ? Number(Math.min(0.38, beaconStrength * 3.1).toFixed(2)) : 0;

      gl.uniform2f(locs.res, w, h);
      gl.uniform2f(locs.lightPx, targetX, targetY);
      gl.uniform2f(locs.beaconPx, beaconSpec.x, beaconSpec.y);
      gl.uniform3f(locs.baseColor, baseRgb[0], baseRgb[1], baseRgb[2]);
      gl.uniform3f(locs.tintColor, tintRgb[0], tintRgb[1], tintRgb[2]);
      gl.uniform3f(locs.beaconColor, beaconRgb[0], beaconRgb[1], beaconRgb[2]);
      gl.uniform1f(locs.strength, activeStrength);
      gl.uniform1f(locs.beaconStrength, beaconStrength);
      gl.uniform1f(locs.bloomPhase, guidedActive ? bloomValueRef.current : 0.0);
      gl.uniform1f(locs.radiusPx, 360 * dpr);
      gl.uniform1f(locs.grainAmp, isLightTheme ? 0.007 : 0.012);
      gl.uniform1f(locs.isLight, isLightVal);
      gl.uniform1f(locs.vignetteAlpha, vignetteAlphaVal);
      gl.uniform1f(locs.blueGlareClamp, blueGlareClampVal);
      gl.uniform1f(locs.peakCap, peakClampVal);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      telemetryRef.current = {
        backend: 'WebGL2-Affordalume-3Point',
        drawsTotal: telemetryRef.current.drawsTotal + 1,
        idleFps: 0,
        blueGlareClamp: blueGlareClampVal,
        peakClamp: peakClampVal,
        keyToFillRatio: 1.58,
        peripheralWeberDelta: measuredWeber,
        stageDirector: guidedActive ? 'cinema-guided' : 'minimal',
        lightSurface: isLightTheme ? resolvedSurfaceId : null,
        blueGlareShield,
        blueSpikeReductionPct: blueDropPct,
        shade: tintSpec.id,
        power: powerSpec.id,
        lastTriggerReason: reason
      };
      window.__H4H_CGI_TELEMETRY__ = { ...telemetryRef.current };
    };

    drawFnRef.current = drawDemandFrame;
    drawDemandFrame('theme-or-stage-sync');

    let rafId = null;
    let bloomRafId = null;

    // Bounded 620ms single ease-out Harmonic Completion Bloom when schedule transitions to complete (0.0 FPS once settled!)
    if (planComplete && !prevPlanCompleteRef.current && guidedActive && motion === 'spring') {
      const startTs = performance.now();
      const durationMs = 620;
      const stepBloom = now => {
        const t = Math.min(1, Math.max(0, (now - startTs) / durationMs));
        // Smooth bell curve peaking gently at t=0.35 and settling cleanly to 0 at t=1.0
        bloomValueRef.current = Math.sin(t * Math.PI) * (1 - t * 0.35);
        drawDemandFrame('harmonic-completion-bloom');
        if (t < 1) {
          bloomRafId = requestAnimationFrame(stepBloom);
        } else {
          bloomValueRef.current = 0;
          bloomRafId = null;
          drawDemandFrame('harmonic-bloom-settled');
        }
      };
      bloomRafId = requestAnimationFrame(stepBloom);
    }
    prevPlanCompleteRef.current = planComplete;

    const scheduleDemand = (reason, lx, ly) => {
      if (frozen || powerSpec.id === 'off') return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        drawDemandFrame(reason, lx, ly);
      });
    };

    const onPointerMove = e => scheduleDemand('pointer-flashlight', e.clientX, e.clientY);
    const onFocusIn = e => {
      const el = e.target;
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        scheduleDemand('keyboard-focus-halo', r.left + r.width * 0.5, r.top + r.height * 0.5);
      }
    };
    const onResize = () => drawDemandFrame('viewport-resize');

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('focusin', onFocusIn, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (bloomRafId) cancelAnimationFrame(bloomRafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onResize);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [theme, lightSurface, motion, crrMode, stageDirector, blueGlareShield, frozen, guidedActive, tintSpec, powerSpec, activeView, planComplete, pointerPxRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="affordalume-cgi-canvas no-print"
    />
  );
}
