// Panel visibility state management
const PANEL_SETTINGS_KEY = "panel_settings";
const PANEL_POSITIONS_KEY = "panel_positions";
const PANEL_SIZES_KEY = "panel_sizes";

type PanelStates = Record<string, boolean>;
type PanelPosition = { x: number; y: number };
export type PanelSize = { width: number; height: number };
export type ViewportPanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RobotPanelSettings = {
  [robotName: string]: PanelStates;
};

type RobotPanelPositions = {
  [robotName: string]: {
    [panelName: string]: PanelPosition;
  };
};

type RobotPanelSizes = {
  [robotName: string]: {
    [panelName: string]: PanelSize;
  };
};

const MIN_PANEL_SIZE: PanelSize = {
  width: 200,
  height: 160,
};

const DEFAULT_FALLBACK_SIZE: PanelSize = {
  width: 320,
  height: 300,
};

function getViewportWidth(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.width ?? window.innerWidth;
}

function getViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

function getViewportPadding() {
  const width = getViewportWidth();
  if (width <= 640) {
    return { top: 10, right: 10, bottom: 10, left: 10 };
  }
  if (width <= 1024) {
    return { top: 14, right: 12, bottom: 12, left: 12 };
  }
  return { top: 20, right: 16, bottom: 16, left: 16 };
}

function getBottomSafeZone() {
  const width = getViewportWidth();
  if (width <= 640) return 26;
  if (width <= 1024) return 24;
  return 20;
}

function positionsEqual(a: PanelPosition, b: PanelPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function sizesEqual(a: PanelSize, b: PanelSize): boolean {
  return a.width === b.width && a.height === b.height;
}

function getViewportLimits() {
  if (typeof window === "undefined") return null;
  const padding = getViewportPadding();
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  return {
    maxWidth: Math.max(
      MIN_PANEL_SIZE.width,
      viewportWidth - padding.left - padding.right,
    ),
    maxHeight: Math.max(
      MIN_PANEL_SIZE.height,
      viewportHeight - padding.top - padding.bottom - getBottomSafeZone(),
    ),
  };
}

export function getPanelViewportBounds(): ViewportPanelBounds | null {
  const limits = getViewportLimits();
  if (!limits) return null;
  const padding = getViewportPadding();

  return {
    x: padding.left,
    y: padding.top,
    width: limits.maxWidth,
    height: limits.maxHeight,
  };
}

function clampPanelSizeToViewport(size: PanelSize): PanelSize {
  const rounded = {
    width: Math.round(Number(size.width) || DEFAULT_FALLBACK_SIZE.width),
    height: Math.round(Number(size.height) || DEFAULT_FALLBACK_SIZE.height),
  };

  const limits = getViewportLimits();
  if (!limits) {
    return {
      width: Math.max(MIN_PANEL_SIZE.width, rounded.width),
      height: Math.max(MIN_PANEL_SIZE.height, rounded.height),
    };
  }

  return {
    width: Math.max(
      MIN_PANEL_SIZE.width,
      Math.min(rounded.width, limits.maxWidth),
    ),
    height: Math.max(
      MIN_PANEL_SIZE.height,
      Math.min(rounded.height, limits.maxHeight),
    ),
  };
}

function clampPanelPositionToViewport(
  position: PanelPosition,
  size: PanelSize,
): PanelPosition {
  if (typeof window === "undefined") {
    return {
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
  }

  const safeSize = clampPanelSizeToViewport(size);
  const padding = getViewportPadding();
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  const minX = padding.left;
  const minY = padding.top;
  const maxX = Math.max(minX, viewportWidth - safeSize.width - padding.right);
  const maxY = Math.max(
    minY,
    viewportHeight - safeSize.height - padding.bottom - getBottomSafeZone(),
  );

  return {
    x: Math.round(Math.max(minX, Math.min(position.x, maxX))),
    y: Math.round(Math.max(minY, Math.min(position.y, maxY))),
  };
}

function getAllPanelSettings(): RobotPanelSettings {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem(PANEL_SETTINGS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.warn("Cleared corrupted panel settings", e);
    localStorage.removeItem(PANEL_SETTINGS_KEY);
    return {};
  }
}

function saveAllPanelSettings(settings: RobotPanelSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PANEL_SETTINGS_KEY, JSON.stringify(settings));
}

export const DEFAULT_PANEL_SIZES: Record<string, PanelSize> = {
  keyboardControl: { width: 430, height: 910 },
  chatControl: { width: 500, height: 340 },
  recordControl: { width: 492, height: 384 },
  physicsControl: { width: 302, height: 369 },
  displayControl: { width: 300, height: 430 },
  metricsControl: { width: 400, height: 350 },
  pidPanel: { width: 450, height: 350 },
  pidResponsePanel: { width: 450, height: 350 },
  tuningPanel: { width: 380, height: 600 },
  leaderControl: { width: 350, height: 280 },
  collisionPanel: { width: 320, height: 400 },
  waypointPanel: { width: 380, height: 500 },
  testRunner: { width: 380, height: 520 },
  cameraFeed: { width: 480, height: 320 },
  digitalTwinOffsetPanel: { width: 360, height: 500 },
};

function getAllPanelPositions(): RobotPanelPositions {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem(PANEL_POSITIONS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.warn("Cleared corrupted panel positions", e);
    localStorage.removeItem(PANEL_POSITIONS_KEY);
    return {};
  }
}

function saveAllPanelPositions(positions: RobotPanelPositions) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PANEL_POSITIONS_KEY, JSON.stringify(positions));
}

function getAllPanelSizes(): RobotPanelSizes {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem(PANEL_SIZES_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.warn("Cleared corrupted panel sizes", e);
    localStorage.removeItem(PANEL_SIZES_KEY);
    return {};
  }
}

function saveAllPanelSizes(sizes: RobotPanelSizes) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes));
}

export function getPanelStateFromLocalStorage(
  panelName: string,
  robotName: string,
): boolean | null {
  const allSettings = getAllPanelSettings();
  const robotSettings = allSettings[robotName];
  return robotSettings?.[panelName] ?? null;
}

export function setPanelStateToLocalStorage(
  panelName: string,
  isOpen: boolean,
  robotName: string,
) {
  const allSettings = getAllPanelSettings();
  if (!allSettings[robotName]) {
    allSettings[robotName] = {};
  }
  allSettings[robotName][panelName] = isOpen;
  saveAllPanelSettings(allSettings);
}

export function getAllPanelStatesForRobot(robotName: string): PanelStates {
  const allSettings = getAllPanelSettings();
  return allSettings[robotName] || {};
}

export function resetPanelLayout(
  robotName: string,
  options?: { resetVisibility?: boolean },
) {
  const allPositions = getAllPanelPositions();
  if (allPositions[robotName]) {
    delete allPositions[robotName];
    saveAllPanelPositions(allPositions);
  }

  const allSizes = getAllPanelSizes();
  if (allSizes[robotName]) {
    delete allSizes[robotName];
    saveAllPanelSizes(allSizes);
  }

  if (options?.resetVisibility) {
    const allSettings = getAllPanelSettings();
    if (allSettings[robotName]) {
      delete allSettings[robotName];
      saveAllPanelSettings(allSettings);
    }
  }
}

export function getPanelSize(panelName: string, robotName: string): PanelSize {
  const all = getAllPanelSizes();
  const saved = all[robotName]?.[panelName];
  const base = saved ?? DEFAULT_PANEL_SIZES[panelName] ?? DEFAULT_FALLBACK_SIZE;
  const clamped = clampPanelSizeToViewport(base);

  if (saved && !sizesEqual(saved, clamped)) {
    all[robotName][panelName] = clamped;
    saveAllPanelSizes(all);
  }

  return clamped;
}

export function setPanelSize(
  panelName: string,
  size: PanelSize,
  robotName: string,
) {
  const allSizes = getAllPanelSizes();
  if (!allSizes[robotName]) {
    allSizes[robotName] = {};
  }

  const clampedSize = clampPanelSizeToViewport(size);
  allSizes[robotName][panelName] = clampedSize;
  saveAllPanelSizes(allSizes);

  const allPositions = getAllPanelPositions();
  const savedPos = allPositions[robotName]?.[panelName];
  if (savedPos) {
    const clampedPos = clampPanelPositionToViewport(savedPos, clampedSize);
    if (!positionsEqual(savedPos, clampedPos)) {
      if (!allPositions[robotName]) {
        allPositions[robotName] = {};
      }
      allPositions[robotName][panelName] = clampedPos;
      saveAllPanelPositions(allPositions);
    }
  }
}

export function clampPanelPosition(
  panelName: string,
  pos: PanelPosition,
  robotName: string,
): PanelPosition {
  return clampPanelPositionToViewport(pos, getPanelSize(panelName, robotName));
}

export function getPanelPosition(
  panelName: string,
  robotName: string,
): PanelPosition | null {
  const all = getAllPanelPositions();
  const savedPos = all[robotName]?.[panelName] ?? null;
  if (!savedPos) return null;

  const clamped = clampPanelPositionToViewport(
    savedPos,
    getPanelSize(panelName, robotName),
  );

  if (!positionsEqual(savedPos, clamped)) {
    all[robotName][panelName] = clamped;
    saveAllPanelPositions(all);
  }

  return clamped;
}

export function setPanelPosition(
  panelName: string,
  pos: PanelPosition,
  robotName: string,
): PanelPosition {
  const all = getAllPanelPositions();
  if (!all[robotName]) {
    all[robotName] = {};
  }

  const clamped = clampPanelPositionToViewport(
    pos,
    getPanelSize(panelName, robotName),
  );
  all[robotName][panelName] = clamped;
  saveAllPanelPositions(all);
  return clamped;
}

export function getDefaultPanelPosition(panelName: string): PanelPosition {
  const savedGlobal = getPanelPosition(panelName, "global");
  if (savedGlobal) {
    return savedGlobal;
  }

  if (typeof window !== "undefined" && getViewportWidth() <= 768) {
    const mobileOffsets: Record<string, PanelPosition> = {
      keyboardControl: { x: 10, y: 56 },
      displayControl: { x: 10, y: 56 },
      recordControl: { x: 10, y: 64 },
      physicsControl: { x: 10, y: 72 },
      chatControl: { x: 10, y: 48 },
      metricsControl: { x: 10, y: 48 },
      pidPanel: { x: 10, y: 48 },
      pidResponsePanel: { x: 10, y: 48 },
      tuningPanel: { x: 10, y: 56 },
      collisionPanel: { x: 10, y: 56 },
      leaderControl: { x: 10, y: 56 },
      cameraFeed: { x: 10, y: 56 },
    };

    const mobilePos = mobileOffsets[panelName];
    if (mobilePos) {
      return clampPanelPositionToViewport(
        mobilePos,
        getPanelSize(panelName, "global"),
      );
    }
  }

  let basePos: PanelPosition = { x: 20, y: 60 };

  switch (panelName) {
    case "displayControl":
      basePos = { x: 18, y: 485 };
      break;
    case "physicsControl":
      basePos = { x: 16, y: 960 };
      break;
    case "keyboardControl":
      basePos = { x: 348, y: 485 };
      break;
    case "recordControl":
      basePos = { x: 19, y: 80 };
      break;
    case "chatControl":
      basePos = { x: 1625, y: 26 };
      break;
    case "metricsControl":
      basePos = { x: 1063.5, y: 22 };
      break;
    case "pidPanel":
    case "pidResponsePanel":
      basePos = { x: 526, y: 26 };
      break;
    case "tuningPanel":
      basePos = { x: 2068, y: 417 };
      break;
    case "collisionPanel":
      basePos = { x: 420, y: 60 };
      break;
    case "leaderControl":
      if (typeof window !== "undefined") {
        basePos = {
          x:
            window.innerWidth / 2 -
            DEFAULT_PANEL_SIZES.leaderControl.width / 2 -
            300,
          y:
            window.innerHeight -
            (DEFAULT_PANEL_SIZES.leaderControl.height + 60),
        };
      }
      break;
    case "waypointPanel":
      basePos = { x: 420, y: 60 };
      break;
    case "testRunner":
      basePos = { x: 420, y: 60 };
      break;
    case "cameraFeed":
      if (typeof window !== "undefined") {
        basePos = { x: window.innerWidth - 500, y: 60 };
      } else {
        basePos = { x: 1200, y: 60 };
      }
      break;
  }

  return clampPanelPositionToViewport(
    basePos,
    getPanelSize(panelName, "global"),
  );
}
