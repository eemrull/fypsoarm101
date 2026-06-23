import type { RobotJointState } from "@/store/useRobotStateStore";

export type JointLimitRange = [number, number];

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function buildKinematicJointOrder(
  preferredOrder: string[],
  jointStates: Pick<RobotJointState, "name" | "jointType">[],
): string[] {
  const revoluteNames = jointStates
    .filter((joint) => joint.jointType === "revolute")
    .map((joint) => joint.name);

  if (preferredOrder.length === 0) {
    return revoluteNames;
  }

  const byNormalizedName = new Map(
    revoluteNames.map((name) => [normalizeName(name), name] as const),
  );

  const ordered: string[] = [];
  const seen = new Set<string>();

  preferredOrder.forEach((name) => {
    const resolved = byNormalizedName.get(normalizeName(name));
    if (!resolved || seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    ordered.push(resolved);
  });

  revoluteNames.forEach((name) => {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    ordered.push(name);
  });

  return ordered;
}

export function getOrderedRevoluteJoints<T extends RobotJointState>(
  jointStates: T[],
  preferredOrder: string[],
): T[] {
  const byName = new Map(
    jointStates
      .filter((joint): joint is T => joint.jointType === "revolute")
      .map((joint) => [joint.name, joint] as const),
  );

  return buildKinematicJointOrder(preferredOrder, jointStates)
    .map((name) => byName.get(name) ?? null)
    .filter((joint): joint is T => Boolean(joint));
}

export function buildJointLimitRanges(
  joints: Pick<RobotJointState, "limit">[],
): JointLimitRange[] {
  return joints.map((joint, index) => {
    const lower = joint.limit?.lower;
    const upper = joint.limit?.upper;

    if (typeof lower === "number" && typeof upper === "number") {
      return [lower, upper];
    }

    if (index === 0) {
      return [-Math.PI, 3 * Math.PI];
    }

    return [-2 * Math.PI, 2 * Math.PI];
  });
}
