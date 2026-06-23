import { notFound } from "next/navigation";
import RobotLoader from "@/components/playground/RobotLoader";
import { robotConfigMap } from "@/config/robotConfig";

export function generateStaticParams() {
  return Object.keys(robotConfigMap).map((slug) => ({
    slug,
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const isCustomRoute = slug === "custom";

  if (!isCustomRoute && !robotConfigMap[slug]) {
    notFound();
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <RobotLoader robotName={isCustomRoute ? "custom" : slug} />
    </main>
  );
}
