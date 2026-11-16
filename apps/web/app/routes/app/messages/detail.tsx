// /app/messages/:conversationId: một cuộc trò chuyện (G5, §5.4) giữa gia sư và phụ huynh (C7). Tin mới nhất ở cuối;
// `?before=<id>` tải tin cũ hơn. Gửi chữ và/hoặc tệp (ảnh, PDF: tải thẳng lên kho rồi gửi `fileIds`). Tin mới của bên
// kia đến qua realtime (layout tải lại trang); trang tự đánh dấu đã đọc khi đang mở. Tin của mình: xóa được; tin của
// bên kia: báo cáo được. Yêu cầu kết nối đã hủy hoặc hai bên chặn nhau: chỉ còn xem (D32).
// Intent: send | read | delete | report-message | block | report.
import {
  ConversationSummary,
  FILE_RULES,
  Message,
  MESSAGING_LIMITS,
  MessagePage,
  type MessageAttachment,
} from '@tps/shared';
import { FileText, MoreHorizontal, Paperclip, Send, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, useFetcher, useNavigation } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import {
  ReportFields,
  type SafetyResult,
  SafetyActions,
} from '~/components/connections/safety-actions';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { ApiError } from '~/lib/api';
import { labelOf } from '~/lib/catalog';
import { loadSubjects } from '~/lib/catalog.server';
import { documentAccept, uploadDocument } from '~/lib/document-upload';
import { fieldErrorsFrom, formErrorFrom, formText, type Message as UiMessage } from '~/lib/form';
import { formatDateTime, formatFileSize } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { handleSafetyIntent } from '~/lib/safety.server';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import type { Route } from './+types/detail';

const PAGE_SIZE = 50;

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  const name = loaderData?.conversation.counterpart.displayName;
  return [{ title: `${name ?? m.chat.listTitle} – ${m.common.appName}` }];
}

const conversationPath = (id: string) => `/api/v1/conversations/${encodeURIComponent(id)}`;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const api = getServerApi(context);
  const before = new URL(request.url).searchParams.get('before');
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (before) query.set('before', before);
  const path = conversationPath(params.conversationId);
  const { locale } = await readPreferences(request);
  const [conversation, page, subjects] = await Promise.all([
    api.call(path, { schema: ConversationSummary }),
    api.call(`${path}/messages?${query.toString()}`, { schema: MessagePage }),
    loadSubjects(context, locale),
  ]).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  });
  return { conversation, page, subjects, olderView: Boolean(before) };
}

type ActionResult =
  | { intent: 'send'; ok: true }
  | { intent: 'send'; ok: false; formError: UiMessage }
  | { intent: 'read' | 'delete' | 'report-message'; ok: true; messageId?: string }
  | {
      intent: 'read' | 'delete' | 'report-message';
      ok: false;
      formError: UiMessage;
      messageId?: string;
    }
  | SafetyResult;

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const form = await request.formData();
  const api = getServerApi(context);
  const safety = await handleSafetyIntent(api, form);
  if (safety) return data<ActionResult>(safety);

  const path = conversationPath(params.conversationId);
  const intent = formText(form, 'intent');
  const messageId = formText(form, 'messageId');
  try {
    switch (intent) {
      case 'send': {
        let fileIds: unknown = [];
        try {
          fileIds = JSON.parse(formText(form, 'fileIds') || '[]');
        } catch {
          fileIds = [];
        }
        await api.call(`${path}/messages`, {
          method: 'POST',
          body: { body: formText(form, 'body'), fileIds },
          schema: Message,
        });
        return data<ActionResult>({ intent, ok: true });
      }
      case 'read':
        await api.call(`${path}/read`, { method: 'POST', body: { messageId } });
        return data<ActionResult>({ intent, ok: true });
      case 'delete':
        await api.call(`${path}/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
        return data<ActionResult>({ intent, ok: true, messageId });
      case 'report-message':
        await api.call('/api/v1/reports', {
          method: 'POST',
          body: {
            targetType: 'message',
            conversationId: params.conversationId,
            messageId,
            reasonCode: formText(form, 'reasonCode'),
            description: formText(form, 'description'),
          },
        });
        return data<ActionResult>({ intent, ok: true, messageId });
      default:
        throw data(null, { status: 400 });
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    if (intent === 'send') {
      const fields = fieldErrorsFrom(error, ['body', 'fileIds']);
      return data<ActionResult>({
        intent,
        ok: false,
        formError: fields.body ?? fields.fileIds ?? formErrorFrom(error),
      });
    }
    if (intent === 'read' || intent === 'delete' || intent === 'report-message') {
      return data<ActionResult>({ intent, ok: false, formError: formErrorFrom(error), messageId });
    }
    throw error;
  }
}

function AttachmentLink({
  conversationId,
  attachment,
  mine,
}: {
  conversationId: string;
  attachment: MessageAttachment;
  mine: boolean;
}) {
  const { i18n } = useTranslation();
  return (
    <a
      href={`${PATHS.messages}/${conversationId}/attachments/${attachment.fileId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-small no-underline',
        mine
          ? 'bg-primary-hover text-primary-foreground'
          : 'bg-surface text-foreground inset-ring inset-ring-border',
      )}
    >
      <FileText aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{attachment.fileName ?? attachment.fileId}</span>
      <span className="shrink-0 opacity-80">
        {formatFileSize(attachment.sizeBytes, i18n.language)}
      </span>
    </a>
  );
}

/** Thao tác trên một tin: xóa tin của mình, báo cáo tin của bên kia. */
function MessageMenu({ message, busy }: { message: Message; busy: boolean }) {
  const { t } = useTranslation();
  const confirmDelete = (event: FormEvent) => {
    if (!window.confirm(t('chat.confirmDelete'))) event.preventDefault();
  };
  return (
    <details className="relative">
      <summary
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
        aria-label={t('chat.messageActions')}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </summary>
      <div
        className={cn(
          'absolute top-9 z-10 flex w-72 flex-col gap-3 rounded-lg border border-border bg-popover p-3 shadow-lg',
          message.isMine ? 'right-0' : 'left-0',
        )}
      >
        {message.isMine ? (
          <Form method="post" onSubmit={confirmDelete}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="messageId" value={message.id} />
            <Button type="submit" variant="ghost" disabled={busy} className="px-0 text-danger">
              {t('chat.delete')}
            </Button>
          </Form>
        ) : (
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="report-message" />
            <input type="hidden" name="messageId" value={message.id} />
            <span className="text-label">{t('chat.reportMessage')}</span>
            <ReportFields />
            <Button type="submit" variant="secondary" disabled={busy}>
              {t('safety.sendReport')}
            </Button>
          </Form>
        )}
      </div>
    </details>
  );
}

interface PendingFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
}

function Composer({ canSend }: { canSend: boolean }) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const fetcher = useFetcher<ActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<UiMessage | null>(null);
  const sending = fetcher.state !== 'idle';
  const result = fetcher.data?.intent === 'send' ? fetcher.data : undefined;

  // Gửi xong thì xóa tệp đã chọn (điều chỉnh state ngay trong render, một lần cho mỗi kết quả) và nội dung ô nhập.
  const sent = fetcher.state === 'idle' && result?.ok ? result : undefined;
  const [clearedFor, setClearedFor] = useState<ActionResult | undefined>(undefined);
  if (sent && sent !== clearedFor) {
    setClearedFor(sent);
    setFiles([]);
  }
  useEffect(() => {
    if (sent) formRef.current?.reset();
  }, [sent]);

  const onPick = async (list: FileList | null) => {
    if (!list) return;
    setUploadError(null);
    setUploading(true);
    for (const file of Array.from(list)) {
      if (files.length >= MESSAGING_LIMITS.attachmentsPerMessage) break;
      const uploaded = await uploadDocument(file, 'message_attachment');
      if (!uploaded.ok) {
        setUploadError(uploaded.message);
        break;
      }
      setFiles((current) => [
        ...current,
        { fileId: uploaded.fileId, fileName: uploaded.fileName, sizeBytes: uploaded.sizeBytes },
      ]);
    }
    setUploading(false);
  };

  if (!canSend) {
    return <Alert variant="info">{t('chat.readOnly')}</Alert>;
  }
  const error = uploadError ?? (result && !result.ok ? result.formError : null);

  return (
    <fetcher.Form ref={formRef} method="post" className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="send" />
      <input type="hidden" name="fileIds" value={JSON.stringify(files.map((f) => f.fileId))} />
      {error && (
        <p role="alert" className="text-small font-medium text-danger">
          {tr(error)}
        </p>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.fileId}
              className="flex items-center gap-1 rounded-full bg-surface-sunken py-1 pr-1 pl-3 text-small"
            >
              <span className="max-w-48 truncate">{f.fileName}</span>
              <span className="text-muted-foreground">
                {formatFileSize(f.sizeBytes, i18n.language)}
              </span>
              <button
                type="button"
                aria-label={t('chat.removeFile', { name: f.fileName })}
                onClick={() => setFiles((current) => current.filter((x) => x.fileId !== f.fileId))}
                className="flex size-7 items-center justify-center rounded-full hover:bg-surface"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <label
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'cursor-pointer',
            (uploading || files.length >= MESSAGING_LIMITS.attachmentsPerMessage) &&
              'pointer-events-none opacity-45',
          )}
          title={t('chat.attach')}
        >
          <Paperclip aria-hidden="true" />
          <span className="sr-only">{t('chat.attach')}</span>
          <input
            type="file"
            multiple
            accept={documentAccept('message_attachment')}
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              void onPick(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <label htmlFor="chat-body" className="sr-only">
          {t('chat.placeholder')}
        </label>
        <textarea
          id="chat-body"
          name="body"
          rows={2}
          maxLength={MESSAGING_LIMITS.bodyLength}
          placeholder={t('chat.placeholder')}
          className="min-h-control-lg flex-1 resize-y rounded-md border border-input bg-surface px-3 py-2 text-body focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring"
          onKeyDown={(e) => {
            // Enter gửi, Shift+Enter xuống dòng.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" disabled={sending || uploading} aria-label={t('chat.send')}>
          <Send aria-hidden="true" />
          <span className="max-sm:sr-only">{t('chat.send')}</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('chat.fileHint', { mb: FILE_RULES.message_attachment.maxBytes / 1024 / 1024 })}
      </p>
    </fetcher.Form>
  );
}

export default function ChatPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const reader = useFetcher();
  const { conversation, page, subjects, olderView } = loaderData;
  const busy = navigation.state !== 'idle';
  const listEnd = useRef<HTMLLIElement>(null);
  const items = page.items;
  const last = items.at(-1);
  const name = conversation.counterpart.displayName;
  const safetyResult =
    actionData && (actionData.intent === 'block' || actionData.intent === 'report')
      ? actionData
      : undefined;
  const messageResult =
    actionData && (actionData.intent === 'delete' || actionData.intent === 'report-message')
      ? actionData
      : undefined;
  // Tin cuối của mình mà bên kia đã đọc tới (id UUIDv7: so chuỗi đúng thứ tự thời gian).
  const seenId = conversation.counterpartLastReadMessageId;
  const lastMine = [...items].reverse().find((m) => m.isMine);
  const seen = lastMine && seenId && seenId >= lastMine.id;

  // Cuộn xuống tin mới nhất khi mở trang hoặc có tin mới (không cuộn khi xem tin cũ).
  useEffect(() => {
    if (!olderView) listEnd.current?.scrollIntoView({ block: 'end' });
  }, [last?.id, olderView]);

  // Đang mở và tin cuối của bên kia chưa đọc: đánh dấu đã đọc.
  useEffect(() => {
    if (olderView || !last || last.isMine) return;
    const read = conversation.myLastReadMessageId;
    if (read && read >= last.id) return;
    if (document.visibilityState !== 'visible') return;
    void reader.submit({ intent: 'read', messageId: last.id }, { method: 'post' });
    // reader đổi mỗi lần render; chỉ cần chạy lại khi tin cuối hoặc mốc đã đọc đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id, conversation.myLastReadMessageId, olderView]);

  const subjectLine = [labelOf(subjects, conversation.subjectId), conversation.learner?.name]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <AvatarImage
          avatarUrl={conversation.counterpart.avatarUrl}
          displayName={name}
          className="size-11"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-h3">{name}</h1>
          <span className="text-small text-muted-foreground">
            {subjectLine}
            {conversation.requestStatus &&
              ` · ${t(`connectionRequestStatus.${conversation.requestStatus}`)}`}
          </span>
        </div>
        {!conversation.canSend && <Badge variant="neutral">{t('chat.readOnlyBadge')}</Badge>}
        {conversation.connectionRequestId && (
          <Link
            to={`${PATHS.connections}/${conversation.connectionRequestId}`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            {t('chat.viewRequest')}
          </Link>
        )}
      </header>

      {messageResult && (
        <Alert variant={messageResult.ok ? 'success' : 'danger'}>
          {messageResult.ok
            ? messageResult.intent === 'delete'
              ? t('chat.deletedDone')
              : t('safety.reported')
            : tr(messageResult.formError)}
        </Alert>
      )}

      <section aria-label={t('chat.history')} className="flex flex-col gap-2">
        {(page.hasMore || olderView) && (
          <div className="flex justify-center gap-2">
            {page.hasMore && items[0] && (
              <Link
                to={`?before=${items[0].id}`}
                className={buttonVariants({ variant: 'ghost' })}
                preventScrollReset
              >
                {t('chat.older')}
              </Link>
            )}
            {olderView && (
              <Link to="." className={buttonVariants({ variant: 'ghost' })}>
                {t('chat.latest')}
              </Link>
            )}
          </div>
        )}
        {items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t('chat.start', { name })}</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
            {items.map((m) => {
              const deleted = m.deletedAt !== null;
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-start gap-1',
                    m.isMine ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  <div
                    className={cn(
                      'flex max-w-[78%] flex-col gap-1.5 rounded-xl px-3.5 py-2',
                      m.isMine
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm bg-surface-sunken text-foreground',
                      deleted &&
                        'bg-transparent text-muted-foreground italic inset-ring inset-ring-border',
                    )}
                  >
                    <span className="sr-only">{m.isMine ? t('connections.you') : name}:</span>
                    {deleted ? (
                      <span>{t('chat.deleted')}</span>
                    ) : (
                      <>
                        {m.body && <p className="wrap-break-word whitespace-pre-line">{m.body}</p>}
                        {m.attachments.map((a) => (
                          <AttachmentLink
                            key={a.fileId}
                            conversationId={conversation.id}
                            attachment={a}
                            mine={m.isMine}
                          />
                        ))}
                      </>
                    )}
                    <time
                      dateTime={m.createdAt}
                      className={cn(
                        'self-end text-xs',
                        m.isMine && !deleted
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground',
                      )}
                    >
                      {formatDateTime(m.createdAt, i18n.language)}
                    </time>
                  </div>
                  {!deleted && m.kind !== 'system' && <MessageMenu message={m} busy={busy} />}
                </li>
              );
            })}
            <li ref={listEnd} aria-hidden="true" />
          </ol>
        )}
        {seen && !olderView && (
          <p className="text-right text-xs text-muted-foreground">{t('chat.seen')}</p>
        )}
      </section>

      {!olderView && <Composer canSend={conversation.canSend} />}

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer font-semibold">{t('safety.title')}</summary>
        <div className="mt-3">
          <SafetyActions
            name={name}
            blockTarget={{ conversationId: conversation.id }}
            reportTarget={{ targetType: 'conversation_user', conversationId: conversation.id }}
            result={safetyResult}
            busy={busy}
          />
        </div>
      </details>
    </div>
  );
}
