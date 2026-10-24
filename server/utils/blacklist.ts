import type { Types } from "mongoose";
import { Blacklist } from "../models";
import { domainMatches, extractDomain, normalizeLinkedinUrl } from "./linkedinUrl";

export type LoadedBlacklist = { profileUrls: Set<string>; domains: string[] };
type BlacklistableLead = {
  linkedinUrl?: string | null;
  email?: string | null;
  companyDomain?: string | null;
};
export type BlacklistResult = { blacklisted: boolean; reason?: string };

export async function loadBlacklist(workspaceId: Types.ObjectId | string): Promise<LoadedBlacklist> {
  const entries = await Blacklist.find({ workspaceId }).lean();
  const profileUrls = new Set<string>();
  const domains: string[] = [];
  for (const e of entries) {
    if (e.type === "profile_url") profileUrls.add(normalizeLinkedinUrl(e.value) || e.value);
    else domains.push(e.value.replace(/^www\./, ""));
  }
  return { profileUrls, domains };
}

/** Domains are matched against the profile URL host, the lead's email domain and company domain. */
export function isBlacklisted(lead: BlacklistableLead, { profileUrls, domains }: LoadedBlacklist): BlacklistResult {
  const url = normalizeLinkedinUrl(lead.linkedinUrl) || lead.linkedinUrl || "";
  if (profileUrls.has(url)) return { blacklisted: true, reason: "profile_url" };

  const candidates = [
    extractDomain(lead.linkedinUrl),
    extractDomain(lead.email),
    extractDomain(lead.companyDomain),
  ].filter((c): c is string => Boolean(c));
  const hit = domains.find((d) => candidates.some((c) => domainMatches(c, d)));
  if (hit) return { blacklisted: true, reason: `domain:${hit}` };
  return { blacklisted: false };
}

export async function checkLeadBlacklisted(
  lead: BlacklistableLead,
  workspaceId: Types.ObjectId | string,
): Promise<BlacklistResult> {
  return isBlacklisted(lead, await loadBlacklist(workspaceId));
}
