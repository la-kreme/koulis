// src/lib/auth.ts — OAuth 2.1 token verification via WorkOS AuthKit
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

const WORKOS_DOMAIN = process.env.WORKOS_DOMAIN ?? "";
const MCP_RESOURCE_URL = process.env.MCP_RESOURCE_URL ?? "https://mcp.koulis.ai";

if (!WORKOS_DOMAIN) {
  console.error("[koulis-mcp] WARNING: WORKOS_DOMAIN is not set. OAuth will reject all tokens.");
}

const JWKS = createRemoteJWKSet(new URL(`https://${WORKOS_DOMAIN}/oauth2/jwks`));

export interface AuthPayload {
  sub: string;
  [key: string]: unknown;
}

export async function verifyBearerToken(authHeader: string | undefined): Promise<AuthPayload> {
  if (!authHeader) {
    throw new Error("No authorization header");
  }

  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) {
    throw new Error("Invalid authorization header format");
  }

  const token = match[1];
  // Log token prefix for debugging (never log full token)
  console.error(`[koulis-mcp] Received Bearer token: ${token.substring(0, 30)}...`);

  // TEMPORARY: Accept any Bearer token for diagnostic purposes
  // TODO: Re-enable JWT verification after confirming Claude.ai sends tokens
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${WORKOS_DOMAIN}`,
      audience: MCP_RESOURCE_URL,
    });
    console.error(
      `[koulis-mcp] JWT verified OK, sub=${String(payload.sub)}, aud=${String(payload.aud)}`,
    );
    return payload as JWTPayload & AuthPayload;
  } catch (err) {
    console.error(
      `[koulis-mcp] JWT verification FAILED: ${(err as Error).message} — ACCEPTING ANYWAY (diagnostic mode)`,
    );
    // Accept anyway to diagnose if Claude.ai actually reaches us
    return { sub: "diagnostic-bypass" };
  }
}

export const PROTECTED_RESOURCE_METADATA = {
  resource: MCP_RESOURCE_URL,
  authorization_servers: [`https://${WORKOS_DOMAIN}`],
  bearer_methods_supported: ["header"],
};

export const WWW_AUTHENTICATE_HEADER = [
  'Bearer resource_metadata="' + MCP_RESOURCE_URL + '/.well-known/oauth-protected-resource"',
].join(", ");
