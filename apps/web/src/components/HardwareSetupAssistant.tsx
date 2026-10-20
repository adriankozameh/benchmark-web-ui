import { memo, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { LoaderCircle, MessageCircle, RotateCcw, Send } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { HardwareChatTurn, HardwareProvider, UserLanguage } from '@benchmark/domain';
import { HARDWARE_PROVIDERS, hardwareHistory } from './hardwareProviders';
import './hardware-assistant.css';

type Message = HardwareChatTurn & { id: string };

const markdownComponents: Components = {
  a: ({ children, href, title }) => href
    ? <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
};

function assistantUrl(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? url : undefined;
}

const AssistantReply = memo(function AssistantReply({ content }: { content: string }) {
  return <div className="hardware-assistant-markdown">
    <Markdown skipHtml components={markdownComponents} urlTransform={assistantUrl}>
      {content}
    </Markdown>
  </div>;
});

export function HardwareSetupAssistant({ api, organizationId, language, onUnauthorized }: {
  api: BenchmarkApi; organizationId: string; language: UserLanguage; onUnauthorized: () => void;
}) {
  const tr = (en: string, es: string) => language === 'es' ? es : en;
  const [provider, setProvider] = useState<HardwareProvider | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => () => pending.current?.abort(), [api, organizationId]);
  useEffect(() => {
    if (messages.length > 0 || busy) end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, busy]);

  async function send(question: string) {
    const message = question.trim();
    if (!message || message.length > 4000 || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: message };
    const history = hardwareHistory(messages);
    setMessages(current => [...current, userMessage].slice(-24));
    setDraft(''); setError(null); setBusy(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 95_000);
    try {
      const reply = await api.askHardwareAssistant(organizationId,
        { message, provider, language, history }, controller.signal);
      if (controller.signal.aborted) return;
      if (typeof reply.message !== 'string' || !reply.message.trim()) throw new Error('Empty reply');
      setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant' as const,
        content: reply.message }].slice(-24));
    } catch (cause) {
      if (controller.signal.aborted && !timedOut) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) { onUnauthorized(); return; }
      const status = cause instanceof BenchmarkApiError ? cause.status : 0;
      setError(status === 429
        ? tr('Please wait a minute before sending another message.', 'Espera un minuto antes de enviar otro mensaje.')
        : status === 403
          ? tr('Hardware assistance is not available for this organization.', 'La asistencia no está disponible para esta organización.')
          : tr('Hardware setup assistance is temporarily unavailable. You can still use the provider form. Please try again.',
            'La asistencia no está disponible por el momento. Puedes seguir usando el formulario del proveedor. Inténtalo de nuevo.'));
      setMessages(current => current.filter(turn => turn.id !== userMessage.id));
      setDraft(message);
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted || timedOut) setBusy(false);
    }
  }

  function reset() { setMessages([]); setDraft(''); setError(null); }
  function submit(event: FormEvent) { event.preventDefault(); void send(draft); }
  const suggestions = [
    tr('Where do I find my credentials?', '¿Dónde encuentro mis credenciales?'),
    tr('Help me test my connection', 'Ayúdame a probar la conexión'),
    tr('How do I link a station?', '¿Cómo vinculo una estación?'),
  ];

  return <aside className="hardware-assistant station-form-card" aria-labelledby={`${inputId}-title`}>
    <div className="hardware-assistant-heading">
      <div><MessageCircle size={20} aria-hidden="true" />
        <h2 id={`${inputId}-title`}>{tr('Hardware setup assistant', 'Asistente de hardware')}</h2></div>
      <button type="button" className="icon-button" disabled={busy || messages.length === 0}
        title={tr('New conversation', 'Nueva conversación')} aria-label={tr('New conversation', 'Nueva conversación')}
        onClick={reset}><RotateCcw size={17} /></button>
    </div>
    <p className="muted">{tr('Get help adding your provider account, testing its connection, and linking your station.',
      'Recibe ayuda para agregar tu proveedor, probar la conexión y vincular tu estación.')}</p>
    <label className="field"><span>{tr('Hardware provider', 'Proveedor de hardware')}</span>
      <select value={provider ?? ''} disabled={busy} onChange={event => {
        setProvider((event.target.value || null) as HardwareProvider | null); reset();
      }}>
        <option value="">{tr('Choose your provider', 'Elige tu proveedor')}</option>
        {HARDWARE_PROVIDERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
    <p className="hardware-assistant-privacy">{tr('Enter API keys and passwords only in the provider form, never in chat.',
      'Ingresa las claves y contraseñas solo en el formulario del proveedor, nunca en el chat.')}</p>
    <div className="hardware-assistant-log" role="log" aria-live="polite" aria-relevant="additions"
      aria-label={tr('Hardware setup conversation', 'Conversación de configuración de hardware')}>
      {messages.length === 0 && <p className="hardware-assistant-welcome">{tr(
        'Choose a provider and tell me where you need help. I can walk you through the setup.',
        'Elige un proveedor y dime en qué necesitas ayuda. Te guiaré paso a paso.')}</p>}
      {messages.map(turn => <div key={turn.id} className={`hardware-assistant-message ${turn.role}`}>
        <strong>{turn.role === 'user' ? tr('You', 'Tú') : tr('Assistant', 'Asistente')}</strong>
        {turn.role === 'assistant' ? <AssistantReply content={turn.content} />
          : <p className="hardware-assistant-user-text">{turn.content}</p>}
      </div>)}
      {busy && <p className="hardware-assistant-thinking" role="status"><LoaderCircle className="spin" size={16} />
        {tr('Preparing your answer…', 'Preparando tu respuesta…')}</p>}
      <div ref={end} />
    </div>
    {messages.length === 0 && <div className="hardware-assistant-suggestions">{suggestions.map(question =>
      <button key={question} type="button" disabled={busy} onClick={() => void send(question)}>{question}</button>)}</div>}
    {error && <p className="hardware-assistant-error" role="alert">{error}</p>}
    <form className="hardware-assistant-compose" onSubmit={submit}>
      <label className="field" htmlFor={inputId}><span>{tr('Your question', 'Tu pregunta')}</span>
        <textarea id={inputId} value={draft} maxLength={4000} rows={3} disabled={busy}
          placeholder={tr('Ask about connecting your hardware…', 'Pregunta cómo conectar tu hardware…')}
          onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }
          }} /></label>
      <button type="submit" className="primary-button" disabled={busy || !draft.trim()}>
        <Send size={16} />{tr('Send', 'Enviar')}</button>
    </form>
  </aside>;
}
