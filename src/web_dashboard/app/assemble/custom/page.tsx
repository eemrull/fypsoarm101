"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfigureMotors from "../so-101/components/ConfigureMotors";
import Calibrate from "../so-101/components/Calibrate";
import ToolAttachments from "../so-101/components/ToolAttachments";
import GlassButton from "../../../components/playground/controlButtons/GlassButton";
import { RiMenu2Line } from "@remixicon/react";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";

function CustomAssemblyContent() {
  const router = useRouter();
  const profileName = useRobotProfileStore(
    (state: RobotProfileState) => state.profileName,
  );
  const baseUrdfContent = useRobotProfileStore(
    (state: RobotProfileState) => state.baseUrdfContent,
  );
  const [activeSection, setActiveSection] = useState("configure");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // If someone lands here without having uploaded a URDF, bump them back to the landing page
  useEffect(() => {
    if (!baseUrdfContent) {
      router.push("/assemble");
    }
  }, [baseUrdfContent, router]);

  const sections = useMemo(
    () => [
      { id: "configure", title: "Configure Actuators" },
      { id: "tools", title: "Tool Attachments" },
      { id: "calibrate", title: "Calibrate Limits" },
    ],
    [],
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const hash = window.location.hash.slice(1);
    if (hash && sections.find((s) => s.id === hash)) {
      setActiveSection(hash);
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    }

    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && sections.find((s) => s.id === hash)) {
        setActiveSection(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);

    const observer = new IntersectionObserver(
      (entries) => {
        const intersectingEntry = entries.find((entry) => entry.isIntersecting);
        if (intersectingEntry) {
          const newActiveSection = intersectingEntry.target.id;
          if (activeSection !== newActiveSection) {
            setActiveSection(newActiveSection);
            if (window.location.hash !== `#${newActiveSection}`) {
              history.replaceState(null, "", `#${newActiveSection}`);
            }
          }
        }
      },
      { rootMargin: "-20% 0px -80% 0px", threshold: 0 },
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("hashchange", handleHashChange);
      sections.forEach((section) => {
        const element = document.getElementById(section.id);
        if (element) observer.unobserve(element);
      });
    };
  }, [activeSection, sections]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    window.location.hash = sectionId;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  if (!baseUrdfContent) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex pt-[4.5rem]">
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed bottom-6 left-6 z-50 p-3 bg-zinc-800 rounded-full shadow-lg border border-zinc-700 text-white hover:bg-zinc-700 transition"
      >
        <RiMenu2Line />
      </button>

      {/* Sidebar Nav */}
      <nav
        className={`fixed lg:sticky top-[4.5rem] h-[calc(100vh-4.5rem)] w-64 border-r border-zinc-800 p-6 flex flex-col gap-2 
          bg-zinc-950/95 backdrop-blur-sm transform transition-transform duration-300 z-40
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <h2 className="text-zinc-400 font-semibold mb-4 tracking-wider text-sm uppercase px-2">
          {profileName || "Custom Profile"}
        </h2>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollToSection(section.id)}
            className={`text-left px-4 py-2 rounded-lg transition-colors ${
              activeSection === section.id
                ? "bg-blue-500/10 text-blue-400 font-medium"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
            }`}
          >
            {section.title}
          </button>
        ))}

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 px-2 leading-relaxed">
            URDF Model ingested successfully. Please parameterize its joints and
            save your custom profile map.
          </p>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 lg:p-12 pb-32">
        <header className="mb-12">
          <h1 className="text-4xl font-bold mb-4">{profileName}</h1>
          <p className="text-xl text-zinc-400">Hardware & Actuator Mapping</p>
        </header>

        <div className="space-y-24">
          <section id="configure" className="scroll-mt-24">
            <ConfigureMotors robotName="custom" />
          </section>

          <section id="tools" className="scroll-mt-24">
            <ToolAttachments />
          </section>

          <section id="calibrate" className="scroll-mt-24">
            <Calibrate />
          </section>
        </div>

        <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-zinc-950/80 backdrop-blur-md border-t border-zinc-800 flex justify-end">
          <GlassButton
            onClick={() => router.push(`/play/custom`)}
            tooltip="Jump to Playground with your custom robot profile"
            icon={<div className="font-bold px-6 py-1">Playground →</div>}
          />
        </div>
      </main>

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default function CustomAssembly() {
  return <CustomAssemblyContent />;
}
