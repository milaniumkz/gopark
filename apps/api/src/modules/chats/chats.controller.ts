import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type {
  ChatThreadDetail,
  ChatThreadItem,
  CreateChatThreadRequest,
  SendChatMessageRequest,
} from "@gopark/contracts";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { Roles } from "../rbac/roles.decorator.js";
import { ChatsService } from "./chats.service.js";

@Controller("chats")
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor", "driver")
  list(@CurrentUser() currentUser: RequestUser | null): Promise<ChatThreadItem[]> {
    return this.chatsService.list(currentUser);
  }

  @Get(":threadId")
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor", "driver")
  get(
    @Param("threadId") threadId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ChatThreadDetail> {
    return this.chatsService.get(threadId, currentUser);
  }

  @Post()
  @Roles("owner", "admin", "finance", "manager", "operator", "driver")
  create(
    @Body() body: CreateChatThreadRequest,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ChatThreadDetail> {
    return this.chatsService.create(body, currentUser);
  }

  @Post(":threadId/messages")
  @Roles("owner", "admin", "finance", "manager", "operator", "driver")
  sendMessage(
    @Param("threadId") threadId: string,
    @Body() body: SendChatMessageRequest,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ChatThreadDetail> {
    return this.chatsService.sendMessage(threadId, body, currentUser);
  }
}
