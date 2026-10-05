import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessageItem,
  ChatThreadDetail,
  ChatThreadItem,
  CreateChatThreadRequest,
  DriverListItem,
  SendChatMessageRequest,
} from "@gopark/contracts";
import { fetchJson, postJson } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { formatShortId } from "../lib/utils";

export function ChatsPage() {
  const threadsApi = useApiQuery<ChatThreadItem[]>("chats");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ChatThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [driverId, setDriverId] = useState("");
  const [newBody, setNewBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [threadQuery, setThreadQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const threads = threadsApi.data ?? [];
  const drivers = driversApi.data ?? [];
  const filteredThreads = useMemo(() => {
    const normalizedQuery = threadQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return threads;
    }

    return threads.filter((thread) =>
      [
        thread.driverName ?? "",
        thread.managerName ?? "",
        thread.subject,
        thread.lastMessagePreview ?? "",
      ].join(" ").toLowerCase().includes(normalizedQuery),
    );
  }, [threadQuery, threads]);
  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === driverId) ?? null,
    [drivers, driverId],
  );

  useEffect(() => {
    if (selectedThreadId || !threads.length) {
      return;
    }

    setSelectedThreadId(threads[0].id);
  }, [selectedThreadId, threads]);

  const loadSelectedThread = useCallback((threadId: string, options?: { showLoading?: boolean }) => {
    let active = true;
    if (options?.showLoading) {
      setThreadLoading(true);
    }
    setThreadError(null);
    fetchJson<ChatThreadDetail>(`chats/${threadId}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setSelectedThread(data);
        setThreadLoading(false);
      })
      .catch((error: Error) => {
        if (!active) {
          return;
        }
        setSelectedThread(null);
        setThreadError(error.message);
        setThreadLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      return undefined;
    }

    return loadSelectedThread(selectedThreadId, { showLoading: true });
  }, [loadSelectedThread, selectedThreadId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void threadsApi.refetch({ silent: true }).catch(() => undefined);
      if (selectedThreadId) {
        loadSelectedThread(selectedThreadId);
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [loadSelectedThread, selectedThreadId, threadsApi]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedThread?.id, selectedThread?.messages.length]);

  function appendOptimisticMessage(thread: ChatThreadDetail, body: string): void {
    const createdAt = new Date().toISOString();
    const message: ChatMessageItem = {
      id: `pending-${Date.now()}`,
      threadId: thread.id,
      senderUserId: null,
      senderRole: "operator",
      senderName: "CRM",
      body,
      createdAt,
    };
    setSelectedThread({
      ...thread,
      lastMessagePreview: body,
      lastMessageAt: createdAt,
      messages: [...thread.messages, message],
    });
  }

  async function handleCreateThread(): Promise<void> {
    setFormError(null);
    if (!driverId) {
      setFormError("Выберите водителя для чата.");
      return;
    }
    if (!newBody.trim()) {
      setFormError("Введите первое сообщение.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await postJson<ChatThreadDetail, CreateChatThreadRequest>("chats", {
        driverId,
        subject: `Чат с ${selectedDriver?.fullName ?? "водителем"}`,
        body: newBody,
      });
      setSelectedThreadId(created.id);
      setSelectedThread(created);
      setDriverId("");
      setNewBody("");
      setIsCreateOpen(false);
      threadsApi.refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось создать чат.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendMessage(): Promise<void> {
    if (!selectedThread || !replyBody.trim()) {
      return;
    }

    const text = replyBody.trim();
    appendOptimisticMessage(selectedThread, text);
    setReplyBody("");
    setIsSubmitting(true);
    setFormError(null);
    try {
      const updated = await postJson<ChatThreadDetail, SendChatMessageRequest>(
        `chats/${selectedThread.id}/messages`,
        { body: text },
      );
      setSelectedThread(updated);
      threadsApi.refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
      loadSelectedThread(selectedThread.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page-stack chats-page">
      <div className="hero-card">
        <p className="eyebrow">Чаты</p>
        <h2>Диалоги</h2>
        <p>Отдельные переписки с водителями.</p>
        <div className="toolbar">
          <button type="button" onClick={() => setIsCreateOpen((current) => !current)}>
            {isCreateOpen ? "Скрыть новый чат" : "Начать диалог"}
          </button>
        </div>
      </div>

      {isCreateOpen ? (
      <div className="panel">
        <h3>Начать диалог</h3>
        <div className="quick-form">
          <label>
            Водитель
            <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">Выберите водителя</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.fullName} · {driver.phone}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сообщение
            <textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} placeholder="Напишите сообщение водителю" />
          </label>
          {formError ? <div className="panel-note">Ошибка: {formError}</div> : null}
          <button type="button" disabled={isSubmitting} onClick={() => void handleCreateThread()}>
            {isSubmitting ? "Отправляем..." : "Написать"}
          </button>
        </div>
      </div>
      ) : null}

      <AsyncState loading={threadsApi.loading} error={threadsApi.error}>
        {!threads.length ? (
          <EmptyStatePanel title="Чатов пока нет" message="Создайте первый диалог с водителем или дождитесь сообщения из приложения." />
        ) : (
          <div className="chat-layout">
            <div className="panel chat-list">
              <h3>Диалоги</h3>
              <input value={threadQuery} onChange={(event) => setThreadQuery(event.target.value)} placeholder="Поиск по водителю или сообщению" />
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`chat-list__item${thread.id === selectedThreadId ? " chat-list__item--active" : ""}`}
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <strong>{thread.driverName ?? thread.managerName ?? thread.subject}</strong>
                  <span>{thread.lastMessagePreview ?? "Нет сообщений"}</span>
                  <small>{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString("ru-RU") : formatShortId(thread.id)}</small>
                </button>
              ))}
            </div>

            <div className="panel chat-window">
              <div className="chat-window__header">
                <h3>{selectedThread?.driverName ?? selectedThread?.managerName ?? selectedThread?.subject ?? "Выберите чат"}</h3>
                {selectedThread ? <span>{selectedThread.subject}</span> : null}
              </div>
              <AsyncState loading={threadLoading} error={threadError}>
                {selectedThread ? (
                  <>
                    <div className="chat-messages">
                      {selectedThread.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`chat-message${message.senderRole === "driver" ? " chat-message--incoming" : " chat-message--outgoing"}`}
                        >
                          <strong>{message.senderName}</strong>
                          <p>{message.body}</p>
                          <small>{new Date(message.createdAt).toLocaleString("ru-RU")}</small>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                    <div className="chat-reply">
                      <label>
                        Ответ
                        <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Введите ответ" />
                      </label>
                      <button type="button" disabled={isSubmitting || !replyBody.trim()} onClick={() => void handleSendMessage()}>
                        {isSubmitting ? "Отправляем..." : "Отправить"}
                      </button>
                    </div>
                  </>
                ) : (
                  <EmptyStatePanel title="Чат не выбран" message="Выберите диалог слева, чтобы увидеть историю." />
                )}
              </AsyncState>
            </div>
          </div>
        )}
      </AsyncState>
    </section>
  );
}
