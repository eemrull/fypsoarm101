/**
 * Unit tests for useRobotProfileStore sanitization logic.
 *
 * We test via the public importProfile/exportProfile API, which internally
 * calls all sanitizer functions (sanitizeActuators, sanitizeLinkBoundingBoxes,
 * sanitizeSceneSettings, sanitizeActiveTool, sanitizeNumberRecord, etc.).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useRobotProfileStore } from "../useRobotProfileStore";

// Helper: import a partial JSON and return the resulting state
function importAndGet(partial: Record<string, unknown>) {
  const ok = useRobotProfileStore
    .getState()
    .importProfile(JSON.stringify(partial));
  return { ok, state: useRobotProfileStore.getState() };
}

describe("useRobotProfileStore — Import / Sanitization", () => {
  beforeEach(() => {
    useRobotProfileStore.getState().resetProfile();
  });

  // ─── Basic import ─────────────────────────────────────────────────────

  it("returns false for invalid JSON string", () => {
    const ok = useRobotProfileStore
      .getState()
      .importProfile("not valid json {{{");
    expect(ok).toBe(false);
  });

  it("returns false for non-object JSON (e.g. array)", () => {
    const ok = useRobotProfileStore
      .getState()
      .importProfile(JSON.stringify([1, 2, 3]));
    expect(ok).toBe(false);
  });

  it("imports a minimal valid profile object", () => {
    const { ok, state } = importAndGet({});
    expect(ok).toBe(true);
    // Should fall back to defaults
    expect(state.profileName).toBe("System Imported Profile");
    expect(state.baseUrdf).toBe("so-arm101");
    expect(state.joints).toEqual([]);
    expect(state.actuators).toEqual({});
  });

  it("preserves a valid profileName", () => {
    const { ok, state } = importAndGet({ profileName: "My Robot" });
    expect(ok).toBe(true);
    expect(state.profileName).toBe("My Robot");
  });

  it("falls back on empty profileName", () => {
    const { ok, state } = importAndGet({ profileName: "   " });
    expect(ok).toBe(true);
    expect(state.profileName).toBe("System Imported Profile");
  });

  // ─── Actuator sanitization ────────────────────────────────────────────

  describe("sanitizeActuators", () => {
    it("preserves a valid STS3215 actuator", () => {
      const { ok, state } = importAndGet({
        actuators: {
          Rotation: {
            jointName: "Rotation",
            hardwareType: "sts3215",
            hardwareId: 1,
            torqueLimit: 500,
            speedLimit: 1000,
          },
        },
      });
      expect(ok).toBe(true);
      const act = state.actuators["Rotation"];
      expect(act).toBeDefined();
      expect(act.hardwareType).toBe("sts3215");
      expect(act.hardwareId).toBe(1);
      expect((act as { torqueLimit?: number }).torqueLimit).toBe(500);
      expect((act as { speedLimit?: number }).speedLimit).toBe(1000);
    });

    it("defaults hardwareType to sts3215 for unknown types", () => {
      const { state } = importAndGet({
        actuators: {
          Joint1: {
            jointName: "Joint1",
            hardwareType: "magical_motor",
            hardwareId: 5,
          },
        },
      });
      expect(state.actuators["Joint1"].hardwareType).toBe("sts3215");
    });

    it("defaults hardwareId to 0 for non-numeric values", () => {
      const { state } = importAndGet({
        actuators: {
          Joint1: {
            jointName: "Joint1",
            hardwareType: "sts3215",
            hardwareId: "banana",
          },
        },
      });
      expect(state.actuators["Joint1"].hardwareId).toBe(0);
    });

    it("skips entries that are not objects", () => {
      const { state } = importAndGet({
        actuators: {
          Joint1: "invalid string",
          Joint2: 42,
          Joint3: null,
        },
      });
      expect(Object.keys(state.actuators)).toHaveLength(0);
    });

    it("trims whitespace from joint names", () => {
      const { state } = importAndGet({
        actuators: {
          "  MyJoint  ": {
            jointName: "  MyJoint  ",
            hardwareType: "sts3215",
            hardwareId: 1,
          },
        },
      });
      expect(state.actuators["MyJoint"]).toBeDefined();
    });

    it("skips actuators with empty jointName after trim", () => {
      const { state } = importAndGet({
        actuators: {
          "   ": {
            jointName: "   ",
            hardwareType: "sts3215",
            hardwareId: 1,
          },
        },
      });
      expect(Object.keys(state.actuators)).toHaveLength(0);
    });

    it("sanitizes stepper motor config with defaults", () => {
      const { state } = importAndGet({
        actuators: {
          Elbow: {
            jointName: "Elbow",
            hardwareType: "nema17",
            hardwareId: 3,
            // No microsteps, stepsPerRev, gearRatio — should use defaults
          },
        },
      });
      const act = state.actuators["Elbow"] as Record<string, unknown>;
      expect(act.hardwareType).toBe("nema17");
      expect(act.microsteps).toBe(16);
      expect(act.stepsPerRev).toBe(200);
      expect(act.gearRatio).toBe(1);
    });

    it("sanitizes PWM actuator config", () => {
      const { state } = importAndGet({
        actuators: {
          Gripper: {
            jointName: "Gripper",
            hardwareType: "pwm",
            hardwareId: 6,
            pwmPin: 9,
            pwmMin: 500,
            pwmMax: 2500,
          },
        },
      });
      const act = state.actuators["Gripper"] as Record<string, unknown>;
      expect(act.hardwareType).toBe("pwm");
      expect(act.pwmPin).toBe(9);
      expect(act.pwmMin).toBe(500);
      expect(act.pwmMax).toBe(2500);
    });

    it("filters actuators to only known joints when joints array is provided", () => {
      const { state } = importAndGet({
        joints: ["Rotation", "Pitch"],
        actuators: {
          Rotation: {
            jointName: "Rotation",
            hardwareType: "sts3215",
            hardwareId: 1,
          },
          Pitch: {
            jointName: "Pitch",
            hardwareType: "sts3215",
            hardwareId: 2,
          },
          UnknownJoint: {
            jointName: "UnknownJoint",
            hardwareType: "sts3215",
            hardwareId: 99,
          },
        },
      });
      expect(Object.keys(state.actuators)).toEqual(
        expect.arrayContaining(["Rotation", "Pitch"]),
      );
      expect(state.actuators["UnknownJoint"]).toBeUndefined();
    });

    it("passes NaN and Infinity through parseFiniteNumber as null", () => {
      const { state } = importAndGet({
        actuators: {
          Joint1: {
            jointName: "Joint1",
            hardwareType: "sts3215",
            hardwareId: NaN,
            torqueLimit: Infinity,
            speedLimit: -Infinity,
          },
        },
      });
      expect(state.actuators["Joint1"].hardwareId).toBe(0); // NaN -> null -> default 0
    });
  });

  // ─── Link Bounding Boxes ──────────────────────────────────────────────

  describe("sanitizeLinkBoundingBoxes", () => {
    it("preserves valid bounding boxes", () => {
      const { state } = importAndGet({
        linkBoundingBoxes: {
          arm_link: [{ size: [0.1, 0.2, 0.3], offset: [0, 0.05, 0] }],
        },
      });
      expect(state.linkBoundingBoxes["arm_link"]).toHaveLength(1);
      expect(state.linkBoundingBoxes["arm_link"][0].size).toEqual([
        0.1, 0.2, 0.3,
      ]);
      expect(state.linkBoundingBoxes["arm_link"][0].offset).toEqual([
        0, 0.05, 0,
      ]);
    });

    it("rejects bounding boxes with zero or negative size", () => {
      const { state } = importAndGet({
        linkBoundingBoxes: {
          arm_link: [
            { size: [0, 0.2, 0.3], offset: [0, 0, 0] }, // 0-width = invalid
            { size: [-0.1, 0.2, 0.3], offset: [0, 0, 0] }, // negative = invalid
          ],
        },
      });
      // Both should be filtered out; since no valid boxes, the link entry is omitted
      expect(state.linkBoundingBoxes["arm_link"]).toBeUndefined();
    });

    it("rejects bounding boxes with wrong array length", () => {
      const { state } = importAndGet({
        linkBoundingBoxes: {
          arm_link: [
            { size: [0.1, 0.2], offset: [0, 0, 0] }, // size.length != 3
            { size: [0.1, 0.2, 0.3], offset: [0, 0] }, // offset.length != 3
          ],
        },
      });
      expect(state.linkBoundingBoxes["arm_link"]).toBeUndefined();
    });

    it("returns empty object when given non-object input", () => {
      const { state } = importAndGet({
        linkBoundingBoxes: "not_an_object",
      });
      expect(state.linkBoundingBoxes).toEqual({});
    });

    it("skips non-array entries within the bounding box record", () => {
      const { state } = importAndGet({
        linkBoundingBoxes: {
          arm_link: "not_an_array",
        },
      });
      expect(state.linkBoundingBoxes["arm_link"]).toBeUndefined();
    });
  });

  // ─── Scene Settings ───────────────────────────────────────────────────

  describe("sanitizeSceneSettings", () => {
    it("preserves valid scene settings", () => {
      const { state } = importAndGet({
        sceneSettings: {
          environment: "warehouse",
          cameraPosition: [1, 2, 3],
          orbitTarget: [0.5, 0.5, 0.5],
          showGrid: false,
        },
      });
      expect(state.sceneSettings.environment).toBe("warehouse");
      expect(state.sceneSettings.cameraPosition).toEqual([1, 2, 3]);
      expect(state.sceneSettings.orbitTarget).toEqual([0.5, 0.5, 0.5]);
      expect(state.sceneSettings.showGrid).toBe(false);
    });

    it("falls back to defaults for invalid environment", () => {
      const { state } = importAndGet({
        sceneSettings: { environment: "mars_base" },
      });
      expect(state.sceneSettings.environment).toBe("studio");
    });

    it("falls back to defaults for invalid cameraPosition", () => {
      const { state } = importAndGet({
        sceneSettings: { cameraPosition: [1, 2] }, // wrong length
      });
      // Should revert to default [0.3, 0.5, 0.3]
      expect(state.sceneSettings.cameraPosition).toHaveLength(3);
    });

    it("returns defaults for non-object input", () => {
      const { state } = importAndGet({
        sceneSettings: 42,
      });
      expect(state.sceneSettings.environment).toBe("studio");
      expect(state.sceneSettings.showGrid).toBe(true);
    });
  });

  // ─── Active Tool ──────────────────────────────────────────────────────

  describe("sanitizeActiveTool", () => {
    it("preserves a valid drill tool config", () => {
      const { state } = importAndGet({
        activeTool: {
          type: "drill",
          name: "My Drill",
          hardwareType: "pwm",
          hardwareId: 7,
          tcpOffset: [0, 0, -0.15],
        },
      });
      expect(state.activeTool.type).toBe("drill");
      expect(state.activeTool.name).toBe("My Drill");
      expect(state.activeTool.hardwareType).toBe("pwm");
      expect(state.activeTool.hardwareId).toBe(7);
      expect(state.activeTool.tcpOffset).toEqual([0, 0, -0.15]);
    });

    it("falls back to defaults for invalid tool type", () => {
      const { state } = importAndGet({
        activeTool: { type: "laser_cannon" },
      });
      expect(state.activeTool.type).toBe("gripper");
    });

    it("falls back to defaults for empty tool name", () => {
      const { state } = importAndGet({
        activeTool: { name: "" },
      });
      expect(state.activeTool.name).toBe("Standard Gripper");
    });

    it("falls back to defaults for invalid tcpOffset", () => {
      const { state } = importAndGet({
        activeTool: { tcpOffset: [1, 2] }, // wrong length
      });
      expect(state.activeTool.tcpOffset).toHaveLength(3);
    });
  });

  // ─── Link Lengths ─────────────────────────────────────────────────────

  describe("sanitizeNumberRecord (linkLengths)", () => {
    it("preserves valid numeric records", () => {
      const { state } = importAndGet({
        linkLengths: { arm: 0.113, forearm: 0.135 },
      });
      expect(state.linkLengths).toEqual({ arm: 0.113, forearm: 0.135 });
    });

    it("drops non-numeric entries", () => {
      const { state } = importAndGet({
        linkLengths: { arm: "abc", forearm: 0.135, bad: null },
      });
      expect(state.linkLengths).toEqual({ forearm: 0.135 });
    });

    it("returns empty object for non-object input", () => {
      const { state } = importAndGet({ linkLengths: [1, 2, 3] });
      expect(state.linkLengths).toEqual({});
    });
  });

  // ─── Joints / Links (toStringArray) ───────────────────────────────────

  describe("toStringArray (joints/links)", () => {
    it("preserves valid string arrays", () => {
      const { state } = importAndGet({
        joints: ["Rotation", "Pitch", "Elbow"],
      });
      expect(state.joints).toEqual(["Rotation", "Pitch", "Elbow"]);
    });

    it("filters out non-string entries and trims whitespace", () => {
      const { state } = importAndGet({
        joints: ["  Rotation  ", 42, null, "", "Pitch"],
      });
      expect(state.joints).toEqual(["Rotation", "Pitch"]);
    });

    it("returns empty array for non-array input", () => {
      const { state } = importAndGet({ joints: "not_an_array" });
      expect(state.joints).toEqual([]);
    });
  });

  // ─── Export / Import Round-Trip ────────────────────────────────────────

  describe("export / import round-trip", () => {
    it("round-trips a complete profile without data loss", () => {
      // Import a rich profile
      const richProfile = {
        profileName: "Test Bot",
        baseUrdf: "test-bot-urdf",
        joints: ["Rotation", "Pitch", "Elbow"],
        links: ["base_link", "shoulder_link", "elbow_link"],
        linkLengths: { shoulder_link: 0.113, elbow_link: 0.135 },
        linkBoundingBoxes: {
          shoulder_link: [{ size: [0.05, 0.05, 0.113], offset: [0, 0, 0.057] }],
        },
        actuators: {
          Rotation: {
            jointName: "Rotation",
            hardwareType: "sts3215",
            hardwareId: 1,
            torqueLimit: 500,
          },
          Pitch: {
            jointName: "Pitch",
            hardwareType: "sts3215",
            hardwareId: 2,
          },
          Elbow: {
            jointName: "Elbow",
            hardwareType: "nema17",
            hardwareId: 3,
            microsteps: 32,
            stepsPerRev: 200,
            gearRatio: 5.18,
          },
        },
        activeTool: {
          type: "drill",
          name: "Drill Bit",
          hardwareType: "pwm",
          hardwareId: 7,
          tcpOffset: [0, 0, -0.15],
        },
        sceneSettings: {
          environment: "warehouse",
          cameraPosition: [1, 2, 3],
          orbitTarget: [0, 0.5, 0],
          showGrid: false,
        },
      };

      const ok = useRobotProfileStore
        .getState()
        .importProfile(JSON.stringify(richProfile));
      expect(ok).toBe(true);

      // Export it
      const exported = useRobotProfileStore.getState().exportProfile();
      const parsed = JSON.parse(exported);

      // Verify key fields survived the round-trip
      expect(parsed.profileName).toBe("Test Bot");
      expect(parsed.baseUrdf).toBe("test-bot-urdf");
      expect(parsed.joints).toEqual(["Rotation", "Pitch", "Elbow"]);
      expect(parsed.actuators.Rotation.hardwareId).toBe(1);
      expect(parsed.actuators.Elbow.hardwareType).toBe("nema17");
      expect(parsed.actuators.Elbow.microsteps).toBe(32);
      expect(parsed.activeTool.type).toBe("drill");
      expect(parsed.sceneSettings.environment).toBe("warehouse");
      expect(parsed.linkBoundingBoxes.shoulder_link).toHaveLength(1);
    });

    it("re-import of exported JSON produces identical state", () => {
      const profile = {
        profileName: "Stable Bot",
        baseUrdf: "so-arm101",
        joints: ["J1", "J2"],
        actuators: {
          J1: { jointName: "J1", hardwareType: "sts3215", hardwareId: 1 },
          J2: { jointName: "J2", hardwareType: "sts3215", hardwareId: 2 },
        },
      };

      useRobotProfileStore.getState().importProfile(JSON.stringify(profile));
      const exported1 = useRobotProfileStore.getState().exportProfile();

      // Re-import the exported JSON
      useRobotProfileStore.getState().resetProfile();
      useRobotProfileStore.getState().importProfile(exported1);
      const exported2 = useRobotProfileStore.getState().exportProfile();

      expect(JSON.parse(exported1)).toEqual(JSON.parse(exported2));
    });
  });
});
