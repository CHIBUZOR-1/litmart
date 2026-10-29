import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export const Roles = (...roles: Role[]) =>
  SetMetadata(ROLES_KEY, roles);
