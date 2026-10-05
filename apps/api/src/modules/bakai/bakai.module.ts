import { Module } from "@nestjs/common";
import { BakaiController } from "./bakai.controller.js";
import { BakaiService } from "./bakai.service.js";

@Module({
  controllers: [BakaiController],
  providers: [BakaiService],
})
export class BakaiModule {}
