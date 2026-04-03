import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "study" | "break";

interface TimerState {
  session: number;
  mode: Mode;
  timeLeft: number;
  isRunning: boolean;
}

interface Settings {
  study: number;
  break: number;
  sessions: number;
}

interface SessionStyle {
  sessionTextColor: string;
  sessionOutlineColor: string;
  sessionOutlineThickness: number;
}

interface ModeStyle {
  modeColor: string;
  modeOutlineColor: string;
  modeOutlineThickness: number;
}

const DEFAULT_SESSION_STYLE: SessionStyle = {
  sessionTextColor: "#ffffff",
  sessionOutlineColor: "#000000",
  sessionOutlineThickness: 1,
};

const DEFAULT_MODE_STYLE: ModeStyle = {
  modeColor: "#00ff88",
  modeOutlineColor: "#000000",
  modeOutlineThickness: 1,
};

function hexToRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    autostart: params.get("autostart") === "true",
    studyMin: params.has("study")
      ? Math.max(1, Number.parseInt(params.get("study")!, 10))
      : null,
    breakMin: params.has("break")
      ? Math.max(1, Number.parseInt(params.get("break")!, 10))
      : null,
    sessions: params.has("sessions")
      ? Math.max(1, Number.parseInt(params.get("sessions")!, 10))
      : null,
    currentSession: params.has("current")
      ? Math.max(1, Number.parseInt(params.get("current")!, 10))
      : null,
    transparent: params.get("transparent") === "true",
    // Session text URL params
    sessionColor: params.get("sessionColor"),
    sessionOutline: params.get("sessionOutline"),
    sessionStroke: params.has("sessionStroke")
      ? Math.min(
          3,
          Math.max(0, Number.parseFloat(params.get("sessionStroke")!)),
        )
      : null,
    // Mode text URL params
    modeColor: params.get("modeColor"),
    modeOutline: params.get("modeOutline"),
  };
}

function loadStoredSettings(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem("pomodoro_settings");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<Settings>;
  } catch {
    return null;
  }
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem("pomodoro_settings", JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function loadStoredSession(): { current: number; total: number } | null {
  try {
    const raw = localStorage.getItem("pomodoro_session_control");
    if (!raw) return null;
    return JSON.parse(raw) as { current: number; total: number };
  } catch {
    return null;
  }
}

function saveSessionControl(current: number, total: number) {
  try {
    localStorage.setItem(
      "pomodoro_session_control",
      JSON.stringify({ current, total }),
    );
  } catch {
    // ignore
  }
}

// Session style uses exact localStorage keys as specified
function loadStoredSessionStyle(): Partial<SessionStyle> | null {
  try {
    const color = localStorage.getItem("sessionTextColor");
    const outline = localStorage.getItem("sessionOutlineColor");
    const thicknessRaw = localStorage.getItem("sessionOutlineThickness");
    if (!color && !outline && thicknessRaw === null) return null;
    const result: Partial<SessionStyle> = {};
    if (color) result.sessionTextColor = color;
    if (outline) result.sessionOutlineColor = outline;
    if (thicknessRaw !== null)
      result.sessionOutlineThickness = Number(thicknessRaw);
    return result;
  } catch {
    return null;
  }
}

function saveSessionStyle(style: SessionStyle) {
  try {
    localStorage.setItem("sessionTextColor", style.sessionTextColor);
    localStorage.setItem("sessionOutlineColor", style.sessionOutlineColor);
    localStorage.setItem(
      "sessionOutlineThickness",
      String(style.sessionOutlineThickness),
    );
  } catch {
    // ignore
  }
}

function loadStoredModeStyle(): Partial<ModeStyle> | null {
  try {
    const raw = localStorage.getItem("pomodoro_mode_style");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ModeStyle>;
  } catch {
    return null;
  }
}

function saveModeStyle(style: ModeStyle) {
  try {
    localStorage.setItem("pomodoro_mode_style", JSON.stringify(style));
  } catch {
    // ignore
  }
}

function playBeep(frequency = 880, duration = 0.15, volume = 0.25) {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
    osc.onended = () => ctx.close();
  } catch {
    // ignore audio errors
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const urlParams = useRef(parseUrlParams());

  // Resolve initial settings: URL params > localStorage > defaults
  const resolveInitialSettings = (): {
    study: string;
    break: string;
    sessions: string;
  } => {
    const stored = loadStoredSettings();
    const studyVal = urlParams.current.studyMin ?? stored?.study ?? 25;
    const breakVal = urlParams.current.breakMin ?? stored?.break ?? 5;
    const sessionsVal = urlParams.current.sessions ?? stored?.sessions ?? 7;
    return {
      study: String(studyVal),
      break: String(breakVal),
      sessions: String(sessionsVal),
    };
  };

  const initialSettings = resolveInitialSettings();

  const resolveInitialSessionControl = (): {
    current: number;
    total: number;
  } => {
    const stored = loadStoredSession();
    const totalFromUrl = urlParams.current.sessions ?? null;
    const currentFromUrl = urlParams.current.currentSession ?? null;
    const total = totalFromUrl ?? stored?.total ?? 7;
    const current = currentFromUrl ?? stored?.current ?? 1;
    return {
      current: Math.min(Math.max(1, current), total),
      total: Math.max(1, total),
    };
  };

  const initialSessionControl = resolveInitialSessionControl();

  // Resolve initial SESSION text style: URL params > localStorage > defaults
  const resolveInitialSessionStyle = (): SessionStyle => {
    const stored = loadStoredSessionStyle();
    return {
      sessionTextColor:
        urlParams.current.sessionColor ??
        stored?.sessionTextColor ??
        DEFAULT_SESSION_STYLE.sessionTextColor,
      sessionOutlineColor:
        urlParams.current.sessionOutline ??
        stored?.sessionOutlineColor ??
        DEFAULT_SESSION_STYLE.sessionOutlineColor,
      sessionOutlineThickness:
        urlParams.current.sessionStroke ??
        stored?.sessionOutlineThickness ??
        DEFAULT_SESSION_STYLE.sessionOutlineThickness,
    };
  };

  // Resolve initial MODE text style: URL params > localStorage > defaults
  const resolveInitialModeStyle = (): ModeStyle => {
    const stored = loadStoredModeStyle();
    return {
      modeColor:
        urlParams.current.modeColor ??
        stored?.modeColor ??
        DEFAULT_MODE_STYLE.modeColor,
      modeOutlineColor:
        urlParams.current.modeOutline ??
        stored?.modeOutlineColor ??
        DEFAULT_MODE_STYLE.modeOutlineColor,
      modeOutlineThickness:
        stored?.modeOutlineThickness ?? DEFAULT_MODE_STYLE.modeOutlineThickness,
    };
  };

  const [studyInput, setStudyInput] = useState<string>(initialSettings.study);
  const [breakInput, setBreakInput] = useState<string>(initialSettings.break);
  const [sessionsInput, setSessionsInput] = useState<string>(
    initialSettings.sessions,
  );

  const [currentSessionInput, setCurrentSessionInput] = useState<string>(
    String(initialSessionControl.current),
  );
  const [totalSessionsInput, setTotalSessionsInput] = useState<string>(
    String(initialSessionControl.total),
  );

  // Separate style states for SESSION and MODE
  const [sessionStyle, setSessionStyle] = useState<SessionStyle>(
    resolveInitialSessionStyle,
  );
  const [modeStyle, setModeStyle] = useState<ModeStyle>(
    resolveInitialModeStyle,
  );

  const [showSettings, setShowSettings] = useState(false);
  const [isTransparent, setIsTransparent] = useState(
    urlParams.current.transparent,
  );
  const [copyLabel, setCopyLabel] = useState("COPY LINK");
  const [visualMode, setVisualMode] = useState<Mode>("study");
  const [transitioning, setTransitioning] = useState(false);

  const pendingStudyRef = useRef(
    Math.max(1, Number.parseInt(initialSettings.study) || 25),
  );
  const pendingBreakRef = useRef(
    Math.max(1, Number.parseInt(initialSettings.break) || 5),
  );
  const pendingSessionsRef = useRef(
    Math.max(1, Number.parseInt(initialSettings.sessions) || 7),
  );
  const pendingCurrentSessionRef = useRef(initialSessionControl.current);
  const pendingTotalSessionsRef = useRef(initialSessionControl.total);

  // Persist settings on change
  useEffect(() => {
    pendingStudyRef.current = Math.max(1, Number.parseInt(studyInput) || 25);
    pendingBreakRef.current = Math.max(1, Number.parseInt(breakInput) || 5);
    pendingSessionsRef.current = Math.max(
      1,
      Number.parseInt(sessionsInput) || 7,
    );
    saveSettings({
      study: pendingStudyRef.current,
      break: pendingBreakRef.current,
      sessions: pendingSessionsRef.current,
    });
  }, [studyInput, breakInput, sessionsInput]);

  useEffect(() => {
    const total = Math.max(1, Number.parseInt(totalSessionsInput) || 7);
    const current = Math.min(
      Math.max(1, Number.parseInt(currentSessionInput) || 1),
      total,
    );
    pendingCurrentSessionRef.current = current;
    pendingTotalSessionsRef.current = total;
    setTimerState((prev) => ({
      ...prev,
      session: current,
    }));
    saveSessionControl(current, total);
  }, [currentSessionInput, totalSessionsInput]);

  // Persist SESSION style on change (individual localStorage keys)
  useEffect(() => {
    saveSessionStyle(sessionStyle);
  }, [sessionStyle]);

  // Persist MODE style on change
  useEffect(() => {
    saveModeStyle(modeStyle);
  }, [modeStyle]);

  const initState = (): TimerState => {
    const initStudy = pendingStudyRef.current;
    return {
      session: initialSessionControl.current,
      mode: "study",
      timeLeft: initStudy * 60,
      isRunning: urlParams.current.autostart,
    };
  };

  const [timerState, setTimerState] = useState<TimerState>(initState);
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;

  useEffect(() => {
    if (timerState.mode !== visualMode) {
      setTransitioning(true);
      const t = setTimeout(() => {
        setVisualMode(timerState.mode);
        setTransitioning(false);
      }, 120);
      return () => clearTimeout(t);
    }
  }, [timerState.mode, visualMode]);

  useEffect(() => {
    if (isTransparent) {
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";
    } else {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    }
  }, [isTransparent]);

  const advance = useCallback(() => {
    const cur = timerStateRef.current;
    playBeep();
    if (cur.mode === "study") {
      setTimerState({
        session: cur.session,
        mode: "break",
        timeLeft: pendingBreakRef.current * 60,
        isRunning: true,
      });
    } else {
      const nextSession = cur.session + 1;
      if (nextSession > pendingTotalSessionsRef.current) {
        // All sessions done — stop and stay at last session
        setTimerState({
          session: pendingTotalSessionsRef.current,
          mode: "study",
          timeLeft: pendingStudyRef.current * 60,
          isRunning: false,
        });
        setCurrentSessionInput(String(pendingTotalSessionsRef.current));
        pendingCurrentSessionRef.current = pendingTotalSessionsRef.current;
      } else {
        setTimerState({
          session: nextSession,
          mode: "study",
          timeLeft: pendingStudyRef.current * 60,
          isRunning: true,
        });
        setCurrentSessionInput(String(nextSession));
        pendingCurrentSessionRef.current = nextSession;
        saveSessionControl(nextSession, pendingTotalSessionsRef.current);
      }
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!timerState.isRunning) return;
    const interval = setInterval(() => {
      setTimerState((prev) => {
        if (prev.timeLeft <= 1) {
          clearInterval(interval);
          return { ...prev, timeLeft: 0, isRunning: false };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerState.isRunning]);

  const wasRunningRef = useRef(false);
  const advancedRef = useRef(false);

  useEffect(() => {
    if (timerState.isRunning) {
      wasRunningRef.current = true;
      advancedRef.current = false;
    }
  }, [timerState.isRunning]);

  useEffect(() => {
    if (
      timerState.timeLeft === 0 &&
      !timerState.isRunning &&
      wasRunningRef.current &&
      !advancedRef.current
    ) {
      advancedRef.current = true;
      wasRunningRef.current = false;
      advance();
    }
  }, [timerState.timeLeft, timerState.isRunning, advance]);

  const handleReset = useCallback(() => {
    advancedRef.current = false;
    wasRunningRef.current = false;
    const resetSession = 1;
    setCurrentSessionInput("1");
    pendingCurrentSessionRef.current = resetSession;
    saveSessionControl(resetSession, pendingTotalSessionsRef.current);
    setTimerState({
      session: resetSession,
      mode: "study",
      timeLeft: pendingStudyRef.current * 60,
      isRunning: false,
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        setTimerState((prev) => ({ ...prev, isRunning: !prev.isRunning }));
      } else if (e.code === "KeyR") {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleReset]);

  const handleStartPause = () => {
    setTimerState((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const handleSkip = () => {
    advancedRef.current = false;
    wasRunningRef.current = true;
    setTimerState((prev) => ({ ...prev, timeLeft: 0, isRunning: false }));
  };

  const handleCopyLink = () => {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      study: String(pendingStudyRef.current),
      break: String(pendingBreakRef.current),
      sessions: String(pendingTotalSessionsRef.current),
      current: String(pendingCurrentSessionRef.current),
      transparent: String(isTransparent),
      // Session text params
      sessionColor: sessionStyle.sessionTextColor,
      sessionOutline: sessionStyle.sessionOutlineColor,
      sessionStroke: String(sessionStyle.sessionOutlineThickness),
      // Mode text params
      modeColor: modeStyle.modeColor,
      modeOutline: modeStyle.modeOutlineColor,
    });
    const url = `${base}?${params.toString()}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopyLabel("COPIED!");
        setTimeout(() => setCopyLabel("COPY LINK"), 2000);
      })
      .catch(() => {
        setCopyLabel("COPIED!");
        setTimeout(() => setCopyLabel("COPY LINK"), 2000);
      });
  };

  const handleStudyBlur = () => {
    const val = Math.max(1, Number.parseInt(studyInput) || 25);
    setStudyInput(String(val));
  };

  const handleBreakBlur = () => {
    const val = Math.max(1, Number.parseInt(breakInput) || 5);
    setBreakInput(String(val));
  };

  const handleSessionsBlur = () => {
    const val = Math.max(1, Number.parseInt(sessionsInput) || 7);
    setSessionsInput(String(val));
  };

  const handleTotalSessionsBlur = () => {
    const total = Math.max(1, Number.parseInt(totalSessionsInput) || 7);
    const current = Math.min(
      Math.max(1, Number.parseInt(currentSessionInput) || 1),
      total,
    );
    setTotalSessionsInput(String(total));
    setCurrentSessionInput(String(current));
  };

  const handleCurrentSessionBlur = () => {
    const total = Math.max(1, Number.parseInt(totalSessionsInput) || 7);
    const current = Math.min(
      Math.max(1, Number.parseInt(currentSessionInput) || 1),
      total,
    );
    setCurrentSessionInput(String(current));
  };

  const { session, mode, timeLeft, isRunning } = timerState;
  const totalDuration =
    mode === "study"
      ? pendingStudyRef.current * 60
      : pendingBreakRef.current * 60;
  const progress =
    totalDuration > 0 ? ((totalDuration - timeLeft) / totalDuration) * 100 : 0;

  const isCopied = copyLabel === "COPIED!";

  // SESSION text styles — applied ONLY to the session label
  const sessionTextShadow = `2px 2px 0px ${hexToRgba(sessionStyle.sessionOutlineColor, 0.8)}, 4px 4px 8px ${hexToRgba(sessionStyle.sessionOutlineColor, 0.5)}`;
  const sessionTextStroke =
    sessionStyle.sessionOutlineThickness > 0
      ? `${sessionStyle.sessionOutlineThickness}px ${sessionStyle.sessionOutlineColor}`
      : "none";

  // MODE text styles — applied ONLY to the STUDY/BREAK label
  const modeTextShadow = `2px 2px 0px ${hexToRgba(modeStyle.modeOutlineColor, 0.8)}, 4px 4px 8px ${hexToRgba(modeStyle.modeOutlineColor, 0.5)}`;
  const modeTextStroke =
    modeStyle.modeOutlineThickness > 0
      ? `${modeStyle.modeOutlineThickness}px ${modeStyle.modeOutlineColor}`
      : "none";

  return (
    <>
      <div
        className={`pomodoro-outer ${isTransparent ? "no-bg" : "has-bg"}`}
        data-ocid="pomodoro.page"
      >
        <div
          className={`pomodoro-card ${isTransparent ? "no-bg" : "has-bg"} ${
            transitioning ? "mode-transitioning" : ""
          }`}
          data-ocid="pomodoro.card"
        >
          {/* Session label — SESSION text styles applied HERE ONLY */}
          <div
            className="session-label"
            data-ocid="pomodoro.section"
            style={{
              color: sessionStyle.sessionTextColor,
              textShadow: sessionTextShadow,
              WebkitTextStroke: sessionTextStroke,
            }}
          >
            SESSION {session}/{pendingTotalSessionsRef.current}
          </div>

          {/* Timer — NO session style applied, uses CSS class defaults only */}
          <div className="timer-display" data-ocid="pomodoro.panel">
            {formatTime(timeLeft)}
          </div>

          {/* Progress bar */}
          <div className="progress-track" data-ocid="pomodoro.row">
            <div
              className={`progress-fill ${
                visualMode === "study" ? "study-mode" : "break-mode"
              }`}
              style={{ width: `${progress}%` }}
              data-ocid="pomodoro.panel"
            />
          </div>

          {/* Mode label — MODE text styles applied HERE ONLY */}
          <div
            className="mode-label"
            data-ocid="pomodoro.section"
            style={{
              color: modeStyle.modeColor,
              textShadow: modeTextShadow,
              WebkitTextStroke: modeTextStroke,
            }}
          >
            {visualMode === "study" ? "STUDY" : "BREAK"}
          </div>

          {/* Control buttons */}
          <div className="controls-row" data-ocid="pomodoro.section">
            <button
              type="button"
              className={`ctrl-btn primary ${
                visualMode === "break" ? "break-active" : ""
              }`}
              onClick={handleStartPause}
              data-ocid={
                isRunning
                  ? "pomodoro.secondary_button"
                  : "pomodoro.primary_button"
              }
            >
              {isRunning ? "PAUSE" : "START"}
            </button>

            <button
              type="button"
              className="ctrl-btn secondary"
              onClick={handleReset}
              data-ocid="pomodoro.cancel_button"
            >
              RESET
            </button>

            <button
              type="button"
              className="ctrl-btn neutral"
              onClick={handleSkip}
              data-ocid="pomodoro.secondary_button"
            >
              SKIP
            </button>
          </div>

          {/* Utility row */}
          <div className="utility-row" data-ocid="pomodoro.section">
            <button
              type="button"
              className={`util-btn copy ${isCopied ? "copied" : ""}`}
              onClick={handleCopyLink}
              data-ocid="pomodoro.button"
            >
              {copyLabel}
            </button>

            <button
              type="button"
              className={`util-btn bg-toggle ${!isTransparent ? "active" : ""}`}
              onClick={() => setIsTransparent((v) => !v)}
              data-ocid="pomodoro.toggle"
            >
              {isTransparent ? "BG OFF" : "BG ON"}
            </button>

            <button
              type="button"
              className={`settings-toggle-btn ${showSettings ? "active" : ""}`}
              onClick={() => setShowSettings((v) => !v)}
              aria-label="Toggle settings"
              data-ocid="pomodoro.open_modal_button"
            >
              ⚙
            </button>
          </div>

          {/* Settings panel */}
          <div
            className={`settings-panel ${showSettings ? "open" : ""}`}
            data-ocid="pomodoro.panel"
          >
            <div className="settings-grid">
              {/* ── SESSION CONTROL ── */}
              <div className="settings-section-title">Session Control</div>
              <div className="settings-field">
                <label
                  htmlFor="setting-current-session"
                  className="settings-label"
                >
                  Current Session
                </label>
                <input
                  id="setting-current-session"
                  type="number"
                  className="settings-input session-control-input"
                  value={currentSessionInput}
                  min={1}
                  max={Number.parseInt(totalSessionsInput) || 7}
                  onChange={(e) => setCurrentSessionInput(e.target.value)}
                  onBlur={handleCurrentSessionBlur}
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="settings-field">
                <label
                  htmlFor="setting-total-sessions"
                  className="settings-label"
                >
                  Total Sessions
                </label>
                <input
                  id="setting-total-sessions"
                  type="number"
                  className="settings-input session-control-input"
                  value={totalSessionsInput}
                  min={1}
                  onChange={(e) => setTotalSessionsInput(e.target.value)}
                  onBlur={handleTotalSessionsBlur}
                  data-ocid="pomodoro.input"
                />
              </div>

              {/* ── SESSION TEXT STYLE ── */}
              <div className="settings-section-title">Session Text Style</div>
              <div className="color-picker-field">
                <label
                  htmlFor="setting-session-color"
                  className="settings-label"
                >
                  Session Text Color
                </label>
                <input
                  id="setting-session-color"
                  type="color"
                  className="color-picker-input"
                  value={sessionStyle.sessionTextColor}
                  onChange={(e) =>
                    setSessionStyle((prev) => ({
                      ...prev,
                      sessionTextColor: e.target.value,
                    }))
                  }
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="color-picker-field">
                <label
                  htmlFor="setting-session-outline-color"
                  className="settings-label"
                >
                  Session Outline Color
                </label>
                <input
                  id="setting-session-outline-color"
                  type="color"
                  className="color-picker-input"
                  value={sessionStyle.sessionOutlineColor}
                  onChange={(e) =>
                    setSessionStyle((prev) => ({
                      ...prev,
                      sessionOutlineColor: e.target.value,
                    }))
                  }
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="settings-field">
                <label
                  htmlFor="setting-session-outline-thickness"
                  className="settings-label"
                >
                  Session Outline ({sessionStyle.sessionOutlineThickness}px)
                </label>
                <input
                  id="setting-session-outline-thickness"
                  type="range"
                  className="settings-range"
                  min={0}
                  max={3}
                  step={0.5}
                  value={sessionStyle.sessionOutlineThickness}
                  onChange={(e) =>
                    setSessionStyle((prev) => ({
                      ...prev,
                      sessionOutlineThickness: Number(e.target.value),
                    }))
                  }
                  data-ocid="pomodoro.input"
                />
              </div>

              {/* ── MODE TEXT STYLE ── */}
              <div className="settings-section-title">Mode Text Style</div>
              <div className="color-picker-field">
                <label htmlFor="setting-mode-color" className="settings-label">
                  Mode Text Color
                </label>
                <input
                  id="setting-mode-color"
                  type="color"
                  className="color-picker-input"
                  value={modeStyle.modeColor}
                  onChange={(e) =>
                    setModeStyle((prev) => ({
                      ...prev,
                      modeColor: e.target.value,
                    }))
                  }
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="color-picker-field">
                <label
                  htmlFor="setting-mode-outline-color"
                  className="settings-label"
                >
                  Mode Outline Color
                </label>
                <input
                  id="setting-mode-outline-color"
                  type="color"
                  className="color-picker-input"
                  value={modeStyle.modeOutlineColor}
                  onChange={(e) =>
                    setModeStyle((prev) => ({
                      ...prev,
                      modeOutlineColor: e.target.value,
                    }))
                  }
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="settings-field">
                <label
                  htmlFor="setting-mode-outline-thickness"
                  className="settings-label"
                >
                  Mode Outline ({modeStyle.modeOutlineThickness}px)
                </label>
                <input
                  id="setting-mode-outline-thickness"
                  type="range"
                  className="settings-range"
                  min={0}
                  max={3}
                  step={0.5}
                  value={modeStyle.modeOutlineThickness}
                  onChange={(e) =>
                    setModeStyle((prev) => ({
                      ...prev,
                      modeOutlineThickness: Number(e.target.value),
                    }))
                  }
                  data-ocid="pomodoro.input"
                />
              </div>

              {/* ── TIMER SETTINGS ── */}
              <div className="settings-section-title">Timer Settings</div>
              <div className="settings-field">
                <label htmlFor="setting-study" className="settings-label">
                  Study Time (min)
                </label>
                <input
                  id="setting-study"
                  type="number"
                  className="settings-input"
                  value={studyInput}
                  min={1}
                  onChange={(e) => setStudyInput(e.target.value)}
                  onBlur={handleStudyBlur}
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="settings-field">
                <label htmlFor="setting-break" className="settings-label">
                  Break Time (min)
                </label>
                <input
                  id="setting-break"
                  type="number"
                  className="settings-input"
                  value={breakInput}
                  min={1}
                  onChange={(e) => setBreakInput(e.target.value)}
                  onBlur={handleBreakBlur}
                  data-ocid="pomodoro.input"
                />
              </div>
              <div className="settings-field">
                <label htmlFor="setting-sessions" className="settings-label">
                  Default Sessions
                </label>
                <input
                  id="setting-sessions"
                  type="number"
                  className="settings-input"
                  value={sessionsInput}
                  min={1}
                  onChange={(e) => setSessionsInput(e.target.value)}
                  onBlur={handleSessionsBlur}
                  data-ocid="pomodoro.input"
                />
              </div>
            </div>
            {isRunning && (
              <p className="settings-hint">
                Timer changes apply after current cycle
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`footer-text ${isTransparent ? "no-bg" : ""}`}>
        &copy; {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          caffeine.ai
        </a>
      </div>
    </>
  );
}
