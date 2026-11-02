import type { Page } from "playwright";
import type { Mitigation } from "@/lib/schema";
import { getBlocker, APPLIED_FILTER_LISTS, isFilterEngineActive } from "./engine";
import { setupAutoconsent, waitForAutoconsent, type AutoconsentTracker } from "./consent";

export * from "./engine";
export * from "./consent";

export async function preparePageForMitigation(page: Page): Promise<{ tracker: AutoconsentTracker }> {
  const blocker = await getBlocker();
  await blocker.enableBlockingInPage(page);
  const tracker = await setupAutoconsent(page);
  return { tracker };
}

export async function collectMitigations(
  page: Page,
  tracker: AutoconsentTracker,
): Promise<Mitigation[]> {
  const mitigations: Mitigation[] = [];
  if (await isFilterEngineActive()) {
    mitigations.push({ kind: "filterLists", lists: APPLIED_FILTER_LISTS });
  }
  const consentMitigation = await waitForAutoconsent(page, tracker);
  if (consentMitigation) {
    mitigations.push(consentMitigation);
  }
  return mitigations;
}
