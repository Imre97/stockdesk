import type { LoginInput, RegisterInput, User } from "@stockdesk/shared";
import bcrypt from "bcrypt";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import { afterCashChange, type AccountsDependencies } from "../accounts/snapshot-writer.js";
import * as repository from "./repository.js";
import type { UserRecord } from "./repository.js";
import { createRefreshToken, hashRefreshToken, refreshTokenExpiry, signAccessToken } from "./tokens.js";

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

let timingPlaceholderHash: string | undefined;

function placeholderHash(): string {
  timingPlaceholderHash ??= bcrypt.hashSync("stockdesk-timing-placeholder", BCRYPT_COST);
  return timingPlaceholderHash;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
}

export interface AuthService {
  register: (input: RegisterInput) => Promise<AuthSession>;
  login: (input: LoginInput) => Promise<AuthSession>;
  refresh: (presentedToken: string) => Promise<RefreshedSession>;
  logout: (presentedToken: string | undefined) => Promise<void>;
  currentUser: (userId: string) => Promise<User>;
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

export function createAuthService(
  config: AppConfig,
  dependencies: AccountsDependencies = {},
): AuthService {
  async function issueSession(user: UserRecord): Promise<AuthSession> {
    const refreshToken = createRefreshToken();

    await repository.createRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(config),
    });

    return { user: toUserDto(user), accessToken: signAccessToken(config, user.id), refreshToken };
  }

  return {
    async register(input: RegisterInput): Promise<AuthSession> {
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

      try {
        const user = await repository.createUserWithFundedAccount({
          email: input.email,
          passwordHash,
          displayName: input.displayName,
        });

        await afterCashChange(user.id, dependencies);

        return await issueSession(user);
      } catch (error) {
        if (repository.isDuplicateEmailError(error)) throw emailTaken();
        throw error;
      }
    },

    async login(input: LoginInput): Promise<AuthSession> {
      const user = await repository.findUserByEmail(input.email);
      const matches = await bcrypt.compare(input.password, user?.passwordHash ?? placeholderHash());

      if (user === null || !matches) throw invalidCredentials();

      return await issueSession(user);
    },

    async refresh(presentedToken: string): Promise<RefreshedSession> {
      const nextToken = createRefreshToken();
      const result = await repository.rotateRefreshToken(
        hashRefreshToken(presentedToken),
        hashRefreshToken(nextToken),
        refreshTokenExpiry(config),
      );

      if (result.status === "reused") {
        throw new AppError(401, "REFRESH_REUSED", "This refresh token was already used. All sessions were revoked.");
      }

      if (result.status === "invalid") throw unauthorized("Refresh token is missing, unknown or expired.");

      return { accessToken: signAccessToken(config, result.userId), refreshToken: nextToken };
    },

    async logout(presentedToken: string | undefined): Promise<void> {
      if (presentedToken === undefined) return;

      await repository.deleteRefreshToken(hashRefreshToken(presentedToken));
    },

    async currentUser(userId: string): Promise<User> {
      const user = await repository.findUserById(userId);

      if (user === null) throw unauthorized("Authentication required.");

      return toUserDto(user);
    },
  };
}
