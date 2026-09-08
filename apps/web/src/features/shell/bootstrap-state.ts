let bootstrappedUserId: string | null = null;

export function getBootstrappedUserId(): string | null {
  return bootstrappedUserId;
}

export function setBootstrappedUserId(userId: string | null): void {
  bootstrappedUserId = userId;
}

export function clearBootstrappedUserId(): void {
  bootstrappedUserId = null;
}
