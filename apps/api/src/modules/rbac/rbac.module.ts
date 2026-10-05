import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RequestUserGuard } from "./request-user.guard.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: RequestUserGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class RbacModule {}
