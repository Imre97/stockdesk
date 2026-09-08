import type { LoginInput, RegisterInput, User } from "@stockdesk/shared";
import bcrypt from "bcrypt";
import { AppError } from "../../lib/errors.js";
import * as repository from "./repository.js";
import type { UserRecord } from "./repository.js";
import { createRefreshToken, hashRefreshToken, refreshTokenExpiry, signAccessToken } from "./tokens.js";

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
const TIMING_PLACEHOLDER_HASH = bcrypt.hashSync("stockdesk-timing-placeholder", BCRYPT_COST);

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
}

export function toUserDto(user: UserRecord): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

function emailTaken(): AppError {
  return new AppError(409, "EMAIL_TAKEN", "This email address is already registered.");
}

function invalidCredentials(): AppError {
  return new AppError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
}

function unauthorized(message: string): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

async function issueSession(user: UserRecord): Promise<AuthSession> {
  const refreshToken = createRefreshToken();

  await repository.createRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiry(),
  });

  return { user: toUserDto(user), accessToken: signAccessToken(user.id), refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  if ((await repository.findUserByEmail(input.email)) !== null) throw emailTaken();

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    const user = await repository.createUserWithFundedAccount({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });

    return await issueSession(user);
  } catch (error) {
    if (repository.isDuplicateEmailError(error)) throw emailTaken();
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const user = await repository.findUserByEmail(input.email);
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? TIMING_PLACEHOLDER_HASH);

  if (user === null || !matches) throw invalidCredentials();

  return await issueSession(user);
}

export async function refresh(presentedToken: string): Promise<RefreshedSession> {
  const nextToken = createRefreshToken();
  const result = await repository.rotateRefreshToken(
    hashRefreshToken(presentedToken),
    hashRefreshToken(nextToken),
    refreshTokenExpiry(),
  );

  if (result.status === "reused") {
    throw new AppError(401, "REFRESH_REUSED", "This refresh token was already used. All sessions were revoked.");
  }

  if (result.status === "invalid") throw unauthorized("Refresh token is missing, unknown or expired.");

  return { accessToken: signAccessToken(result.userId), refreshToken: nextToken };
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (presentedToken === undefined) return;

  await repository.revokeRefreshToken(hashRefreshToken(presentedToken));
}

export async function currentUser(userId: string): Promise<User> {
  const user = await repository.findUserById(userId);

  if (user === null) throw unauthorized("Authentication required.");

  return toUserDto(user);
}
