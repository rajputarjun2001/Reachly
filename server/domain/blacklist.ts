import { Blacklist, BLACKLIST_TYPES, type BlacklistType } from "../models";
import { extractDomain, normalizeLinkedinUrl } from "../utils/linkedinUrl";
import { badRequest, notFound } from "../utils/errors";
import { escapeRegex } from "../utils/helpers";
import { oid, type AuthContext } from "./context";

export function normalizeBlacklistValue(type: BlacklistType, raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw badRequest("A value is required");
  if (type === "profile_url") {
    const url = normalizeLinkedinUrl(value);
    if (!url) throw badRequest("Enter a LinkedIn profile URL like linkedin.com/in/name");
    return url;
  }
  const domain = extractDomain(value);
  if (!domain || !domain.includes(".")) throw badRequest("Enter a domain like acme.com");
  return domain;
}

export async function addEntry(ctx: AuthContext, input: { type: unknown; value: unknown }) {
  if (!(BLACKLIST_TYPES as readonly unknown[]).includes(input.type)) {
    throw badRequest("type must be 'domain' or 'profile_url'");
  }
  const type = input.type as BlacklistType;
  return Blacklist.create({
    workspaceId: ctx.workspaceId,
    type,
    value: normalizeBlacklistValue(type, input.value),
    addedBy: ctx.userId,
  });
}

export async function listEntries(
  ctx: AuthContext,
  opts: { type?: string; search?: string; page?: number; limit?: number } = {},
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(200, Math.max(1, opts.limit || 50));
  const filter: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  if (opts.type) filter.type = String(opts.type);
  if (opts.search) filter.value = { $regex: escapeRegex(String(opts.search)), $options: "i" };
  const [entries, total] = await Promise.all([
    Blacklist.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Blacklist.countDocuments(filter),
  ]);
  return { entries, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function removeEntry(ctx: AuthContext, id: string) {
  const entry = await Blacklist.findOneAndDelete({ _id: oid(id, "blacklist id"), workspaceId: ctx.workspaceId });
  if (!entry) throw notFound("Blacklist entry not found");
  return { id: String(entry._id) };
}
