"use client";

import { StarField } from "@/components/star-field";
import { robotConfigMap } from "@/config/robotConfig";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";

import Link from "next/link";
import Image from "next/image";

export default function Home() {
  const customThumbnail = useRobotProfileStore(
    (state: RobotProfileState) => state.thumbnailUrl,
  );

  const robots = [
    {
      name: "so-arm101",
      image: robotConfigMap["so-arm101"].image ?? "/placeholder.png",
      playLink: `/play/so-arm101`,
      assembleLink: `/assemble/so-101`,
    },
    {
      name: "Custom URDF",
      image: customThumbnail || "/placeholder.png",
      playLink: `/play/custom`,
      assembleLink: `/assemble`,
    },
  ];

  return (
    <main className="relative">
      <div className="mt-32 mb-4 container mx-auto p-4 flex justify-center items-center relative z-10">
        <div className="text-center w-full">
          <h1 className="text-6xl mb-4 font-bold">SO-ARM101</h1>
          <p className="text-2xl mb-8 text-white/70 font-light">
            Modular Robot Dashboard -{" "}
            <span className="text-indigo-400 font-medium">
              Teensy 4.1 + ROS2
            </span>
          </p>
          <div className="container mx-auto p-4 flex flex-wrap justify-center gap-8 relative z-10">
            {robots.map((robot) => (
              <div
                key={robot.name}
                className="rounded-3xl shadow-2xl bg-zinc-900 border border-white/10 overflow-hidden w-[90%] sm:w-[40%] lg:w-[22%] transition-all duration-300 hover:-translate-y-2 hover:bg-zinc-800 hover:shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)] flex flex-col"
              >
                <div className="relative z-10 p-3 pb-0">
                  <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-zinc-950">
                    <Image
                      src={robot.image}
                      alt={robot.name}
                      width={640}
                      height={480}
                      unoptimized={robot.image.startsWith("data:")}
                      className="w-full h-72 object-cover transition-transform duration-500 hover:scale-[1.05]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 pointer-events-none"></div>
                  </div>
                </div>
                <h2 className="text-2xl font-bold -mt-12 ml-6 mb-8 text-left text-white relative z-20 drop-shadow-lg tracking-wide">
                  {robot.name}
                </h2>
                <div className="flex p-0 border-t border-white/10 mt-auto bg-black/20">
                  <Link
                    href={robot.playLink}
                    className="flex-1 text-zinc-300 py-4 text-center hover:text-white hover:bg-white/10 border-r border-white/10 transition-all font-medium tracking-wide text-sm"
                  >
                    Play
                  </Link>
                  <Link
                    href={robot.assembleLink}
                    className="flex-1 text-zinc-300 py-4 text-center hover:text-white hover:bg-white/10 transition-all font-medium tracking-wide text-sm"
                  >
                    Assemble
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="container mx-auto p-4 text-center relative z-10">
        <div className="flex justify-center items-center gap-4 flex-wrap">
          <p className="text-lg text-indigo-500 font-medium mb-4">
            FYP - SO-ARM101 Robot Arm
          </p>
          <Link
            href="/docs"
            className="mb-4 rounded-md border border-white/20 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10 transition"
          >
            Docs
          </Link>
          <Link
            href="/methodology"
            className="mb-4 rounded-md border border-white/20 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10 transition"
          >
            IK Methodology
          </Link>
        </div>
        <p className="text-sm text-zinc-500 mt-2 font-light tracking-wide">
          ROS2 + micro-ROS + Teensy 4.1
        </p>
      </footer>
      <div className="absolute inset-0 -z-10" style={{ overflow: "hidden" }}>
        <StarField />
      </div>
    </main>
  );
}
