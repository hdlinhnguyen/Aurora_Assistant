"use client";

import { useRouter } from "next/navigation";
import FractionLab from "../components/FractionLab";

export default function FractionLabPage() {
  const router = useRouter();
  return <FractionLab onBack={() => router.push("/tutor/hub")} />;
}
