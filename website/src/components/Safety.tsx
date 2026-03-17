import Reveal from './Reveal';
import styles from './Safety.module.css';

const features = [
  {
    icon: '🏷️',
    title: 'Safety classification',
    desc: 'Every endpoint is classified and badged before the agent decides what to call. A charge endpoint never looks the same as a list endpoint.',
    example: (
      <div className={styles.example}>
        <span className={styles.dim}>$ search_docs "send an SMS"</span>
        <span> </span>
        <span className={styles.bill}>createMessage 💸 BILLABLE</span>
        <span className={styles.dim}>  POST /Accounts/&#123;Sid&#125;/Messages</span>
        <span> </span>
        <span className={styles.read}>listMessages</span>
        <span className={styles.dim}>  GET  /Accounts/&#123;Sid&#125;/Messages</span>
        <span> </span>
        <span className={styles.dest}>deleteMessage ⚠️ DESTRUCTIVE</span>
        <span className={styles.dim}>  DELETE /Accounts/&#123;Sid&#125;/Messages/&#123;Sid&#125;</span>
      </div>
    ),
  },
  {
    icon: '✓',
    title: 'Pre-call validation',
    desc: 'Before any HTTP request leaves, params are checked against the spec. Bad calls are caught locally — no wasted API calls, no cryptic 400 errors.',
    example: (
      <div className={styles.example}>
        <span className={styles.dim}>$ call_api "createMessage" \</span>
        <span className={styles.dim}>    --params '&#123;"To": "+15551234"&#125;'</span>
        <span> </span>
        <span className={styles.err}>Validation failed — fix before calling:</span>
        <span className={styles.err}>• 'AccountSid' (path) is required</span>
        <span className={styles.err}>• 'From' (body) is required</span>
        <span> </span>
        <span className={styles.dim}>No HTTP request was made.</span>
      </div>
    ),
  },
  {
    icon: '✂️',
    title: 'Smart response trimming',
    desc: 'Large responses are summarized intelligently — paginated lists, large arrays, nested objects — so your agent\'s context stays focused.',
    example: (
      <div className={styles.example}>
        <span className={styles.dim}># 197-item list response →</span>
        <span> </span>
        <span className={styles.ok}>197 items (has_more: true</span>
        <span className={styles.ok}>  — paginate with page_token)</span>
        <span> </span>
        <span className={styles.hi}>First: &#123;"sid":"SM123","status":</span>
        <span className={styles.hi}>  "delivered","to":"+1555..."&#125;</span>
        <span className={styles.hi}>Last:  &#123;"sid":"SM456","status":</span>
        <span className={styles.hi}>  "sent","to":"+1555..."&#125;</span>
      </div>
    ),
  },
];

export default function Safety() {
  return (
    <section id="safety" className={styles.section}>
      <Reveal><div className={styles.label}>Built for production</div></Reveal>
      <Reveal><h2>Safe by default</h2></Reveal>
      <Reveal>
        <p className={styles.sub}>
          Giving an agent raw API access is risky. apimcp adds three layers
          of protection — automatically, with no configuration.
        </p>
      </Reveal>

      <div className={styles.grid}>
        {features.map((f, i) => (
          <Reveal key={f.title} delay={(i + 1) as 1 | 2 | 3}>
            <div className={styles.card}>
              <span className={styles.icon}>{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              {f.example}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
