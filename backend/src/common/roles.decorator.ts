import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

// 角色元数据只用于路由守卫，不参与业务参数入库。
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
