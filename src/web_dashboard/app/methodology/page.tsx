import Link from "next/link";
import { MathJaxLoader } from "@/components/methodology/MathJaxLoader";

const sectionClass =
  "rounded-2xl border border-slate-200 bg-white/95 p-6 lg:p-8 shadow-sm";

const mathBlockClass =
  "mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900";

const noteClass =
  "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900";

const courseRefClass =
  "mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 italic";

const tableHeaderClass =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide";
const tableCellClass = "px-3 py-2 font-mono text-sm";

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <MathJaxLoader />

      <div className="mx-auto max-w-[1280px] px-4 pt-24 pb-10 lg:px-8 lg:pt-28 lg:pb-14">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              FYP Technical Appendix
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl xl:text-5xl">
              SO-ARM101 Kinematics &amp; IK Derivation
            </h1>
            <p className="mt-3 max-w-4xl text-base leading-relaxed text-slate-600 lg:text-lg">
              Complete mathematical documentation of the forward kinematics,
              Jacobian derivation, and inverse kinematics solvers used by the
              SO-ARM101 web dashboard. This page mirrors the implementation in{" "}
              <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
                src/web_dashboard/lib/kinematics/IKSolver.ts
              </code>{" "}
              and references concepts from the{" "}
              <strong>Fundamentals of Robotics</strong> course.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>

        <div className="space-y-6">
          {/* ──────────────────── SECTION 1 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              1. Robot Configuration &amp; Variables
            </h2>
            <p className="mt-3 text-slate-700">
              The SO-ARM101 is a <strong>5-DOF revolute manipulator</strong>{" "}
              with a 1-DOF gripper (jaw). The IK chain considers the 5
              positioning joints only. As taught in Fundamentals of Robotics,
              each revolute joint contributes one degree of freedom to the
              robot&rsquo;s workspace.
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-800">
                  <tr>
                    <th className={tableHeaderClass}>Joint i</th>
                    <th className={tableHeaderClass}>Name</th>
                    <th className={tableHeaderClass}>Type</th>
                    <th className={tableHeaderClass}>Variable</th>
                    <th className={tableHeaderClass}>Function</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[
                    ["1", "Rotation", "Revolute", "θ₁", "Base pan (yaw)"],
                    ["2", "Pitch", "Revolute", "θ₂", "Shoulder lift"],
                    ["3", "Elbow", "Revolute", "θ₃", "Elbow pitch"],
                    ["4", "Wrist_Pitch", "Revolute", "θ₄", "Wrist up/down"],
                    ["5", "Wrist_Roll", "Revolute", "θ₅", "Wrist twist"],
                    [
                      "6",
                      "Jaw",
                      "Revolute",
                      "θ₆",
                      "Gripper (excluded from IK)",
                    ],
                  ].map(([i, name, type, variable, fn], idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      <td className={tableCellClass}>{i}</td>
                      <td className={tableCellClass}>{name}</td>
                      <td className={tableCellClass}>{type}</td>
                      <td className={tableCellClass}>{variable}</td>
                      <td className={`${tableCellClass} font-sans`}>{fn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mt-5 text-lg font-semibold">Unit Conventions</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              <li>
                UI displays joint commands in <strong>degrees</strong>.
              </li>
              <li>
                All internal solver computations use <strong>radians</strong>{" "}
                and <strong>meters</strong>.
              </li>
              <li>
                IK target is a Cartesian position{" "}
                {"\\(p_t = [x,\\,y,\\,z]^T\\)"} (3-axis) or pose{" "}
                {"\\([x,y,z,r_x,r_y,r_z]^T\\)"} (6-component).
              </li>
            </ul>
            <div className={mathBlockClass}>
              <p>
                {"\\(\\theta_{rad} = \\theta_{deg}\\cdot\\frac{\\pi}{180}\\)"}
              </p>
              <p>
                {"\\(\\theta_{deg} = \\theta_{rad}\\cdot\\frac{180}{\\pi}\\)"}
              </p>
            </div>
            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Chapter on robot configuration, joint
              space vs. task (Cartesian) space representation, and degrees of
              freedom.
            </p>
          </section>

          {/* ──────────────────── SECTION 2 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              2. Forward Kinematics (URDF-Exact)
            </h2>
            <p className="mt-3 text-slate-700">
              The production FK follows the URDF transform chain directly so the
              3D simulation and analytical model stay aligned with the real
              assembly geometry. Each joint transform is built from a{" "}
              <strong>translation</strong>, a{" "}
              <strong>fixed Euler rotation</strong> (from the URDF), and the{" "}
              <strong>variable joint rotation</strong> around the local Z-axis.
              This is the fundamental concept of{" "}
              <em>homogeneous transformation matrices</em> as taught in
              Fundamentals of Robotics.
            </p>

            <h3 className="mt-5 text-lg font-semibold">Per-Joint Transform</h3>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[{}^{i-1}T_i = T(x_i,y_i,z_i)\\;R_{xyz}(\\alpha_i,\\beta_i,\\gamma_i)\\;R_z(\\theta_i)\\]"
                }
              </p>
              <p className="mt-2 text-slate-600 text-xs">
                {
                  "where \\(T(x,y,z)\\) is a pure translation matrix, \\(R_{xyz}\\) is an XYZ Euler rotation matrix, and \\(R_z(\\theta_i)\\) is the variable joint rotation."
                }
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Homogeneous Transformation Matrix
            </h3>
            <p className="mt-2 text-slate-700">
              Each 4×4 homogeneous transformation encodes both rotation and
              translation in a single matrix, enabling chained multiplication:
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[T = \\begin{bmatrix} R_{3\\times3} & d_{3\\times1} \\\\ 0_{1\\times3} & 1 \\end{bmatrix} \\in SE(3)\\]"
                }
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Global End-Effector Pose
            </h3>
            <div className={mathBlockClass}>
              <p>{"\\[{}^0T_n = \\prod_{i=1}^{n} {}^{i-1}T_i\\]"}</p>
              <p>
                {
                  "\\[p_{ee} = \\begin{bmatrix} {}^0T_n(1,4) \\\\ {}^0T_n(2,4) \\\\ {}^0T_n(3,4) \\end{bmatrix}\\]"
                }
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">URDF Node Parameters</h3>
            <p className="mt-2 text-slate-700 text-sm">
              Extracted from the SO-ARM101 URDF file. Each node defines a fixed
              translation and fixed Euler rotation before the variable joint
              angle:
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-800">
                  <tr>
                    <th className={tableHeaderClass}>Joint</th>
                    <th className={tableHeaderClass}>trans [x, y, z] (m)</th>
                    <th className={tableHeaderClass}>rot [rx, ry, rz] (rad)</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[
                    ["Rotation", "[0.0388, 0, 0.0648]", "[π, 0, 0]"],
                    [
                      "Pitch",
                      "[-0.0304, -0.0183, -0.0542]",
                      "[-π/2, 1.5692, 0]",
                    ],
                    ["Elbow", "[-0.1126, -0.028, 0]", "[0, 0, 3π/2]"],
                    ["Wrist Pitch", "[-0.1349, 0.0052, 0]", "[0, 0, π/2]"],
                    ["Wrist Roll", "[0, -0.0611, 0.0181]", "[π/2, 3.1903, π]"],
                  ].map(([joint, trans, rot], idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      <td className={tableCellClass}>{joint}</td>
                      <td className={tableCellClass}>{trans}</td>
                      <td className={tableCellClass}>{rot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Tool Center Point (TCP) Offset
            </h3>
            <p className="mt-2 text-slate-700">
              After the last joint (Wrist_Roll), a rigid{" "}
              <strong>TCP offset</strong> of {"\\([0,\\,0,\\,-0.087]\\)"} m is
              appended. This does not introduce a new DOF; it extends the
              kinematic chain to the physical tip of the end-effector.
            </p>

            <p className={noteClass}>
              Code source: <code>IKSolver.ts → computeForwardKinematics()</code>
            </p>
            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Homogeneous transformation matrices,
              composition of translations and rotations, and the
              product-of-exponentials formula.
            </p>
          </section>

          {/* ──────────────────── SECTION 3 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              3. Modified DH Parameters (Report Model)
            </h2>
            <p className="mt-3 text-slate-700">
              For formal reporting and derivation, the same kinematic chain is
              represented using{" "}
              <strong>Modified Denavit-Hartenberg (mDH) parameters</strong>.
              This is the standard convention introduced in Fundamentals of
              Robotics for systematically describing link geometry.
            </p>
            <p className="mt-2 text-slate-700">
              Each link is described by four parameters:{" "}
              <strong>
                a<sub>i</sub>
              </strong>{" "}
              (link length),{" "}
              <strong>
                α<sub>i</sub>
              </strong>{" "}
              (link twist),{" "}
              <strong>
                d<sub>i</sub>
              </strong>{" "}
              (link offset), and{" "}
              <strong>
                θ<sub>i</sub>
              </strong>{" "}
              (joint angle, the variable for revolute joints).
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-800">
                  <tr>
                    <th className={tableHeaderClass}>Joint i</th>
                    <th className={tableHeaderClass}>
                      a<sub>i</sub> (m)
                    </th>
                    <th className={tableHeaderClass}>
                      α<sub>i</sub> (rad)
                    </th>
                    <th className={tableHeaderClass}>
                      d<sub>i</sub> (m)
                    </th>
                    <th className={tableHeaderClass}>
                      θ<sub>i</sub>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[
                    ["1 Rotation", "0.000", "−π/2", "0.10565", "θ₁"],
                    ["2 Pitch", "0.135", "0", "0.005", "θ₂ − π/2"],
                    ["3 Elbow", "0.135", "0", "0.000", "θ₃"],
                    ["4 Wrist Pitch", "0.000", "+π/2", "0.061", "θ₄"],
                    ["5 Wrist Roll", "0.000", "0", "0.118", "θ₅"],
                  ].map(([joint, a, alpha, d, theta], idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      <td className={tableCellClass}>{joint}</td>
                      <td className={tableCellClass}>{a}</td>
                      <td className={tableCellClass}>{alpha}</td>
                      <td className={tableCellClass}>{d}</td>
                      <td className={tableCellClass}>{theta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Modified DH Transform Matrix
            </h3>
            <p className="mt-2 text-slate-700">
              Each link&rsquo;s transform is computed as a sequence of four
              elementary operations:
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[{}^{i-1}A_i = R_x(\\alpha_{i-1})\\,T_x(a_{i-1})\\,R_z(\\theta_i)\\,T_z(d_i)\\]"
                }
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">Expanded 4×4 Matrix</h3>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[{}^{i-1}A_i = \\begin{bmatrix} c\\theta_i & -s\\theta_i & 0 & a_{i-1} \\\\ s\\theta_i\\,c\\alpha_{i-1} & c\\theta_i\\,c\\alpha_{i-1} & -s\\alpha_{i-1} & -s\\alpha_{i-1}\\,d_i \\\\ s\\theta_i\\,s\\alpha_{i-1} & c\\theta_i\\,s\\alpha_{i-1} & c\\alpha_{i-1} & c\\alpha_{i-1}\\,d_i \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}\\]"
                }
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {
                  "where \\(c\\theta_i = \\cos\\theta_i\\), \\(s\\theta_i = \\sin\\theta_i\\), etc."
                }
              </p>
            </div>
            <div className={mathBlockClass}>
              <p>
                {"\\[{}^0T_n = {}^0A_1\\,{}^1A_2\\,\\cdots\\,{}^{n-1}A_n\\]"}
              </p>
            </div>
            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Denavit-Hartenberg convention, link
              parameter assignment, systematic frame attachment rules, and
              constructing the full kinematic model from DH tables.
            </p>
          </section>

          {/* ──────────────────── SECTION 4 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              4. Jacobian Matrix Derivation
            </h2>
            <p className="mt-3 text-slate-700">
              The <strong>Jacobian matrix</strong> relates joint velocities to
              end-effector velocities. For a revolute joint, the Jacobian column
              is derived from the joint&rsquo;s axis of rotation and its
              position relative to the end-effector. This is a core concept in
              the velocity kinematics module of Fundamentals of Robotics.
            </p>

            <h3 className="mt-5 text-lg font-semibold">
              6×N Jacobian Structure
            </h3>
            <p className="mt-2 text-slate-700">
              The full Jacobian has 6 rows (3 linear velocity + 3 angular
              velocity) and N columns (one per joint):
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[J = \\begin{bmatrix} J_v \\\\ J_\\omega \\end{bmatrix} = \\begin{bmatrix} J_{v_1} & J_{v_2} & \\cdots & J_{v_n} \\\\ J_{\\omega_1} & J_{\\omega_2} & \\cdots & J_{\\omega_n} \\end{bmatrix} \\in \\mathbb{R}^{6\\times n}\\]"
                }
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Per-Joint Column (Revolute)
            </h3>
            <p className="mt-2 text-slate-700">
              For joint <em>i</em>, let {"\\(z_i\\)"} be the joint&rsquo;s
              rotation axis in global coordinates, {"\\(p_i\\)"} the joint
              position, and {"\\(p_e\\)"} the end-effector position:
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[J_{v_i} = z_i \\times (p_e - p_i) \\quad \\text{(linear velocity)}\\]"
                }
              </p>
              <p>
                {"\\[J_{\\omega_i} = z_i \\quad \\text{(angular velocity)}\\]"}
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Cross Product Expansion
            </h3>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[z_i \\times (p_e - p_i) = \\begin{bmatrix} z_{i_y}(p_{e_z} - p_{i_z}) - z_{i_z}(p_{e_y} - p_{i_y}) \\\\ z_{i_z}(p_{e_x} - p_{i_x}) - z_{i_x}(p_{e_z} - p_{i_z}) \\\\ z_{i_x}(p_{e_y} - p_{i_y}) - z_{i_y}(p_{e_x} - p_{i_x}) \\end{bmatrix}\\]"
                }
              </p>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              {
                "The z-axis \\(z_i\\) is extracted from the third column of the joint's global rotation matrix \\({}^0R_i\\), i.e. \\(z_i = {}^0R_i(:,3)\\)."
              }
            </p>

            <p className={noteClass}>
              Code source: <code>IKSolver.ts → computeJacobian()</code>
            </p>
            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Velocity kinematics, geometric
              Jacobian construction for revolute joints, and the relationship
              between joint-space and task-space velocities.
            </p>
          </section>

          {/* ──────────────────── SECTION 5 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              5. IK Solver 1: Jacobian Transpose with Adaptive Damping
            </h2>
            <p className="mt-3 text-slate-700">
              The primary solver uses the{" "}
              <strong>Jacobian transpose method</strong> with adaptive step-size
              damping near singularities. This is a numerical iterative approach
              covered in the inverse kinematics section of Fundamentals of
              Robotics.
            </p>

            <h3 className="mt-5 text-lg font-semibold">Algorithm</h3>
            <p className="mt-2 text-slate-700">
              At each iteration <em>k</em>:
            </p>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 1 — Compute Position Error
            </h4>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[e_k = p_t - p_k = \\begin{bmatrix} x_t - x_k \\\\ y_t - y_k \\\\ z_t - z_k \\end{bmatrix}\\]"
                }
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 2 — Check Convergence
            </h4>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\text{If } \\|e_k\\|_2 < \\varepsilon, \\text{ stop (converged)}\\]"
                }
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 3 — Compute Jacobian &amp; Manipulability
            </h4>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[w = \\sqrt{\\det(J_v\\,J_v^T)} \\quad \\text{(manipulability measure)}\\]"
                }
              </p>
              <p className="mt-1">
                {
                  "\\[\\alpha = \\begin{cases} \\alpha_0 & \\text{if } w > 0.001 \\\\ \\alpha_0 \\cdot \\max\\!\\left(0.05,\\;\\frac{w}{0.001}\\right) & \\text{otherwise (near singularity)} \\end{cases}\\]"
                }
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {
                  "where \\(\\alpha_0 = 0.5\\) is the base step size. This adaptive damping reduces oscillation near singular configurations."
                }
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 4 — Joint Update
            </h4>
            <div className={mathBlockClass}>
              <p>
                {"\\[\\Delta\\theta_k = \\alpha\\,J_v(\\theta_k)^T\\,e_k\\]"}
              </p>
              <p className="mt-1">
                {
                  "\\[\\Delta\\theta_j \\leftarrow \\operatorname{clip}(\\Delta\\theta_j,\\;-0.1,\\;0.1) \\quad \\forall\\,j\\]"
                }
              </p>
              <p className="mt-1">
                {"\\[\\theta_{k+1} = \\theta_k + \\Delta\\theta_k\\]"}
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 5 — Clamp to Joint Limits
            </h4>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\theta_j^{(k+1)} \\leftarrow \\max\\!\\left(\\theta_j^{\\min},\\;\\min\\!\\left(\\theta_j^{\\max},\\;\\theta_j^{(k+1)}\\right)\\right)\\]"
                }
              </p>
            </div>

            <h3 className="mt-5 text-lg font-semibold">Default Constants</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 text-sm">
              <li>{"\\(\\alpha_0 = 0.5\\)"} (base step size)</li>
              <li>
                {"\\(\\varepsilon = 0.01\\,\\text{m}\\)"} (convergence
                tolerance)
              </li>
              <li>{"\\(k_{max} = 50\\)"} (maximum iterations)</li>
              <li>
                {"\\(\\Delta\\theta\\)"} clamped to {"\\([-0.1, +0.1]\\)"} rad
                per step
              </li>
            </ul>

            <p className={noteClass}>
              Code source: <code>IKSolver.ts → solveIK_Jacobian()</code>
            </p>
            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Numerical inverse kinematics —
              Jacobian transpose, pseudo-inverse, and damped least-squares
              methods. Convergence analysis and singularity avoidance
              strategies.
            </p>
          </section>

          {/* ──────────────────── SECTION 6 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              6. IK Solver 2: Cyclic Coordinate Descent (CCD)
            </h2>
            <p className="mt-3 text-slate-700">
              CCD is a heuristic IK method that adjusts one joint at a time,
              sweeping backward from the end-effector to the base. Unlike the
              Jacobian approach, CCD does not require matrix inversion and is
              inherently robust near singularities. In Fundamentals of Robotics,
              this contrasts with analytical IK methods that solve the kinematic
              equations in closed form.
            </p>

            <h3 className="mt-5 text-lg font-semibold">Per-Joint Update</h3>
            <p className="mt-2 text-slate-700">
              For joint <em>j</em> (iterating <em>j = n, n−1, …, 1</em>):
            </p>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 1 — Vectors
            </h4>
            <div className={mathBlockClass}>
              <p>
                {"\\[v_e = p_e - p_j \\quad \\text{(joint → end-effector)}\\]"}
              </p>
              <p>{"\\[v_t = p_t - p_j \\quad \\text{(joint → target)}\\]"}</p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 2 — Project onto Rotation Plane
            </h4>
            <p className="mt-2 text-slate-700 text-sm">
              Since each joint can only rotate about its Z-axis, we project both
              vectors onto the plane perpendicular to {"\\(z_j\\)"}:
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\hat{v}_e = v_e - (v_e \\cdot z_j)\\,z_j = \\Pi_{\\perp z_j}(v_e)\\]"
                }
              </p>
              <p>
                {
                  "\\[\\hat{v}_t = v_t - (v_t \\cdot z_j)\\,z_j = \\Pi_{\\perp z_j}(v_t)\\]"
                }
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 3 — Compute Signed Angle
            </h4>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\cos\\delta\\theta = \\frac{\\hat{v}_e \\cdot \\hat{v}_t}{\\|\\hat{v}_e\\|\\;\\|\\hat{v}_t\\|}\\]"
                }
              </p>
              <p className="mt-1">
                {
                  "\\[\\operatorname{sgn}(\\delta\\theta) = \\operatorname{sign}\\!\\left((\\hat{v}_e \\times \\hat{v}_t) \\cdot z_j\\right)\\]"
                }
              </p>
              <p className="mt-1">
                {
                  "\\[\\delta\\theta = \\operatorname{sgn}(\\delta\\theta) \\cdot \\cos^{-1}(\\cos\\delta\\theta)\\]"
                }
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 4 — Clamp &amp; Apply
            </h4>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\theta_j \\leftarrow \\theta_j + \\operatorname{clip}(\\delta\\theta,\\;-0.2,\\;0.2)\\]"
                }
              </p>
            </div>

            <h4 className="mt-4 font-semibold text-slate-800">
              Step 5 — Re-compute FK
            </h4>
            <p className="mt-2 text-sm text-slate-600">
              After updating joint <em>j</em>, the FK is recomputed so the next
              joint in the sweep sees the updated end-effector position. This
              ensures each adjustment is made against the latest chain state.
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Joint limits are clamped after each full backward sweep (outer
              iteration).
            </p>

            <p className={noteClass}>
              Code source: <code>IKSolver.ts → solveIK_CCD()</code>
            </p>
            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Comparison of analytical vs.
              numerical IK approaches, iterative convergence methods, and
              heuristic solvers for redundant/non-standard configurations.
            </p>
          </section>

          {/* ──────────────────── SECTION 7 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">7. Hybrid Solve Strategy</h2>
            <p className="mt-3 text-slate-700">
              The default &ldquo;hybrid&rdquo; solver chains both methods: CCD
              quickly converges to a coarse solution, then the Jacobian method
              refines toward higher precision. This two-phase pipeline combines
              the robustness of CCD with the accuracy of the gradient-based
              Jacobian approach.
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\theta_{ccd} = \\operatorname{CCD}(p_t,\\,\\theta_0\\,;\\; k=20,\\; \\varepsilon=0.02)\\]"
                }
              </p>
              <p>
                {
                  "\\[\\theta^* = \\operatorname{Jacobian}(p_t,\\,\\theta_{ccd}\\,;\\; k=20,\\; \\varepsilon=0.01)\\]"
                }
              </p>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Phase 1 (CCD) runs with a looser tolerance (2 cm) and fewer
              iterations. Phase 2 (Jacobian) tightens to 1 cm precision using
              the CCD output as its initial guess, avoiding the cold-start
              problem that can trap gradient methods in local minima far from
              the target.
            </p>
          </section>

          {/* ──────────────────── SECTION 8 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              8. Singularity Analysis &amp; Robustness
            </h2>

            <h3 className="mt-4 text-lg font-semibold">
              Manipulability Measure
            </h3>
            <p className="mt-2 text-slate-700">
              The solver monitors proximity to singularities using the{" "}
              <strong>manipulability index</strong>, a scalar that drops to zero
              at singular configurations:
            </p>
            <div className={mathBlockClass}>
              <p>{"\\[w = \\sqrt{\\det(J_v\\,J_v^T)}\\]"}</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {
                "For a 5-DOF arm (\\(n < 6\\)), only the 3×3 position sub-Jacobian \\(J_v \\in \\mathbb{R}^{3\\times5}\\) is used, computing \\(\\det(J_v J_v^T) \\in \\mathbb{R}^{3\\times3}\\)."
              }
            </p>

            <h3 className="mt-5 text-lg font-semibold">
              Adaptive Damping Schedule
            </h3>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\alpha(w) = \\begin{cases} 0.5 & w > 0.001 \\\\ 0.5 \\cdot \\max(0.05,\\; w/0.001) & w \\leq 0.001 \\end{cases}\\]"
                }
              </p>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Near singularities, the step size smoothly reduces to 5% of the
              base value, preventing the oscillatory &ldquo;whipping&rdquo;
              behavior common in undamped Jacobian methods.
            </p>

            <h3 className="mt-5 text-lg font-semibold">
              Additional Safeguards
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              <li>
                Per-step angle clamping prevents oscillation and overshoot.
              </li>
              <li>
                Finite-value checks reject NaN/Infinity intermediate states.
              </li>
              <li>
                Joint outputs are clamped to configured limits before actuation.
              </li>
            </ul>

            <h3 className="mt-5 text-lg font-semibold">
              Computational Complexity
            </h3>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\text{Jacobian IK} = O(k \\cdot n), \\quad \\text{CCD IK} = O(k \\cdot n)\\]"
                }
              </p>
              <p>
                {
                  "\\[\\text{Hybrid} = O(k_{ccd} \\cdot n + k_{jac} \\cdot n)\\]"
                }
              </p>
            </div>

            <p className={courseRefClass}>
              📖 Fundamentals of Robotics: Singularity analysis, manipulability
              ellipsoids, Yoshikawa&rsquo;s manipulability measure, and
              strategies for operating near singular configurations.
            </p>
          </section>

          {/* ──────────────────── SECTION 9 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              9. Full-Pose Orientation Error
            </h2>
            <p className="mt-3 text-slate-700">
              When a full pose target {"\\([x,y,z,r_x,r_y,r_z]\\)"} is
              provided, the Jacobian solver adds an{" "}
              <strong>orientation error term</strong> to the update rule. The
              orientation error is computed using the cross-product method on
              the rotation matrix columns:
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[e_\\omega = \\frac{1}{2}\\left(n_c \\times n_t + s_c \\times s_t + a_c \\times a_t\\right)\\]"
                }
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {
                  "where \\(n, s, a\\) are the first, second, and third columns of the rotation matrices (current \\(c\\) and target \\(t\\) respectively)."
                }
              </p>
            </div>
            <p className="mt-2 text-slate-700">The total error becomes:</p>
            <div className={mathBlockClass}>
              <p>{"\\[e_{total} = \\|e_{pos}\\|_2 + \\|e_\\omega\\|_2\\]"}</p>
            </div>
            <p className="mt-2 text-slate-700">
              And the joint update incorporates both components through the full
              6×N Jacobian:
            </p>
            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\Delta\\theta_j = \\alpha \\left( \\sum_{r=1}^{3} J_r^{(j)}\\,e_r^{pos} + \\sum_{r=4}^{6} J_r^{(j)}\\,e_{r-3}^{\\omega} \\right)\\]"
                }
              </p>
            </div>
            <p className={noteClass}>
              Code source: <code>IKSolver.ts → solveIK_Jacobian()</code>, lines
              399–436
            </p>
          </section>

          {/* ──────────────────── SECTION 10 ──────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              10. Joint Limits &amp; Clamping
            </h2>
            <p className="mt-3 text-slate-700">
              All solver outputs are constrained to the physical joint limits of
              the SO-ARM101. The default limits can be overridden at runtime
              (e.g. from parsed URDF data).
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-800">
                  <tr>
                    <th className={tableHeaderClass}>Joint</th>
                    <th className={tableHeaderClass}>Min (rad)</th>
                    <th className={tableHeaderClass}>Max (rad)</th>
                    <th className={tableHeaderClass}>Min (deg)</th>
                    <th className={tableHeaderClass}>Max (deg)</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[
                    ["Rotation", "−π", "3π", "−180°", "540°"],
                    ["Pitch", "0", "2π", "0°", "360°"],
                    ["Elbow", "0", "2π", "0°", "360°"],
                    ["Wrist Pitch", "0", "2π", "0°", "360°"],
                    ["Wrist Roll", "−π", "3π", "−180°", "540°"],
                  ].map(([joint, min, max, minD, maxD], idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      <td className={tableCellClass}>{joint}</td>
                      <td className={tableCellClass}>{min}</td>
                      <td className={tableCellClass}>{max}</td>
                      <td className={tableCellClass}>{minD}</td>
                      <td className={tableCellClass}>{maxD}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={mathBlockClass}>
              <p>
                {
                  "\\[\\theta_j \\leftarrow \\max\\!\\left(\\theta_j^{\\min},\\;\\min\\!\\left(\\theta_j^{\\max},\\;\\theta_j\\right)\\right) \\quad \\forall\\,j \\in \\{1,\\ldots,5\\}\\]"
                }
              </p>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              The wide default limits (especially for Rotation and Wrist_Roll)
              are intentional — the physical robot&rsquo;s home position is
              ~180° (π rad), and overly tight limits cause the IK solver to
              collapse from 180° down to 90° instantly, creating violent joint
              motions.
            </p>

            <p className={noteClass}>
              Code source: <code>IKSolver.ts → clampJointLimits()</code>,{" "}
              <code>setJointLimits()</code>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
