import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ChatMessageItem,
  ChatThreadDetail,
  ChatThreadItem,
  CreateChatThreadRequest,
  SendChatMessageRequest,
  UserRole,
} from "@gopark/contracts";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";
import type { RequestUser } from "../rbac/request-user.js";
import { makeUserRepository } from "../../common/application/repository.factory.js";
import type { UserRepository } from "../../common/repositories/index.js";

type ChatThreadRecord = {
  id: string;
  driverId: string | null;
  managerId: string | null;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  driver?: { id: string; firstName: string; lastName: string; companyName?: string | null } | null;
  manager?: { id: string; user?: { firstName: string; lastName: string } | null } | null;
  messages?: ChatMessageRecord[];
};

type ChatMessageRecord = {
  id: string;
  threadId: string;
  senderUserId: string | null;
  senderRole: UserRole;
  senderName: string;
  body: string;
  createdAt: Date;
};

@Injectable()
export class ChatsService {
  private readonly memoryThreads = new Map<string, ChatThreadRecord>();
  private readonly memoryMessages: ChatMessageRecord[] = [];
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsCreateService: NotificationsCreateService,
  ) {}

  async list(currentUser: RequestUser | null): Promise<ChatThreadItem[]> {
    const prisma = this.prisma.client;
    if (!prisma) {
      const scoped = await this.filterAccessibleThreads([...this.memoryThreads.values()], currentUser);
      return scoped
        .map((thread) => this.toThreadItem(thread, this.getMemoryMessages(thread.id)))
        .sort((left, right) => (right.lastMessageAt ?? right.createdAt).localeCompare(left.lastMessageAt ?? left.createdAt));
    }

    const where = await this.buildThreadWhere(currentUser);
    const threads = await prisma.chatThread.findMany({
      where,
      include: this.threadInclude(1),
      orderBy: { updatedAt: "desc" },
    });

    return threads.map((thread: ChatThreadRecord) => this.toThreadItem(thread, thread.messages ?? []));
  }

  async get(threadId: string, currentUser: RequestUser | null): Promise<ChatThreadDetail> {
    const thread = await this.getAccessibleThread(threadId, currentUser, true);
    return this.toThreadDetail(thread, thread.messages ?? []);
  }

  async create(body: CreateChatThreadRequest, currentUser: RequestUser | null): Promise<ChatThreadDetail> {
    this.assertAuthenticated(currentUser);
    const text = body.body?.trim();
    if (!text) {
      throw new BadRequestException("Message body is required");
    }

    const scope = await this.resolveCreateScope(body, currentUser);
    const subject = body.subject?.trim() || "Чат";
    const sender = await this.resolveSender(currentUser);
    const prisma = this.prisma.client;

    if (!prisma) {
      const existing = [...this.memoryThreads.values()].find(
        (thread) => thread.driverId === scope.driverId && thread.managerId === scope.managerId && thread.status !== "closed",
      );
      if (existing) {
        const message = this.makeMemoryMessage(existing.id, text, sender);
        this.memoryMessages.push(message);
        existing.updatedAt = message.createdAt;
        await this.createChatNotification(existing, currentUser).catch(() => undefined);
        return this.toThreadDetail(existing, this.getMemoryMessages(existing.id));
      }

      const now = new Date();
      const thread: ChatThreadRecord = {
        id: randomUUID(),
        driverId: scope.driverId,
        managerId: scope.managerId,
        subject,
        status: "open",
        createdAt: now,
        updatedAt: now,
      };
      const message = this.makeMemoryMessage(thread.id, text, sender);
      this.memoryThreads.set(thread.id, thread);
      this.memoryMessages.push(message);
      await this.createChatNotification(thread, currentUser).catch(() => undefined);
      return this.toThreadDetail(thread, [message]);
    }

    const existing = await prisma.chatThread.findFirst({
      where: {
        driverId: scope.driverId,
        managerId: scope.managerId,
        status: { not: "closed" },
      },
      include: this.threadInclude(),
    });
    if (existing) {
      await prisma.chatMessage.create({
        data: {
          threadId: existing.id,
          senderUserId: currentUser.id,
          senderRole: currentUser.role,
          senderName: sender.senderName,
          body: text,
        },
      });
      await prisma.chatThread.update({
        where: { id: existing.id },
        data: {
          subject,
          updatedAt: new Date(),
        },
      });
      await this.createChatNotification(existing, currentUser).catch(() => undefined);
      return this.get(existing.id, currentUser);
    }

    const created = await prisma.chatThread.create({
      data: {
        driverId: scope.driverId,
        managerId: scope.managerId,
        subject,
        status: "open",
        messages: {
          create: {
            senderUserId: currentUser.id,
            senderRole: currentUser.role,
            senderName: sender.senderName,
            body: text,
          },
        },
      },
      include: this.threadInclude(),
    });

    await this.createChatNotification(created, currentUser).catch(() => undefined);
    return this.toThreadDetail(created, created.messages ?? []);
  }

  async sendMessage(
    threadId: string,
    body: SendChatMessageRequest,
    currentUser: RequestUser | null,
  ): Promise<ChatThreadDetail> {
    this.assertAuthenticated(currentUser);
    const text = body.body?.trim();
    if (!text) {
      throw new BadRequestException("Message body is required");
    }

    const thread = await this.getAccessibleThread(threadId, currentUser, false);
    const sender = await this.resolveSender(currentUser);
    const prisma = this.prisma.client;

    if (!prisma) {
      const message = this.makeMemoryMessage(threadId, text, sender);
      this.memoryMessages.push(message);
      const memoryThread = this.memoryThreads.get(threadId);
      if (memoryThread) {
        memoryThread.updatedAt = message.createdAt;
      }
      await this.createChatNotification(thread, currentUser).catch(() => undefined);
      return this.get(threadId, currentUser);
    }

    await prisma.chatMessage.create({
      data: {
        threadId,
        senderUserId: currentUser.id,
        senderRole: currentUser.role,
        senderName: sender.senderName,
        body: text,
      },
    });
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    await this.createChatNotification(thread, currentUser).catch(() => undefined);
    return this.get(threadId, currentUser);
  }

  private async createChatNotification(thread: ChatThreadRecord, currentUser: RequestUser): Promise<void> {
    if (!thread.driverId) {
      return;
    }

    if (currentUser.role === "driver") {
      await this.notificationsCreateService.createManagerChatMessageReceived(thread.driverId);
      return;
    }

    await this.notificationsCreateService.createDriverChatMessageReceived(thread.driverId);
  }

  private async getAccessibleThread(
    threadId: string,
    currentUser: RequestUser | null,
    withMessages: boolean,
  ): Promise<ChatThreadRecord> {
    const prisma = this.prisma.client;
    if (!prisma) {
      const thread = this.memoryThreads.get(threadId);
      if (!thread) {
        throw new NotFoundException("Chat not found");
      }
      const [accessible] = await this.filterAccessibleThreads([thread], currentUser);
      if (!accessible) {
        throw new ForbiddenException("Chat is not available for current user");
      }
      return {
        ...accessible,
        messages: withMessages ? this.getMemoryMessages(threadId) : [],
      };
    }

    const where = await this.buildThreadWhere(currentUser);
    const thread = await prisma.chatThread.findFirst({
      where: {
        AND: [{ id: threadId }, where],
      },
      include: this.threadInclude(withMessages ? undefined : 1),
    });
    if (!thread) {
      throw new NotFoundException("Chat not found");
    }

    return thread;
  }

  private async buildThreadWhere(currentUser: RequestUser | null): Promise<Record<string, unknown>> {
    this.assertAuthenticated(currentUser);

    const companyFilter = currentUser.companyName
      ? { driver: { companyName: currentUser.companyName } }
      : {};

    if (this.isElevated(currentUser.role) || currentUser.role === "operator" || currentUser.role === "auditor") {
      return companyFilter;
    }

    if (currentUser.role === "manager") {
      const managerIds = await this.getManagerScopeIds(currentUser);
      return {
        AND: [
          companyFilter,
          {
            OR: [
              { managerId: { in: [...managerIds] } },
              { driver: { managerId: { in: [...managerIds] } } },
            ],
          },
        ],
      };
    }

    if (currentUser.role === "driver") {
      const driverId = await this.resolveDriverId(currentUser);
      return {
        AND: [
          companyFilter,
          { driverId },
        ],
      };
    }

    throw new ForbiddenException("Role is not allowed for chats");
  }

  private async resolveCreateScope(
    body: CreateChatThreadRequest,
    currentUser: RequestUser,
  ): Promise<{ driverId: string | null; managerId: string | null }> {
    if (currentUser.role === "driver") {
      const driverId = await this.resolveDriverId(currentUser);
      return {
        driverId,
        managerId: await this.resolveAssignedManagerId(driverId),
      };
    }

    const driverId = body.driverId?.trim() || null;
    let managerId = body.managerId?.trim() || null;

    if (currentUser.role === "manager") {
      const managerIds = await this.getManagerScopeIds(currentUser);
      if (driverId) {
        const assignedManagerId = await this.resolveAssignedManagerId(driverId);
        const allowed = await this.isDriverAssignedToManagers(driverId, managerIds);
        if (!allowed) {
          throw new ForbiddenException("Manager can create chats only with assigned drivers");
        }
        managerId = assignedManagerId;
      } else {
        managerId = managerId && managerIds.has(managerId) ? managerId : [...managerIds][0] ?? null;
      }
    }

    if (!driverId && !managerId) {
      throw new BadRequestException("driverId or managerId is required");
    }

    return { driverId, managerId };
  }

  private async resolveAssignedManagerId(driverId: string): Promise<string | null> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return null;
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { managerId: true },
    });

    return driver?.managerId ?? null;
  }

  private async filterAccessibleThreads(
    threads: ChatThreadRecord[],
    currentUser: RequestUser | null,
  ): Promise<ChatThreadRecord[]> {
    this.assertAuthenticated(currentUser);

    if (this.isElevated(currentUser.role) || currentUser.role === "operator" || currentUser.role === "auditor") {
      return threads;
    }

    if (currentUser.role === "manager") {
      const managerIds = await this.getManagerScopeIds(currentUser);
      return threads.filter((thread) => thread.managerId && managerIds.has(thread.managerId));
    }

    if (currentUser.role === "driver") {
      const driverId = await this.resolveDriverId(currentUser);
      return threads.filter((thread) => thread.driverId === driverId);
    }

    return [];
  }

  private async resolveSender(currentUser: RequestUser): Promise<{ senderName: string }> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return { senderName: this.getRoleLabel(currentUser.role) };
    }

    if (currentUser.role === "driver") {
      const driver = await prisma.driver.findFirst({
        where: { OR: [{ id: currentUser.id }, { userId: currentUser.id }] },
        select: { firstName: true, lastName: true },
      });
      return { senderName: driver ? `${driver.firstName} ${driver.lastName}` : "Водитель" };
    }

    if (currentUser.role === "manager") {
      const manager = await prisma.manager.findFirst({
        where: { OR: [{ id: currentUser.id }, { userId: currentUser.id }] },
        include: { user: true },
      });
      return {
        senderName: manager?.user ? `${manager.user.firstName} ${manager.user.lastName}` : "Бригадир",
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { firstName: true, lastName: true },
    });

    return {
      senderName: user ? `${user.firstName} ${user.lastName}` : this.getRoleLabel(currentUser.role),
    };
  }

  private async resolveDriverId(currentUser: RequestUser): Promise<string> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return currentUser.id;
    }

    const driver = await prisma.driver.findFirst({
      where: { OR: [{ id: currentUser.id }, { userId: currentUser.id }] },
      select: { id: true },
    });
    if (!driver) {
      throw new ForbiddenException("Driver profile is required for chat");
    }

    return driver.id;
  }

  private async getManagerScopeIds(currentUser: RequestUser): Promise<Set<string>> {
    return this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
  }

  private async isDriverAssignedToManagers(driverId: string, managerIds: Set<string>): Promise<boolean> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return true;
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { managerId: true },
    });

    return Boolean(driver?.managerId && managerIds.has(driver.managerId));
  }

  private threadInclude(takeMessages?: number): Record<string, unknown> {
    return {
      driver: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      manager: { include: { user: { select: { firstName: true, lastName: true } } } },
      messages: {
        orderBy: { createdAt: takeMessages ? "desc" : "asc" },
        ...(takeMessages ? { take: takeMessages } : {}),
      },
    };
  }

  private toThreadDetail(thread: ChatThreadRecord, messages: ChatMessageRecord[]): ChatThreadDetail {
    return {
      ...this.toThreadItem(thread, messages),
      messages: messages
        .slice()
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((message) => this.toMessageItem(message)),
    };
  }

  private toThreadItem(thread: ChatThreadRecord, messages: ChatMessageRecord[]): ChatThreadItem {
    const orderedMessages = messages
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const lastMessage = orderedMessages[0] ?? null;

    return {
      id: thread.id,
      driverId: thread.driverId,
      managerId: thread.managerId,
      subject: thread.subject,
      status: thread.status === "closed" ? "closed" : "open",
      driverName: thread.driver ? `${thread.driver.firstName} ${thread.driver.lastName}` : null,
      managerName: thread.manager?.user
        ? `${thread.manager.user.firstName} ${thread.manager.user.lastName}`
        : null,
      lastMessagePreview: lastMessage?.body ?? null,
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
      unreadCount: 0,
      createdAt: thread.createdAt.toISOString(),
    };
  }

  private toMessageItem(message: ChatMessageRecord): ChatMessageItem {
    return {
      id: message.id,
      threadId: message.threadId,
      senderUserId: message.senderUserId,
      senderRole: message.senderRole,
      senderName: message.senderName,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private getMemoryMessages(threadId: string): ChatMessageRecord[] {
    return this.memoryMessages.filter((message) => message.threadId === threadId);
  }

  private makeMemoryMessage(
    threadId: string,
    body: string,
    sender: { senderName: string },
  ): ChatMessageRecord {
    return {
      id: randomUUID(),
      threadId,
      senderUserId: null,
      senderRole: "operator",
      senderName: sender.senderName,
      body,
      createdAt: new Date(),
    };
  }

  private getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      owner: "Владелец",
      admin: "Администратор",
      finance: "Финансы",
      manager: "Бригадир",
      operator: "Оператор",
      auditor: "Аудитор",
      driver: "Водитель",
    };

    return labels[role];
  }

  private assertAuthenticated(currentUser: RequestUser | null): asserts currentUser is RequestUser {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }
  }

  private isElevated(role: UserRole): boolean {
    return role === "owner" || role === "admin" || role === "finance";
  }
}
