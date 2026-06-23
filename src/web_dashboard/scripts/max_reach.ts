import { computeForwardKinematics } from "../lib/kinematics/IKSolver";

const baseTransforms = computeForwardKinematics([0, 0, 0, 0, 0]);
// Index 1 is the Pitch joint (0=Rotation, 1=Pitch)
const pitchMat = baseTransforms[1];
console.log(
  `Pitch Joint Origin: X=${pitchMat[0][3].toFixed(4)}, Y=${pitchMat[1][3].toFixed(4)}, Z=${pitchMat[2][3].toFixed(4)}`,
);

const deg2rad = (deg: number) => deg * (Math.PI / 180);

let maxX = 0,
  maxZ = 0;
let maxDist = 0;
let maxXAngles = [0, 0, 0, 0, 0];
let maxZAngles = [0, 0, 0, 0, 0];
let maxDistAngles = [0, 0, 0, 0, 0];

for (let p = 0; p <= 360; p += 5) {
  for (let e = 0; e <= 360; e += 5) {
    for (let wp = 0; wp <= 360; wp += 5) {
      const rads = [180, p, e, wp, 180].map(deg2rad);
      const transforms = computeForwardKinematics(rads);
      const eeMat = transforms[transforms.length - 1];
      const x = eeMat[0][3];
      const y = eeMat[1][3];
      const z = eeMat[2][3];

      const px = pitchMat[0][3];
      const py = pitchMat[1][3];
      const pz = pitchMat[2][3];

      // Calculate the Euclidean distance from the Pitch Joint to the generic TCP
      const dist = Math.sqrt(
        Math.pow(x - px, 2) + Math.pow(y - py, 2) + Math.pow(z - pz, 2),
      );

      if (x > maxX) {
        maxX = x;
        maxXAngles = [180, p, e, wp, 180];
      }
      if (z > maxZ) {
        maxZ = z;
        maxZAngles = [180, p, e, wp, 180];
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxDistAngles = [180, p, e, wp, 180];
      }
    }
  }
}
console.log(
  `Max X (Forward Reach): ${maxX.toFixed(4)}m at Pitch:${maxXAngles[1]}, Elbow:${maxXAngles[2]}, WristPitch:${maxXAngles[3]}`,
);
console.log(
  `Max Z (Upward Reach): ${maxZ.toFixed(4)}m at Pitch:${maxZAngles[1]}, Elbow:${maxZAngles[2]}, WristPitch:${maxZAngles[3]}`,
);
console.log(
  `Max Absolute Radius from Pitch: ${maxDist.toFixed(4)}m at Pitch:${maxDistAngles[1]}, Elbow:${maxDistAngles[2]}, WristPitch:${maxDistAngles[3]}`,
);
