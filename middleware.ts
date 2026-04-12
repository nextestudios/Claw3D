import { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "claw3d-access";
const ACCESS_TOKEN_PARAM = "access_token";

/**
 * Middleware that protects hosted Claw3D workspaces with a token-based
 * access gate. When CLAW3D_ACCESS_TOKEN is set (managed deployments),
 * every request must carry a valid cookie. If the cookie is missing,
 * the middleware checks for a query-string token and sets the cookie
 * on match; otherwise it returns a 403 page.
 *
 * When CLAW3D_ACCESS_TOKEN is not set (local / self-hosted), the
 * middleware is a no-op.
 */
export function middleware(request: NextRequest) {
  const expectedToken = process.env.CLAW3D_ACCESS_TOKEN;

  // Self-hosted mode: no gate.
  if (!expectedToken) {
    return NextResponse.next();
  }

  // Allow health checks and API routes used by the control plane.
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/managed") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check cookie first.
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (cookieToken === expectedToken) {
    return NextResponse.next();
  }

  // Accept token from query string and set a session cookie.
  const queryToken = request.nextUrl.searchParams.get(ACCESS_TOKEN_PARAM);
  if (queryToken === expectedToken) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete(ACCESS_TOKEN_PARAM);
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(ACCESS_TOKEN_COOKIE, expectedToken, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  // No valid credential -- block access.
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Access required</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}
.box{text-align:center;max-width:420px;padding:2rem}.box h1{font-size:1.5rem;margin-bottom:.5rem}.box p{color:#999;font-size:.875rem}</style>
</head>
<body><div class="box"><h1>Access required</h1><p>Open this workspace from your Claw3D dashboard to authenticate.</p></div></body>
</html>`,
    {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
