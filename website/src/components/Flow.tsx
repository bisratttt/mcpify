import { useEffect, useRef, useState } from 'react';
import styles from './Flow.module.css';

const FORMATS = ['OpenAPI', 'Postman', 'GraphQL', 'HAR'];

export default function Flow() {
  const [step, setStep] = useState(-1);
  const ref = useRef<HTMLElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          let s = 0;
          const interval = setInterval(() => {
            setStep(s++);
            if (s > 6) clearInterval(interval);
          }, 350);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.section} ref={ref}>
      <div className={styles.flow}>
        <div className={styles.inputs}>
          {FORMATS.map((fmt, i) => (
            <div
              key={fmt}
              className={`${styles.format} ${step >= i ? styles.show : ''}`}
            >
              {fmt}
            </div>
          ))}
        </div>

        <div className={`${styles.connector} ${step >= 4 ? styles.show : ''}`}>
          <span className={styles.stream}>{'>>>'}</span>
        </div>

        <div className={`${styles.agent} ${step >= 5 ? styles.show : ''}`}>
          <svg className={styles.agentIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
            <path d="M9 15h6" strokeLinecap="round" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
          </svg>
          <span className={styles.agentLabel}>build-mcp</span>
        </div>

        <div className={`${styles.connector} ${step >= 5 ? styles.show : ''}`}>
          <span className={styles.stream}>{'>>>'}</span>
        </div>

        <div className={`${styles.output} ${step >= 6 ? styles.show : ''}`}>
          <div className={styles.mcpBox}>MCP Server</div>
          <span className={styles.toolCount}>2 tools</span>
        </div>
      </div>
    </section>
  );
}
