export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    // Protect everything except login, change-password, public schedule, API, static files
    "/((?!login|forgot-password|reset-password|change-password|schedule/|api/v1/|api/cron/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
