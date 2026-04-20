"use client";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";

export function PlaidLinkButton() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/plaid/link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setToken(d.linkToken))
      .catch(() => setToken(null));
  }, []);

  const onSuccess = useCallback(async (publicToken: string) => {
    setBusy(true);
    try {
      await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken }),
      });
      location.reload();
    } finally {
      setBusy(false);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
  });

  return (
    <Button
      onClick={() => open()}
      disabled={!token || !ready || busy}
      variant="outline"
    >
      {busy ? "Linking…" : "Link a bank"}
    </Button>
  );
}
