import type { FastifyRequest } from 'fastify';
import type { Role } from '@vq/shared';
import { ROLES } from '@vq/shared';
import type { Deps } from './deps.js';
import { ApiError } from './errors.js';

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  tenantId: string | null;
  role: Role | null;
}

/** Tenant member with a role (claims set by the platform). */
export interface Member extends AuthUser {
  tenantId: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export async function authenticate(deps: Deps, req: FastifyRequest): Promise<AuthUser> {
  const header = req.headers.authorization ?? '';
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) throw new ApiError('UNAUTHENTICATED', 'Missing bearer token');
  let decoded;
  try {
    // checkRevoked=true also rejects disabled accounts and revoked sessions immediately.
    decoded = await deps.auth.verifyIdToken(m[1]!, true);
  } catch {
    throw new ApiError('UNAUTHENTICATED', 'Invalid or expired token');
  }
  const role = typeof decoded.role === 'string' && (ROLES as readonly string[]).includes(decoded.role) ? (decoded.role as Role) : null;
  return {
    uid: decoded.uid,
    email: decoded.email ?? '',
    name: (decoded.name as string | undefined) ?? decoded.email ?? decoded.uid,
    tenantId: typeof decoded.tenantId === 'string' ? decoded.tenantId : null,
    role,
  };
}

export function requireMember(user: AuthUser | undefined, roles?: Role[]): Member {
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Not signed in');
  if (!user.role) throw new ApiError('NOT_PROVISIONED', 'Account is not assigned to a school yet');
  if (user.role !== 'platform_admin' && !user.tenantId) throw new ApiError('NOT_PROVISIONED', 'Account has no school');
  if (roles && !roles.includes(user.role)) throw new ApiError('FORBIDDEN', `Requires role: ${roles.join(' or ')}`);
  return user as Member;
}

/** School members only (platform admins do not get learning data by default). */
export function requireTenantMember(user: AuthUser | undefined, roles?: Role[]): Member {
  const m = requireMember(user, roles);
  if (m.role === 'platform_admin' || !m.tenantId) throw new ApiError('FORBIDDEN', 'Requires a school account');
  return m;
}
