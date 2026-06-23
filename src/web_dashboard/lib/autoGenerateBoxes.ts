/**
 * Auto-generate axis-aligned bounding boxes (AABB) for each URDF link
 * from its loaded Three.js mesh geometry.
 *
 * Computes the AABB directly in each link's LOCAL coordinate space by
 * transforming raw mesh vertices, so the box tightly wraps the geometry
 * and rotates with the link.
 */
import * as THREE from "three";

type LinkEntry = { link: THREE.Object3D; linkName: string };
type BoxEntry = {
  size: [number, number, number];
  offset: [number, number, number];
};

/**
 * Check whether a Three.js node is a URDF link or joint boundary.
 */
function isURDFBoundary(node: THREE.Object3D): boolean {
  const t = (node as { type?: string }).type ?? "";
  if (t === "URDFLink" || t === "URDFJoint") return true;
  const u = node as { isURDFLink?: boolean; isURDFJoint?: boolean };
  return !!(u.isURDFLink || u.isURDFJoint);
}

/**
 * Collect meshes belonging only to this link, stopping at child
 * URDFJoint / URDFLink boundaries.
 */
function collectOwnMeshes(link: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (node: THREE.Object3D) => {
    if (node !== link && isURDFBoundary(node)) return;
    if (node instanceof THREE.Mesh && node.geometry) {
      meshes.push(node);
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(link);
  return meshes;
}

/**
 * Compute one AABB per link, directly in the link's local coordinate space.
 *
 * For each link:
 *  1. Collect only meshes belonging to THIS link (stops at URDF boundaries).
 *  2. For each mesh, read the raw geometry position vertices.
 *  3. Transform each vertex from mesh-local → link-local space.
 *  4. Track min/max across all vertices to build a tight link-local AABB.
 *
 * The resulting values are in URDF meters (the SCENE_SCALE cancels out
 * in the mesh→link transform since both share the same scaled parent).
 */
export function computeAutoBoxes(
  links: LinkEntry[],
): Record<string, BoxEntry[]> {
  const result: Record<string, BoxEntry[]> = {};

  const invLinkMat = new THREE.Matrix4();
  const meshToLink = new THREE.Matrix4();
  const vertex = new THREE.Vector3();

  for (const { link, linkName } of links) {
    const meshes = collectOwnMeshes(link);
    if (meshes.length === 0) continue;

    // Link world → link local
    invLinkMat.copy(link.matrixWorld).invert();

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    let hasVertices = false;

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const posAttr = geo.getAttribute("position");
      if (!posAttr) continue;

      // Composite transform: mesh-local → world → link-local
      meshToLink.multiplyMatrices(invLinkMat, mesh.matrixWorld);

      for (let vi = 0; vi < posAttr.count; vi++) {
        vertex.fromBufferAttribute(posAttr as THREE.BufferAttribute, vi);
        vertex.applyMatrix4(meshToLink);

        if (vertex.x < minX) minX = vertex.x;
        if (vertex.y < minY) minY = vertex.y;
        if (vertex.z < minZ) minZ = vertex.z;
        if (vertex.x > maxX) maxX = vertex.x;
        if (vertex.y > maxY) maxY = vertex.y;
        if (vertex.z > maxZ) maxZ = vertex.z;

        hasVertices = true;
      }
    }

    if (!hasVertices) continue;

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;

    // Skip degenerate boxes (any dimension < 1mm)
    if (sizeX < 0.001 || sizeY < 0.001 || sizeZ < 0.001) continue;

    const round = (v: number) => Math.round(v * 10000) / 10000;

    result[linkName] = [
      {
        size: [round(sizeX), round(sizeY), round(sizeZ)],
        offset: [
          round((minX + maxX) / 2),
          round((minY + maxY) / 2),
          round((minZ + maxZ) / 2),
        ],
      },
    ];
  }

  return result;
}
