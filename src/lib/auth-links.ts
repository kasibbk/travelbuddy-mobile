export function getAuthRedirectUrl(path: "/activate" | "/reset-password"): string | undefined {
  const baseUrl = process.env.EXPO_PUBLIC_AUTH_WEB_URL?.trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}${path}` : undefined;
}
