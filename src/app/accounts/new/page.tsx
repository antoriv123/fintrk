"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AccountWizard } from "@/components/accounts/account-wizard";

export default function NewAccountPage() {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setUserName(data.user?.name ?? null))
      .catch(() => {});
  }, []);

  return <AccountWizard userName={userName} />;
}
