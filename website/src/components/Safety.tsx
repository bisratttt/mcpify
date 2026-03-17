import Reveal from './Reveal';
import styles from './Safety.module.css';

const patterns = [
  {
    name: 'CLASSIFICATION GATE',
    title: 'Classification Gate',
    desc: 'Every endpoint is classified and badged before the agent decides what to call. A charge endpoint never looks the same as a list endpoint.',
    diagram: [
      '+--------------------------+',
      '|  incoming endpoint       |',
      '+--------------------------+',
      '|  v classify()            |',
      '|  +- GET  -> READ         |',
      '|  +- POST -> $ BILLABLE   |',
      '|  +- DEL  -> ! DESTRUCT   |',
      '+--------------------------+',
      '|  badge -> agent context  |',
      '+--------------------------+',
    ],
  },
  {
    name: 'PREFLIGHT CHECK',
    title: 'Pre-flight Validation',
    desc: 'Params are checked against the spec before any HTTP request leaves. Bad calls are caught locally — no wasted API calls.',
    diagram: [
      '+--------------------------+',
      '|  call_api(params)        |',
      '+--------------------------+',
      '|  v validate(spec)        |',
      '|  +- required?  OK        |',
      '|  +- type ok?   OK        |',
      '|  +- in spec?   OK        |',
      '+--------------------------+',
      '|  PASS -> execute HTTP    |',
      '|  FAIL -> error (no req)  |',
      '+--------------------------+',
    ],
  },
  {
    name: 'SMART TRUNCATION',
    title: 'Smart Truncation',
    desc: 'Large responses are summarized intelligently to preserve your agent\'s context window. No more drowning in data.',
    diagram: [
      '+--------------------------+',
      '|  response (197 items)    |',
      '+--------------------------+',
      '|  v trim(response)        |',
      '|  +- count: 197           |',
      '|  +- has_more: true       |',
      '|  +- first: {...}         |',
      '|  +- last:  {...}         |',
      '+--------------------------+',
      '|  context saved: ~94%     |',
      '+--------------------------+',
    ],
  },
];

export default function Safety() {
  return (
    <section id="safety" className={styles.section}>
      <Reveal><div className={styles.label}>SAFETY</div></Reveal>
      <Reveal><h2 className={styles.heading}>Safety Design Patterns</h2></Reveal>
      <Reveal>
        <p className={styles.sub}>
          Three patterns built into every generated server — no configuration required.
        </p>
      </Reveal>

      <div className={styles.grid}>
        {patterns.map((p, i) => (
          <Reveal key={p.name} delay={(i + 1) as 1 | 2 | 3}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.patternName}>{p.name}</span>
              </div>
              <h3>{p.title}</h3>
              <p className={styles.cardDesc}>{p.desc}</p>
              <div className={styles.diagram}>
                {p.diagram.map((line, j) => (
                  <div key={j} className={styles.diagramLine}>{line}</div>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
