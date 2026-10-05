import { Module } from "@nestjs/common";
import { YandexController } from "./yandex.controller.js";

@Module({
  controllers: [YandexController],
})
export class YandexModule {}

