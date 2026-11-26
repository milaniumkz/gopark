import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<ChatThreadDetail | null>(null);
  const selectedIdRef = useRef(selectedThreadId);
  selectedIdRef.current = selectedThreadId;
  const requestVersion = useRef(0);
  const pendingLoad = useRef<{ id: string; version: number } | null>(null);
  const followAfterUpdate = useRef(false);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const [newMessages, setNewMessages] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestVersion.current++; }; }, []);
  const applyThread = useCallback((data: ChatThreadDetail) => {
    const old = selectedRef.current;
    const same = old?.id === data.id && old.managerName === data.managerName &&
      old.messages.length === data.messages.length && old.messages.every((x, i) => {
        const y = data.messages[i];
        return x.id === y.id && x.body === y.body && x.createdAt === y.createdAt &&
          x.senderName === y.senderName && x.senderRole === y.senderRole;
      });
    if (same) return;
    const box = messagesRef.current;
    const follow = !old || old.id !== data.id || !box || box.scrollHeight - box.clientHeight - box.scrollTop <= 8;
    followAfterUpdate.current = follow;
    selectedRef.current = data;
    setSelectedThread(data);
    setNewMessages(!follow);
  }, []);
  useLayoutEffect(() => {
    if (followAfterUpdate.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      followAfterUpdate.current = false;
    }
  }, [selectedThread]);
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
    if (pendingLoad.current?.id === threadId && pendingLoad.current.version === requestVersion.current) return () => undefined;
    const version = ++requestVersion.current;
    pendingLoad.current = { id: threadId, version };
    if (options?.showLoading && selectedRef.current?.id !== threadId) setThreadLoading(true);
    fetchJson<ChatThreadDetail>(`chats/${threadId}`)
      .then((data) => {
        if (!mounted.current || selectedIdRef.current !== threadId || version !== requestVersion.current) return;
        applyThread(data);
        setThreadError(null);
        setThreadLoading(false);
      })
      .catch((error: Error) => {
        if (!mounted.current || selectedIdRef.current !== threadId || version !== requestVersion.current) return;
        if (selectedRef.current?.id !== threadId) setThreadError(error.message);
        setThreadLoading(false);
      }).finally(() => {
        if (pendingLoad.current?.version === version) pendingLoad.current = null;
      });
    return () => { if (requestVersion.current === version) requestVersion.current++; };
  }, [applyThread]);

  useEffect(() => {
    if (!selectedThreadId) {
      selectedRef.current = null;
      setSelectedThread(null);
      return undefined;
    }
    setNewMessages(false);
    return loadSelectedThread(selectedThreadId, { showLoading: true });
  }, [loadSelectedThread, selectedThreadId]);

  const refetchThreads = threadsApi.refetch;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (submitting.current || document.hidden) return;
      void refetchThreads({ silent: true }).catch(() => undefined);
      if (selectedThreadId) loadSelectedThread(selectedThreadId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadSelectedThread, selectedThreadId, refetchThreads]);

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
    applyThread({
      ...thread,
      lastMessagePreview: body,
      lastMessageAt: createdAt,
      messages: [...thread.messages, message],
    });
  }

  async function handleCreateThread(): Promise<void> {
    if (submitting.current) return;
    setFormError(null);
    if (!driverId) {
      setFormError("Выберите водителя для чата.");
      return;
    }
    if (!newBody.trim()) {
      setFormError("Введите первое сообщение.");
      return;
    }

    submitting.current = true;
    ++requestVersion.current;
    setIsSubmitting(true);
    try {
      const created = await postJson<ChatThreadDetail, CreateChatThreadRequest>("chats", {
        driverId,
        subject: `Чат с ${selectedDriver?.fullName ?? "водителем"}`,
        body: newBody,
      });
      if (!mounted.current) return;
      setSelectedThreadId(created.id);
      applyThread(created);
      setDriverId("");
      setNewBody("");
      setIsCreateOpen(false);
      void threadsApi.refetch({ silent: true }).catch(() => undefined);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось создать чат.");
    } finally {
      submitting.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  async function handleSendMessage(): Promise<void> {
    if (submitting.current || !selectedThread || !replyBody.trim()) {
      return;
    }

    const text = replyBody.trim();
    appendOptimisticMessage(selectedThread, text);
    setReplyBody("");
    submitting.current = true;
    ++requestVersion.current;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const updated = await postJson<ChatThreadDetail, SendChatMessageRequest>(
        `chats/${selectedThread.id}/messages`,
        { body: text },
      );
      if (!mounted.current || selectedIdRef.current !== selectedThread.id) return;
      applyThread(updated);
      void threadsApi.refetch({ silent: true }).catch(() => undefined);
    } catch (error) {
      if (!mounted.current || selectedIdRef.current !== selectedThread.id) return;
      setFormError(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
      setReplyBody((current) => current || text);
      loadSelectedThread(selectedThread.id);
    } finally {
      submitting.current = false;
      if (mounted.current) setIsSubmitting(false);
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
                    <div className="chat-reading-area">
                    <div className="chat-messages" ref={messagesRef} onScroll={() => {
                      const box = messagesRef.current;
                      if (box && box.scrollHeight - box.clientHeight - box.scrollTop <= 8) setNewMessages(false);
                    }}>
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
                    </div>
                    {newMessages && <button type="button" className="chat-new-messages" onClick={() => {
                      const box = messagesRef.current;
                      if (box) box.scrollTop = box.scrollHeight;
                      setNewMessages(false);
                    }}>Новые сообщения ↓</button>}
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
