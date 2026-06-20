"use client";

import type { BrokerIdentity, BrokerTheme } from "@mind-studio/core/solid";
import { solid } from "./client";

/**
 * Thin re-exports over the shared {@link solid} client's broker (see
 * `client.ts`). The Mind shell capability bridge — handshake, brokered fetch
 * tunnel, theme sync, ready signal — plus the brokered-first identity now live
 * in `@mind-studio/core/solid`; these shims keep the app's existing import
 * paths stable.
 */
export type { BrokerIdentity, BrokerTheme };

export function isBrokered(): boolean {
  return solid.broker.isBrokered();
}

export function brokeredIdentity(): BrokerIdentity | null {
  return solid.broker.brokeredIdentity();
}

export function currentBrokeredTheme(): BrokerTheme | null {
  return solid.broker.currentBrokeredTheme();
}

export function subscribeBrokeredTheme(fn: () => void): () => void {
  return solid.broker.subscribeBrokeredTheme(fn);
}

export const brokerFetch: typeof fetch = solid.broker.brokerFetch;

export function initBroker(): Promise<BrokerIdentity | null> {
  return solid.broker.initBroker();
}

export function signalReady(): void {
  solid.broker.signalReady();
}

/**
 * The active identity, brokered-first. Inside the shell this is the shell's
 * webId + workspace pod root; standalone it's the local OIDC session. `null`
 * means signed-out (and not brokered).
 */
export function currentIdentity(): { webId: string; podRoot: string } | null {
  return solid.currentIdentity();
}
