import { Module } from "@nestjs/common";
import { MobileAccessService } from "./mobile-access.service.js";
import { DriverMobileReadService } from "./driver-mobile-read.service.js";

@Module({
  providers: [DriverMobileReadService, MobileAccessService],
  exports: [DriverMobileReadService, MobileAccessService],
})
export class MobileReadModule {}
