import type { User } from "@stockdesk/shared";

const MAX_INITIALS = 2;

export interface UserViewModel {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  createdAt: Date;
}

function toInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, MAX_INITIALS)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function toUserViewModel(user: User): UserViewModel {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    initials: toInitials(user.displayName),
    createdAt: new Date(user.createdAt),
  };
}
