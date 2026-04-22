"use client";

import { useParams } from "next/navigation";
import ApplicationDetailPage from "@/components/dashboard/ApplicationDetailPage";

export default function ApplicationDetail() {
  const params = useParams<{ id: string }>();
  return <ApplicationDetailPage id={Number(params.id)} />;
}
