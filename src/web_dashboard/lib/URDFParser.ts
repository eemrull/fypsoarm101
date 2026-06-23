import type { IKNode } from "./kinematics/IKSolver";

export interface ParsedURDF {
  robotName: string;
  joints: string[];
  links: string[];
  linkLengths: Record<string, number>;
  ikJointOrder: string[];
  ikNodes: IKNode[];
  jointLimits: Record<string, { lower?: number; upper?: number }>;
}

function parseVectorAttribute(
  value: string | null,
): [number, number, number] {
  if (!value) {
    return [0, 0, 0];
  }

  const parsed = value
    .trim()
    .split(/\s+/)
    .map((entry) => Number.parseFloat(entry));

  if (parsed.length !== 3 || parsed.some((entry) => !Number.isFinite(entry))) {
    return [0, 0, 0];
  }

  return parsed as [number, number, number];
}

/**
 * Parses a raw URDF XML string to extract the kinematic chain definition.
 * Uses the browser's native DOMParser.
 */
export function parseURDF(urdfString: string): ParsedURDF {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(urdfString, "text/xml");

  const robotName =
    xmlDoc.documentElement.getAttribute("name") || "unknown_robot";

  const linkElements = xmlDoc.getElementsByTagName("link");
  const links: string[] = [];
  for (let i = 0; i < linkElements.length; i++) {
    const name = linkElements[i].getAttribute("name");
    if (name) links.push(name);
  }

  const jointElements = xmlDoc.getElementsByTagName("joint");
  const joints: string[] = [];
  const linkLengths: Record<string, number> = {};
  const ikJointOrder: string[] = [];
  const ikNodes: IKNode[] = [];
  const jointLimits: Record<string, { lower?: number; upper?: number }> = {};

  for (let i = 0; i < jointElements.length; i++) {
    const joint = jointElements[i];
    const name = joint.getAttribute("name");
    const type = joint.getAttribute("type");

    // Extract moving joints (revolute, continuous, prismatic)
    if (name && type !== "fixed" && type !== "floating") {
      joints.push(name);
    }

    // Attempt to extract translation (link length) from <origin xyz="x y z" />
    const origin = joint.getElementsByTagName("origin")[0];
    if (name && origin) {
      const xyz = parseVectorAttribute(origin.getAttribute("xyz"));
      const distance = Math.sqrt(
        xyz[0] * xyz[0] + xyz[1] * xyz[1] + xyz[2] * xyz[2],
      );
      linkLengths[name] = distance;
    }

    if (
      name &&
      (type === "revolute" || type === "continuous")
    ) {
      const originEl = joint.getElementsByTagName("origin")[0];
      const limitEl = joint.getElementsByTagName("limit")[0];

      ikJointOrder.push(name);
      ikNodes.push({
        trans: parseVectorAttribute(originEl?.getAttribute("xyz") ?? null),
        rot: parseVectorAttribute(originEl?.getAttribute("rpy") ?? null),
      });
      jointLimits[name] = {
        lower:
          limitEl?.getAttribute("lower") !== null
            ? Number.parseFloat(limitEl.getAttribute("lower") as string)
            : undefined,
        upper:
          limitEl?.getAttribute("upper") !== null
            ? Number.parseFloat(limitEl.getAttribute("upper") as string)
            : undefined,
      };
    }
  }

  return {
    robotName,
    joints,
    links,
    linkLengths,
    ikJointOrder,
    ikNodes,
    jointLimits,
  };
}
