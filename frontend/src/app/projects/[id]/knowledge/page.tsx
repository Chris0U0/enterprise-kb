"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { withProjectQuery } from "@/lib/project-links";

export default function ProjectKnowledgePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  useEffect(() => {
    router.replace(withProjectQuery("/knowledge", id));
  }, [id, router]);

  return null;
}
