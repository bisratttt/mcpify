import Reveal from './Reveal';
import CopyButton from './CopyButton';
import styles from './QuickStart.module.css';

const steps = [
  {
    n: '1',
    title: 'INSTALL',
    cmd: 'npm install -g build-mcp',
  },
  {
    n: '2',
    title: 'CONVERT YOUR SPEC',
    cmd: 'build-mcp convert ./openapi.yaml -o ./my-api-mcp',
    note: 'Uses local Qwen3 embeddings by default — no API key needed. Pass --embedding-provider openai or ollama if you prefer.',
  },
  {
    n: '3',
    title: 'RUN IT',
    cmd: 'cd my-api-mcp && npm install && cp .env.example .env && npm start',
  },
];

export default function QuickStart() {
  return (
    <section id="quickstart" className={styles.section}>
      <Reveal><div className={styles.label}>GET STARTED</div></Reveal>
      <Reveal><h2 className={styles.heading}>Three commands</h2></Reveal>
      <Reveal><p className={styles.sub}>From spec to running MCP server.</p></Reveal>

      <div className={styles.steps}>
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={(i + 1) as 1 | 2 | 3}>
            <div className={styles.step}>
              <div className={styles.num}>{s.n}</div>
              <div className={styles.content}>
                <h3>{s.title}</h3>
                <div className={styles.codeBlock}>
                  <code>{s.cmd}</code>
                  <CopyButton text={s.cmd} />
                </div>
                {s.note && <p className={styles.note}>{s.note}</p>}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
