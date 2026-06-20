"use client";

import { useEffect, useState } from "react";
import { initBroker, isBrokered } from "@/lib/solid/broker";

/**
 * Renders its children only when Video runs **standalone**. Inside the Mind shell
 * (brokered mode) it renders nothing — the shell already provides the chrome
 * (app title, navigation, app launcher, theme), so Video's own masthead would be
 * redundant inside the shell's app body.
 */
export function StandaloneOnly({ children }: { children: React.ReactNode }) {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    if (isBrokered()) {
      setEmbedded(true);
      return;
    }
    let alive = true;
    initBroker().then((id) => {
      if (alive && id) setEmbedded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (embedded) return null;
  return <>{children}</>;
}
