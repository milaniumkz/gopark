import { Body, Controller, Post } from "@nestjs/common";
import type { BakaiWebhookAck } from "@gopark/contracts";
import { BakaiService } from "./bakai.service.js";

@Controller("integrations/bakai")
export class BakaiController {
  constructor(private readonly bakaiService: BakaiService) {}

  @Post("webhooks")
  async handleWebhook(@Body() payload: unknown): Promise<BakaiWebhookAck> {
    return this.bakaiService.handleWebhook(payload);
  }
}
