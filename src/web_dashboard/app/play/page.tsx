import { redirect } from "next/navigation";

/**
 * /play has no standalone page — it's only used as /play/[slug].
 * Redirect to home when users navigate to /play directly.
 */
export default function PlayIndexPage() {
  redirect("/");
}
