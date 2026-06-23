import Link from "next/link";

const sectionClass =
  "rounded-2xl border border-slate-200 bg-white/95 p-6 lg:p-8 shadow-sm";

const codeBlockClass =
  "mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm text-emerald-300 font-mono whitespace-pre";

const noteClass =
  "mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900";

const stepClass = "mt-3 text-slate-700 leading-relaxed";

export default function DesignGuidePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-[1100px] px-4 pt-24 pb-10 lg:px-8 lg:pt-28 lg:pb-14">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Modular Robot Guide
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
              Designing a Custom Robot Profile
            </h1>
            <p className="mt-3 max-w-4xl text-base leading-relaxed text-slate-600 lg:text-lg">
              Follow this guide when you want to create a new robot arm,
              describe its joints and links in URDF, and make it work with the
              dashboard, IK solver, and Teensy firmware without editing code.
            </p>
          </div>
          <Link
            href="/docs"
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>

        <div className="space-y-6">
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">1. Design Targets First</h2>
            <p className={stepClass}>
              Start with the job the robot must do, not the URDF. Decide:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
              <li>How many motion axes you need for the task</li>
              <li>Whether the robot is position-only or full-pose capable</li>
              <li>The reach, payload, and speed you expect</li>
              <li>Which joints are arm joints and which are tool-only joints</li>
            </ul>
            <div className={noteClass}>
              The platform is now designed for modular chains from 3 to 10+
              joints. Keep the active kinematic chain serial and ordered from
              base to tool.
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              2. Name Joints and Links Clearly
            </h2>
            <p className={stepClass}>
              Every joint and link name should be unique, stable, and readable.
              Use names that describe function instead of copy-pasting
              SO-ARM101-specific names.
            </p>
            <div className={codeBlockClass}>{`Good examples
BaseYaw
ShoulderPitch
ElbowPitch
WristRoll
ToolGripper

Avoid
joint_1
link_new
temp_axis
copy_of_rotation`}</div>
            <p className={stepClass}>
              The dashboard uses the URDF joint names as the canonical runtime
              identifiers for sliders, actuator mapping, IK ordering, and
              telemetry.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              3. URDF Requirements for the Dashboard
            </h2>
            <p className={stepClass}>
              The parser extracts the active modular chain from your URDF. These
              fields matter the most:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
              <li>
                Each moving joint must have a unique <code>name</code>
              </li>
              <li>
                Each moving joint must define <code>type</code>, usually{" "}
                <code>revolute</code> or <code>continuous</code>
              </li>
              <li>
                Each moving joint should define an <code>origin xyz</code> and{" "}
                <code>origin rpy</code>
              </li>
              <li>
                Each revolute joint should define <code>limit lower</code> and{" "}
                <code>limit upper</code>
              </li>
              <li>
                Fixed joints can stay in the URDF, but they do not become joint
                controls
              </li>
            </ul>
            <div className={codeBlockClass}>{`<joint name="ShoulderPitch" type="revolute">
  <parent link="base_link" />
  <child link="upper_arm" />
  <origin xyz="0 0 0.115" rpy="0 0 0" />
  <axis xyz="0 0 1" />
  <limit lower="-1.57" upper="1.57" effort="10" velocity="2" />
</joint>`}</div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              4. Build the Chain in Base-to-Tool Order
            </h2>
            <p className={stepClass}>
              The runtime chain is ordered from the first moving joint near the
              base to the last moving joint near the tool. For best results:
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-700">
              <li>Put the base joint first in the serial chain</li>
              <li>Add intermediate arm joints in physical order</li>
              <li>Put wrist joints after elbow joints</li>
              <li>Keep tool-only joints separate in your design notes</li>
            </ol>
            <div className={noteClass}>
              If a revolute tool joint should not participate in Cartesian IK,
              document that choice. The next recommended evolution is an
              explicit per-joint IK enable flag in the profile metadata.
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              5. Define Link Geometry and Tool TCP
            </h2>
            <p className={stepClass}>
              The IK solver uses joint-to-joint transforms from the URDF and the
              active tool TCP offset from the profile. Keep these consistent:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
              <li>Use real metric values in URDF meters</li>
              <li>Model the mechanical link offset in each joint origin</li>
              <li>
                Model the tool tip using <code>tcpOffset</code>, not by hiding a
                large fixed offset inside solver code
              </li>
              <li>Update the active tool whenever you change end-effectors</li>
            </ul>
            <div className={codeBlockClass}>{`{
  "activeTool": {
    "type": "gripper",
    "name": "Parallel Gripper",
    "hardwareType": "sts3215",
    "hardwareId": 9,
    "tcpOffset": [0, 0, -0.095]
  }
}`}</div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              6. Map Hardware Per Joint
            </h2>
            <p className={stepClass}>
              Each joint can use a smart servo, stepper, or PWM actuator. The
              profile store and firmware config both expect a per-joint map.
            </p>
            <div className={codeBlockClass}>{`{
  "jointOrder": ["BaseYaw", "ShoulderPitch", "ElbowPitch", "WristPitch"],
  "tcpOffset": [0, 0, -0.09],
  "actuators": {
    "BaseYaw": {
      "hardwareType": "nema23",
      "hardwareId": 1,
      "stepsPerRev": 200,
      "microsteps": 16,
      "gearRatio": 6,
      "stepPin": 2,
      "dirPin": 3
    },
    "ShoulderPitch": {
      "hardwareType": "nema23",
      "hardwareId": 2,
      "stepsPerRev": 200,
      "microsteps": 16,
      "gearRatio": 6,
      "stepPin": 4,
      "dirPin": 5,
      "commandBiasDeg": 1
    },
    "ElbowPitch": {
      "hardwareType": "sts3215",
      "hardwareId": 3,
      "commandBiasDeg": 1
    },
    "WristPitch": {
      "hardwareType": "sts3215",
      "hardwareId": 4
    }
  }
}`}</div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
              <li>Hardware IDs must be unique inside each bus family</li>
              <li>
                Only the first two stepper joints can omit pins, and only if
                you want the firmware defaults 2/3 and 4/5
              </li>
              <li>
                Use <code>commandBiasDeg</code> for gravity or backlash trim
                instead of hardcoding offsets in firmware
              </li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              7. Add Collision Boxes and Visual Checks
            </h2>
            <p className={stepClass}>
              After importing the URDF into the dashboard:
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-700">
              <li>Confirm the detected joint list matches your intended chain</li>
              <li>Open the collision editor and auto-generate boxes</li>
              <li>Trim any oversized boxes around tools or decorative meshes</li>
              <li>Verify the TCP marker reaches the correct tool tip</li>
              <li>Jog every joint and check that axes move as expected</li>
            </ol>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              8. Recommended Bring-Up Workflow
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
              <li>Author or export the URDF</li>
              <li>Import it into the dashboard and inspect detected joints</li>
              <li>Set the tool TCP offset</li>
              <li>Configure actuators in the assembly view</li>
              <li>Connect to ROSBridge and publish the hardware config</li>
              <li>Verify firmware returns an <code>ok:</code> config status</li>
              <li>Test home pose, manual jog, and Cartesian IK</li>
              <li>Generate collision boxes and save the profile export</li>
            </ol>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              9. Validation Checklist Before Real Motion
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
              <li>Joint names are unique and readable</li>
              <li>Joint limits are present for every revolute arm joint</li>
              <li>Joint order matches the physical chain order</li>
              <li>TCP offset matches the mounted tool</li>
              <li>Every actuator has the correct hardware ID and type</li>
              <li>Every stepper after slot 2 has explicit step and dir pins</li>
              <li>Any gravity compensation is stored in commandBiasDeg</li>
              <li>Collision boxes do not block normal motion</li>
              <li>The exported profile can be re-imported without edits</li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">10. Start Simple</h2>
            <p className={stepClass}>
              If you are designing a brand-new robot, begin with a 4-DOF or
              5-DOF chain and a simple tool. Once the chain, limits, TCP, and
              actuator mappings behave correctly, expand to wrist redundancy,
              alternate tools, or mixed actuator stacks.
            </p>
            <div className={noteClass}>
              A clean, fully validated 4-DOF profile is more valuable than a
              9-joint profile with ambiguous naming, missing limits, or an
              incorrect TCP.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
