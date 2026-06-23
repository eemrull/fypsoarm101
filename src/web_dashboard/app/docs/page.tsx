import Link from "next/link";

const sectionClass =
  "rounded-2xl border border-slate-200 bg-white/95 p-6 lg:p-8 shadow-sm";

const codeBlockClass =
  "mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm text-emerald-300 font-mono whitespace-pre";

const noteClass =
  "mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900";

const stepClass = "mt-3 text-slate-700 leading-relaxed";
const quickLinkClass =
  "rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-[1280px] px-4 pt-24 pb-10 lg:px-8 lg:pt-28 lg:pb-14">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Documentation
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl xl:text-5xl">
              Modular Robot Setup Guide
            </h1>
            <p className="mt-3 max-w-4xl text-base leading-relaxed text-slate-600 lg:text-lg">
              Step-by-step instructions for setting up the SO-ARM101 modular
              robot stack, connecting the dashboard to firmware, and designing
              custom robot profiles that the platform can load dynamically.
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
          <section className="grid gap-4 md:grid-cols-3">
            <Link href="/docs" className={quickLinkClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Start Here
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
                Setup Guide
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Install the dashboard, flash Teensy firmware, and bring up
                ROSBridge plus micro-ROS.
              </p>
            </Link>

            <Link href="/docs/design-guide" className={quickLinkClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Build New Robots
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
                Modular Design Guide
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Follow the naming, URDF, joint, link, TCP, and hardware rules
                for custom 3-to-10+ joint robots.
              </p>
            </Link>

            <Link href="/methodology" className={quickLinkClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Math Reference
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
                IK Methodology
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Review the FK, Jacobian DLS, CCD, and pose-error math used by
                the browser-side solvers.
              </p>
            </Link>
          </section>

          {/* ── Prerequisites ────────────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">1. Prerequisites</h2>
            <p className={stepClass}>
              Make sure the following are installed on your development machine:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
              <li>
                <strong>Node.js ≥ 18</strong> —{" "}
                <a
                  href="https://nodejs.org"
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  nodejs.org
                </a>
              </li>
              <li>
                <strong>Python 3.10+</strong> — Required for the ROS 2 bridge
                scripts
              </li>
              <li>
                <strong>PlatformIO</strong> — For Teensy 4.1 firmware builds (
                <a
                  href="https://platformio.org/install"
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  install guide
                </a>
                )
              </li>
              <li>
                <strong>ROS 2 Humble or Jazzy</strong> — On the SBC /
                development machine (
                <a
                  href="https://docs.ros.org/en/humble/Installation.html"
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  docs
                </a>
                )
              </li>
              <li>
                <strong>Git</strong> — For cloning the repository
              </li>
            </ul>
          </section>

          {/* ── Clone & Install ──────────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">2. Clone &amp; Install</h2>
            <p className={stepClass}>
              Clone the repository and install the web dashboard dependencies:
            </p>
            <div
              className={codeBlockClass}
            >{`git clone https://github.com/eemrull/fypsoarm101.git
cd fypsoarm101/src/web_dashboard
npm install`}</div>
          </section>

          {/* ── Run Web Dashboard ────────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">3. Run the Web Dashboard</h2>
            <p className={stepClass}>Start the Next.js development server:</p>
            <div className={codeBlockClass}>{`npm run dev`}</div>
            <p className={stepClass}>
              Open{" "}
              <code className="rounded bg-slate-200 px-1.5 py-0.5">
                http://localhost:3000
              </code>{" "}
              in your browser. You should see the SO-ARM101 home page with robot
              cards. Click <strong>Play</strong> on the SO-ARM101 card to open
              the 3D playground.
            </p>
            <p className={stepClass}>To build for production:</p>
            <div className={codeBlockClass}>{`npm run build
npm start`}</div>
          </section>

          {/* ── Firmware ─────────────────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">4. Teensy 4.1 Firmware</h2>
            <p className={stepClass}>
              The Teensy 4.1 runs micro-ROS firmware that receives joint
              commands and publishes servo feedback over serial.
            </p>

            <h3 className="mt-4 text-lg font-semibold">
              Build &amp; Flash with PlatformIO
            </h3>
            <div className={codeBlockClass}>{`cd firmware_fyp-teensy41
pio run --target upload`}</div>

            <div className={noteClass}>
              ⚠️ Make sure the Teensy is connected via USB and{" "}
              <strong>Teensy Loader</strong> is not blocking the port. On
              Windows you may need the <strong>Teensy USB Serial</strong>{" "}
              driver.
            </div>

            <h3 className="mt-4 text-lg font-semibold">Serial Monitor</h3>
            <div
              className={codeBlockClass}
            >{`pio device monitor -b 6000000`}</div>
            <p className="mt-2 text-sm text-slate-600">
              Baud rate is <strong>6,000,000</strong> to match the micro-ROS
              agent serial transport.
            </p>
          </section>

          {/* ── ROS 2 Bridge ─────────────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">5. ROS 2 Bridge (SBC)</h2>
            <p className={stepClass}>
              On the SBC (Raspberry Pi, Jetson, etc.) that is physically
              connected to the Teensy via USB, run two processes:
            </p>

            <h3 className="mt-4 text-lg font-semibold">A. Micro-ROS Agent</h3>
            <p className="mt-2 text-slate-700 text-sm">
              Bridges the Teensy 4.1 serial connection into the ROS 2 DDS
              network:
            </p>
            <div
              className={codeBlockClass}
            >{`ros2 run micro_ros_agent micro_ros_agent serial \\
  --dev /dev/ttyACM0 -b 6000000`}</div>

            <h3 className="mt-4 text-lg font-semibold">
              B. Hardware Bridge Node
            </h3>
            <p className="mt-2 text-slate-700 text-sm">
              The bridge node (<code>bridge.py</code>) subscribes to{" "}
              <code>/joint_commands</code> and publishes{" "}
              <code>/servo_feedback</code>:
            </p>
            <div className={codeBlockClass}>{`python3 src/bridge.py`}</div>

            <div className={noteClass}>
              💡 For live demos, create a <code>launch</code> file or use{" "}
              <code>tmux</code>/<code>systemd</code> to start both automatically
              on boot.
            </div>
          </section>

          {/* ── ROSBridge WebSocket ──────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              6. ROSBridge WebSocket Server
            </h2>
            <p className={stepClass}>
              ROSBridge exposes internal ROS 2 topics to the web dashboard via
              WebSockets:
            </p>
            <div className={codeBlockClass}>{`# Install (if not already)
sudo apt install ros-$ROS_DISTRO-rosbridge-suite

# Launch
ros2 launch rosbridge_server rosbridge_websocket_launch.xml`}</div>
            <p className={stepClass}>
              By default this listens on <strong>port 9090</strong>. The web
              dashboard connects to this URL (configurable in the
              dashboard&rsquo;s connection panel):
            </p>
            <div className={codeBlockClass}>{`ws://<SBC_IP>:9090`}</div>
          </section>

          {/* ── Tailscale ────────────────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">
              7. Remote Access with Tailscale
            </h2>
            <p className={stepClass}>
              Tailscale creates a secure WireGuard VPN mesh, allowing you to
              control the robot from anywhere — no port forwarding needed.
            </p>

            <h3 className="mt-4 text-lg font-semibold">Install on SBC</h3>
            <div
              className={codeBlockClass}
            >{`curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up`}</div>

            <h3 className="mt-4 text-lg font-semibold">
              Get the SBC&rsquo;s Tailscale IP
            </h3>
            <div className={codeBlockClass}>{`tailscale ip -4
# Example output: 100.64.0.123`}</div>

            <h3 className="mt-4 text-lg font-semibold">
              Connect from Dashboard
            </h3>
            <p className={stepClass}>
              In the dashboard, set the ROSBridge URL to:
            </p>
            <div className={codeBlockClass}>{`ws://100.64.0.123:9090`}</div>
            <p className="mt-2 text-sm text-slate-600">
              The connection is encrypted via WireGuard, so plain{" "}
              <code>ws://</code> is fully secure at the network layer.
            </p>
          </section>

          {/* ── Architecture Diagram ─────────────────────── */}
          <section className={sectionClass}>
            <h2 className="text-2xl font-semibold">System Architecture</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-700 font-mono whitespace-pre leading-relaxed">
              {`┌────────────────────────┐
│   Web Dashboard        │  ← Browser (any device)
│   Next.js + Three.js   │
│   IK Solver (WASM)     │
└────────┬───────────────┘
         │ WebSocket (ws://100.x.x.x:9090)
         ▼
┌────────────────────────┐
│   ROSBridge Server     │  ← SBC (Raspberry Pi / Jetson)
│   ↕ ROS 2 DDS          │
│   micro-ROS Agent      │
│   ↕ Serial (6 Mbaud)   │
└────────┬───────────────┘
         │ USB
         ▼
┌────────────────────────┐
│   Teensy 4.1           │  ← Firmware (micro-ROS)
│   STS3215 Servos (×6)  │
│   SO-ARM101 Hardware   │
└────────────────────────┘`}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
