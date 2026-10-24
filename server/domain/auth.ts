import crypto from "crypto";
import bcrypt from "bcryptjs";
import { User, Workspace, type UserDoc, type WorkspaceDoc } from "../models";
import { badRequest, conflict, notFound, unauthorized } from "../utils/errors";
import { isValidTimezone } from "../utils/schedule";
import { signSession, type SessionClaims } from "../auth/token";
import { oid, requireOwner, type AuthContext } from "./context";

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const normalizeEmail = (email: unknown) => String(email ?? "").toLowerCase().trim();
const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

function validateCredentials(email: unknown, password: unknown) {
  if (!email || !EMAIL_RE.test(String(email).trim())) throw badRequest("A valid email is required");
  if (!password || String(password).length < 8) throw badRequest("Password must be at least 8 characters");
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace"
  );
}

export function claimsFor(user: Pick<UserDoc, "_id" | "workspaceId" | "role">): SessionClaims {
  return {
    userId: String(user._id),
    workspaceId: user.workspaceId ? String(user.workspaceId) : null,
    role: user.role === "owner" ? "owner" : "member",
  };
}

export async function issueToken(user: Pick<UserDoc, "_id" | "workspaceId" | "role">) {
  return signSession(claimsFor(user));
}

/** Creates a user without a workspace; the workspace is created in a second step. */
export async function registerUser(input: { email: unknown; password: unknown; fullName?: unknown }): Promise<UserDoc> {
  validateCredentials(input.email, input.password);
  const email = normalizeEmail(input.email);
  if (await User.exists({ email })) throw conflict("An account with this email already exists");
  const passwordHash = await bcrypt.hash(String(input.password), SALT_ROUNDS);
  return User.create({
    email,
    passwordHash,
    fullName: input.fullName ? String(input.fullName).trim() : "",
    role: "owner",
    workspaceId: null,
  });
}

export async function createWorkspaceForUser(
  userId: string,
  input: { name: unknown },
): Promise<{ user: UserDoc; workspace: WorkspaceDoc }> {
  const name = String(input.name ?? "").trim();
  if (!name) throw badRequest("Workspace name is required");
  if (name.length > 120) throw badRequest("Workspace name must be 120 characters or fewer");
  const user = await User.findById(oid(userId, "user id"));
  if (!user) throw notFound("User not found");
  if (user.workspaceId) {
    const existing = await Workspace.findById(user.workspaceId);
    if (existing) return { user, workspace: existing };
  }
  const workspace = await Workspace.create({ name, slug: slugify(name), ownerId: user._id });
  user.workspaceId = workspace._id;
  user.role = "owner";
  await user.save();
  return { user, workspace };
}

/** REST convenience: account + workspace in one call. */
export async function registerWithWorkspace(input: {
  email: unknown;
  password: unknown;
  fullName?: unknown;
  workspaceName: unknown;
}) {
  if (!input.workspaceName || !String(input.workspaceName).trim()) throw badRequest("workspaceName is required");
  const user = await registerUser(input);
  try {
    return await createWorkspaceForUser(String(user._id), { name: input.workspaceName });
  } catch (err) {
    await user.deleteOne();
    throw err;
  }
}

export async function authenticate(emailInput: unknown, password: unknown): Promise<UserDoc> {
  if (!emailInput || !password) throw badRequest("Email and password are required");
  const user = await User.findOne({ email: normalizeEmail(emailInput) }).select("+passwordHash");
  const valid =
    user && user.status === "active" && user.passwordHash && (await bcrypt.compare(String(password), user.passwordHash));
  if (!valid || !user) throw unauthorized("Invalid email or password");
  user.lastActiveAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastActiveAt: user.lastActiveAt } });
  return user;
}

export async function getMe(userId: string) {
  const user = await User.findById(oid(userId, "user id"));
  if (!user) throw notFound("User not found");
  const workspace = user.workspaceId ? await Workspace.findById(user.workspaceId) : null;
  return { user, workspace };
}

export async function acceptInvite(input: { token: unknown; password: unknown; fullName?: unknown }) {
  if (!input.token) throw badRequest("Invite token is required");
  if (!input.password || String(input.password).length < 8) throw badRequest("Password must be at least 8 characters");

  const user = await User.findOne({ inviteToken: hashToken(String(input.token)), status: "pending" });
  if (!user) throw notFound("Invite not found or already accepted");
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) throw badRequest("This invite has expired");

  user.passwordHash = await bcrypt.hash(String(input.password), SALT_ROUNDS);
  user.status = "active";
  user.inviteToken = undefined;
  user.inviteExpiresAt = undefined;
  if (input.fullName) user.fullName = String(input.fullName).trim();
  await user.save();
  const workspace = await Workspace.findById(user.workspaceId);
  return { user, workspace };
}

/** Returns the raw invite token once; only its hash is stored. */
export async function inviteMember(ctx: AuthContext, input: { email: unknown; fullName?: unknown }) {
  requireOwner(ctx, "Only the workspace owner can invite members");
  if (!input.email || !EMAIL_RE.test(String(input.email).trim())) throw badRequest("A valid email is required");
  const email = normalizeEmail(input.email);
  if (await User.exists({ email })) throw conflict("A user with this email already exists");

  const rawToken = crypto.randomBytes(32).toString("hex");
  const user = await User.create({
    email,
    fullName: input.fullName ? String(input.fullName).trim() : "",
    workspaceId: ctx.workspaceId,
    role: "member",
    status: "pending",
    inviteToken: hashToken(rawToken),
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return { user, inviteToken: rawToken };
}

export async function listMembers(ctx: AuthContext) {
  return User.find({ workspaceId: ctx.workspaceId }).sort({ createdAt: 1 });
}

export async function removeMember(ctx: AuthContext, userId: string) {
  requireOwner(ctx, "Only the workspace owner can remove members");
  const id = oid(userId, "userId");
  if (String(id) === ctx.userId) throw badRequest("You cannot remove yourself");
  const member = await User.findOne({ _id: id, workspaceId: ctx.workspaceId });
  if (!member) throw notFound("Member not found");
  if (member.role === "owner") throw badRequest("The workspace owner cannot be removed");
  await member.deleteOne();
  return { userId: String(id) };
}

export async function updateProfile(ctx: Pick<AuthContext, "userId">, input: { fullName?: unknown; timezone?: unknown }) {
  const user = await User.findById(oid(ctx.userId, "user id"));
  if (!user) throw notFound("User not found");
  if (input.fullName !== undefined) {
    const fullName = String(input.fullName).trim();
    if (fullName.length > 120) throw badRequest("Name must be 120 characters or fewer");
    user.fullName = fullName;
  }
  if (input.timezone !== undefined) {
    if (!isValidTimezone(String(input.timezone))) throw badRequest("timezone must be a valid IANA timezone");
    user.timezone = String(input.timezone);
  }
  await user.save();
  return user;
}

export async function changePassword(
  ctx: Pick<AuthContext, "userId">,
  input: { oldPassword: unknown; newPassword: unknown },
) {
  if (!input.oldPassword || !input.newPassword) throw badRequest("Current and new password are required");
  if (String(input.newPassword).length < 8) throw badRequest("New password must be at least 8 characters");
  const user = await User.findById(oid(ctx.userId, "user id")).select("+passwordHash");
  if (!user) throw notFound("User not found");
  if (!(await bcrypt.compare(String(input.oldPassword), user.passwordHash || ""))) {
    throw unauthorized("Current password is incorrect");
  }
  user.passwordHash = await bcrypt.hash(String(input.newPassword), SALT_ROUNDS);
  await user.save();
}
