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
    transparent: params.get("transparent") === "true",
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

  const [studyInput, setStudyInput] = useState<string>(initialSettings.study);
  const [breakInput, setBreakInput] = useState<string>(initialSettings.break);
  const [sessionsInput, setSessionsInput] = useState<string>(
    initialSettings.sessions,
  );

  const [showSettings, setShowSettings] = useState(false);
  const [isTransparent, setIsTransparent] = useState(
    urlParams.current.transparent,
  );
  const [copyLabel, setCopyLabel] = useState("COPY LINK");
  // Track visual mode separately for smooth CSS transitions
  const [visualMode, setVisualMode] = useState<Mode>("study");
  // Track if we are in a transitioning state
  const [transitioning, setTransitioning] = useState(false);

  // Pending value refs — always reflect latest parsed inputs
  const pendingStudyRef = useRef(
    Math.max(1, Number.parseInt(initialSettings.study) || 25),
  );
  const pendingBreakRef = useRef(
    Math.max(1, Number.parseInt(initialSettings.break) || 5),
  );
  const pendingSessionsRef = useRef(
    Math.max(1, Number.parseInt(initialSettings.sessions) || 7),
  );

  // Keep pending refs in sync with input changes
  useEffect(() => {
    pendingStudyRef.current = Math.max(1, Number.parseInt(studyInput) || 25);
    pendingBreakRef.current = Math.max(1, Number.parseInt(breakInput) || 5);
    pendingSessionsRef.current = Math.max(
      1,
      Number.parseInt(sessionsInput) || 7,
    );

    // Persist settings to localStorage
    saveSettings({
      study: pendingStudyRef.current,
      break: pendingBreakRef.current,
      sessions: pendingSessionsRef.current,
    });
  }, [studyInput, breakInput, sessionsInput]);

  // Initialize timer state — always starts at session 1, never restores session state
  const initState = (): TimerState => {
    const initStudy = pendingStudyRef.current;
    return {
      session: 1,
      mode: "study",
      timeLeft: initStudy * 60,
      isRunning: urlParams.current.autostart,
    };
  };

  const [timerState, setTimerState] = useState<TimerState>(initState);
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;

  // Keep visualMode in sync with timerState.mode with transition
  useEffect(() => {
    if (timerState.mode !== visualMode) {
      setTransitioning(true);
      const t = setTimeout(() => {
        setVisualMode(timerState.mode);
        setTransitioning(false);
      }, 120); // half of transition duration
      return () => clearTimeout(t);
    }
  }, [timerState.mode, visualMode]);

  // Sync background transparency
  useEffect(() => {
    if (isTransparent) {
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";
    } else {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    }
  }, [isTransparent]);

  // Advance to next mode/session — called automatically when timer hits 0
  const advance = useCallback(() => {
    const cur = timerStateRef.current;
    playBeep();
    if (cur.mode === "study") {
      // Study done → start break (session number stays the same)
      setTimerState({
        session: cur.session,
        mode: "break",
        timeLeft: pendingBreakRef.current * 60,
        isRunning: true,
      });
    } else {
      // Break done → increment session ONLY here
      const nextSession = cur.session + 1;
      if (nextSession > pendingSessionsRef.current) {
        // All sessions complete — stop
        setTimerState({
          session: pendingSessionsRef.current,
          mode: "study",
          timeLeft: pendingStudyRef.current * 60,
          isRunning: false,
        });
      } else {
        // Continue with next session
        setTimerState({
          session: nextSession,
          mode: "study",
          timeLeft: pendingStudyRef.current * 60,
          isRunning: true,
        });
      }
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only re-run when isRunning changes
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

  // Auto-advance when timeLeft hits 0 and timer was actually running (not initial load)
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

  // Reset: go back to session 1, study mode, full study duration
  const handleReset = useCallback(() => {
    advancedRef.current = false;
    wasRunningRef.current = false;
    setTimerState({
      session: 1,
      mode: "study",
      timeLeft: pendingStudyRef.current * 60,
      isRunning: false,
    });
  }, []);

  // Keyboard shortcuts
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
    wasRunningRef.current = true; // treat skip as if timer was running
    setTimerState((prev) => ({ ...prev, timeLeft: 0, isRunning: false }));
  };

  const handleCopyLink = () => {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      study: String(pendingStudyRef.current),
      break: String(pendingBreakRef.current),
      sessions: String(pendingSessionsRef.current),
      transparent: String(isTransparent),
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

  // Clamp input values on blur
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

  const { session, mode, timeLeft, isRunning } = timerState;
  const totalDuration =
    mode === "study"
      ? pendingStudyRef.current * 60
      : pendingBreakRef.current * 60;
  const progress =
    totalDuration > 0 ? ((totalDuration - timeLeft) / totalDuration) * 100 : 0;

  const isCopied = copyLabel === "COPIED!";

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
          {/* Session label — large and bold */}
          <div
            className={`session-label ${
              visualMode === "study" ? "study-mode" : "break-mode"
            }`}
            data-ocid="pomodoro.section"
          >
            SESSION {session}/{pendingSessionsRef.current}
          </div>

          {/* Timer */}
          <div
            className="timer-display"
            data-ocid="pomodoro.panel"
            style={{
              textShadow:
                visualMode === "study"
                  ? "0 0 40px oklch(0.62 0.19 260 / 0.25)"
                  : "0 0 40px oklch(0.72 0.18 35 / 0.25)",
            }}
          >
            {formatTime(timeLeft)}
          </div>

          {/* Progress bar — resets when mode switches via key change */}
          <div className="progress-track" data-ocid="pomodoro.row">
            <div
              className={`progress-fill ${
                visualMode === "study" ? "study-mode" : "break-mode"
              }`}
              style={{ width: `${progress}%` }}
              data-ocid="pomodoro.panel"
            />
          </div>

          {/* Mode label */}
          <div
            className={`mode-label ${
              visualMode === "study" ? "study-mode" : "break-mode"
            }`}
            data-ocid="pomodoro.section"
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

            {/* Settings gear button */}
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
                  Total Sessions
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
              <p className="settings-hint">Changes apply after current cycle</p>
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
