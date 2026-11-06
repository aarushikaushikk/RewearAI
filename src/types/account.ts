// Allowed sign-in providers for linked accounts. Client-safe: no server imports.

export const AUTH_PROVIDERS = ["google"] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];
