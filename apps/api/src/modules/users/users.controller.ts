import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import type { UserAdminListItem } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { UsersService } from "./users.service.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import type { CreateAdminUserDto } from "./dto/create-admin-user.dto.js";
import type { UpdateAdminUserDto } from "./dto/update-admin-user.dto.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles("owner", "admin", "auditor")
  async list(@CurrentUser() currentUser: RequestUser | null): Promise<UserAdminListItem[]> {
    if (currentUser?.companyName) {
      return this.usersService.listAdminByCompany(currentUser.companyName);
    }

    return this.usersService.listAdmin();
  }

  @Post()
  @Roles("owner", "admin")
  async create(
    @Body() body: CreateAdminUserDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<UserAdminListItem> {
    return this.usersService.createAdmin({
      ...body,
      companyName: currentUser?.companyName ?? body.companyName ?? null,
    }, currentUser);
  }

  @Patch(":userId")
  @Roles("owner", "admin")
  async update(
    @Param("userId") userId: string,
    @Body() body: UpdateAdminUserDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<UserAdminListItem> {
    if (currentUser?.companyName) {
      const users = await this.usersService.listAdminByCompany(currentUser.companyName);
      if (!users.some((item) => item.id === userId)) {
        throw new NotFoundException("Пользователь не найден в компании.");
      }
    }

    return this.usersService.updateAdmin(userId, {
      ...body,
      companyName: currentUser?.companyName ?? body.companyName ?? null,
    }, currentUser);
  }
}
