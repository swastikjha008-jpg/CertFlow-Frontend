import type { Metadata } from "next";
import { StudioClient } from "@/components/studio/studio-client";

export const metadata: Metadata = { title: "Workspace — CertFlow" };

export default function StudioPage() {
  return (
    <main>
      <StudioClient />
    </main>
  );
}
