import { create } from "zustand";

export const DEFAULT_F1 = {
  fw1: 0.08,
  fh1: 0.21,
  fd1: 0.25,
  fx1: -0.3,
  fy1: 0,
  fz1: -0.426,
  fw2: 0.03,
  fh2: 0.07,
  fd2: 0.073,
  fx2: -0.148,
  fy2: 0,
  fz2: -1.49,
  fw3: 0.03,
  fh3: 0.1,
  fd3: 0.074,
  fx3: -0.1775,
  fy3: 0,
  fz3: -1.342,
  fw4: 0.028,
  fh4: 0.13,
  fd4: 0.147,
  fx4: -0.2,
  fy4: 0,
  fz4: -1.119,
  fw5: 0.05,
  fh5: 0.17,
  fd5: 0.155, // Changed from -0.155 to prevent physics engine crash
  fx5: -0.249,
  fy5: -0.005,
  fz5: -0.825,
};

export const DEFAULT_M1 = {
  mw1: 0.1,
  mh1: 0.35,
  md1: 0.12,
  mx1: -0.027,
  my1: -0.58,
  mz1: 0.28,
  mw2: 0.08,
  mh2: 0.075,
  md2: 0.1,
  mx2: -0.075,
  my2: -1.005,
  mz2: 0.28,
  mw3: 0.06,
  mh3: 0.07,
  md3: 0.09,
  mx3: -0.125,
  my3: -1.15,
  mz3: 0.28,
};

export interface GripperTuningState {
  f1: typeof DEFAULT_F1;
  m1: typeof DEFAULT_M1;
  setF1: (vals: Partial<typeof DEFAULT_F1>) => void;
  setM1: (vals: Partial<typeof DEFAULT_M1>) => void;
  resetAll: () => void;
}

export const useGripperTuningStore = create<GripperTuningState>()((set) => ({
  f1: DEFAULT_F1,
  m1: DEFAULT_M1,
  setF1: (vals) => set((s) => ({ f1: { ...s.f1, ...vals } })),
  setM1: (vals) => set((s) => ({ m1: { ...s.m1, ...vals } })),
  resetAll: () => set({ f1: DEFAULT_F1, m1: DEFAULT_M1 }),
}));
