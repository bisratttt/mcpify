import { useEffect, useRef, useState } from 'react';
import { useReveal } from './useReveal';
import styles from './Demo.module.css';

type LineType = 'prompt' | 'prompt-cont' | 'output' | 'blank' | 'bill' | 'read' | 'dest' | 'write' | 'dim' | 'ok';

interface ScriptLine {
  delay: number;
  type: LineType;
  text?: string;
}

const SCRIPT: ScriptLine[] = [
  { delay: 0,    type: 'prompt',      text: '$ search_docs "send an SMS message"' },
  { delay: 700,  type: 'output',      text: 'Searching 197 endpoints...' },
  { delay: 1200, type: 'blank' },
  { delay: 1300, type: 'bill',        text: 'createMessage2010 (POST /2010-04-01/Accounts/{AccountSid}/Messages.json) $ BILLABLE' },
  { delay: 1400, type: 'dim',         text: '  Send a message from the account used to make the request' },
  { delay: 1450, type: 'dim',         text: '  Params: AccountSid (path, required), To (body, required), From (body, required)' },
  { delay: 1500, type: 'dim',         text: '  Body: required — {To: string, From: string, Body: string, MediaUrl: string}' },
  { delay: 1600, type: 'blank' },
  { delay: 1700, type: 'read',        text: 'listMessage2010 (GET /2010-04-01/Accounts/{AccountSid}/Messages.json)' },
  { delay: 1800, type: 'dim',         text: '  Retrieve a list of messages from your Twilio account' },
  { delay: 1900, type: 'blank' },
  { delay: 2600, type: 'prompt',      text: '$ call_api "createMessage2010" \\' },
  { delay: 2700, type: 'prompt-cont', text: "    --params '{\"AccountSid\": \"AC9f...\"}' \\" },
  { delay: 2800, type: 'prompt-cont', text: '    --body \'{"To":"+15551234567","From":"+15559876543","Body":"Hello!"}\''},
  { delay: 3400, type: 'blank' },
  { delay: 3500, type: 'ok',          text: '{' },
  { delay: 3600, type: 'ok',          text: '  "sid": "SM1a2b3c4d5e6f...",' },
  { delay: 3700, type: 'ok',          text: '  "status": "queued",' },
  { delay: 3800, type: 'ok',          text: '  "to": "+15551234567",' },
  { delay: 3900, type: 'ok',          text: '  "from": "+15559876543",' },
  { delay: 4000, type: 'ok',          text: '  "body": "Hello!",' },
  { delay: 4100, type: 'ok',          text: '  "date_created": "Mon, 16 Mar 2026 20:30:00 +0000"' },
  { delay: 4200, type: 'ok',          text: '}' },
];

const colorClass: Record<LineType, string> = {
  prompt:       styles.colorPrompt,
  'prompt-cont':styles.colorPrompt,
  output:       styles.colorDim,
  blank:        '',
  bill:         styles.colorBill,
  read:         styles.colorRead,
  dest:         styles.colorDest,
  write:        styles.colorWrite,
  dim:          styles.colorDim,
  ok:           styles.colorOk,
};

export default function Demo() {
  const { ref, visible } = useReveal(0.3);
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<number[]>([]);
  const startedRef = useRef(false);

  const play = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setLines([]);

    SCRIPT.forEach(step => {
      const t = window.setTimeout(() => {
        setLines(prev => [...prev, step]);
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }, step.delay);
      timeoutsRef.current.push(t);
    });
  };

  useEffect(() => {
    if (visible && !startedRef.current) {
      startedRef.current = true;
      setTimeout(play, 400);
    }
  }, [visible]);

  useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);

  return (
    <section id="demo" className={styles.section}>
      <div className={styles.label}>SEE IT IN ACTION</div>
      <h2 className={styles.heading}>Twilio SMS, start to finish</h2>
      <p className={styles.sub}>
        An agent using a generated build-mcp server — searching for the right
        endpoint, seeing the safety context, then calling it.
      </p>

      <div ref={ref} className={styles.terminal}>
        <div className={styles.bar}>
          <span className={styles.title}>twilio-api · MCP server</span>
          <button className={styles.replay} onClick={play}>REPLAY</button>
        </div>
        <div className={styles.body} ref={bodyRef}>
          {lines.map((line, i) => (
            <span key={i} className={`${styles.line} ${colorClass[line.type]}`}>
              {line.type === 'blank' ? '\u00a0' : line.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
