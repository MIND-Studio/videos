"use client";

import { useMindTheme } from "@mind-studio/ui";
import { useEffect } from "react";
import { currentBrokeredTheme, subscribeBrokeredTheme } from "@/lib/solid/broker";

/**
 * When Video runs inside the Mind shell, the shell hands its color mode over the
 * capability bridge (`mind:welcome { theme }`). This applies that theme to
 * Video's own ThemeProvider so the embedded chrome matches the shell. Standalone
 * it's a no-op (no theme is ever brokered). Renders nothing.
 */
export function BrokerThemeSync() {
  const { setMode } = useMindTheme();

  useEffect(() => {
    const apply = () => {
      const t = currentBrokeredTheme();
      if (t) setMode(t);
    };
    apply();
    return subscribeBrokeredTheme(apply);
  }, [setMode]);

  return null;
}
