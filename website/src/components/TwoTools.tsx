import { useState, useEffect, useRef } from 'react';
import Reveal from './Reveal';
import styles from './TwoTools.module.css';

const BAD_TOOLS = ['listPets', 'createPet', 'getPet', 'updatePet', 'deletePet', 'listOrders', 'createOrder', '...'];

export default function TwoTools() {
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const countRef = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          setVisible(true);
          const interval = setInterval(() => {
            countRef.current += Math.ceil(Math.random() * 12);
            if (countRef.current >= 500) {
              countRef.current = 500;
              clearInterval(interval);
            }
            setCount(countRef.current);
          }, 30);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="two-tools" className={styles.section} ref={sectionRef}>
      <Reveal><div className={styles.label}>ARCHITECTURE</div></Reveal>
      <Reveal><h2 className={styles.heading}>2 tools, not 500</h2></Reveal>
      <Reveal>
        <p className={styles.sub}>
          One tool per endpoint drowns your agent before it asks a question.
          build-mcp generates exactly two tools, regardless of API size.
        </p>
      </Reveal>

      <Reveal>
        <div className={styles.comparison}>
          <div className={styles.bad}>
            <div className={styles.screenLabel}>ONE-PER-ENDPOINT</div>
            <div className={styles.screen}>
              <div className={styles.pills}>
                {BAD_TOOLS.map((t, i) => (
                  <div
                    key={t}
                    className={`${styles.pill} ${visible ? styles.pillDrop : ''}`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    {t}
                  </div>
                ))}
              </div>
              <div className={styles.counter}>
                <span className={styles.counterNum}>{count}</span>
                <span className={styles.counterLabel}>tools</span>
              </div>
            </div>
            <div className={styles.verdict}>CONTEXT OVERFLOW</div>
          </div>

          <div className={styles.vs}>VS</div>

          <div className={styles.good}>
            <div className={styles.screenLabel}>BUILD-MCP</div>
            <div className={styles.screen}>
              <div className={styles.toolCard}>
                <span className={styles.toolName}>search_docs</span>
                <span className={styles.toolDesc}>semantic search across all endpoints</span>
              </div>
              <div className={styles.toolCard}>
                <span className={styles.toolName}>call_api</span>
                <span className={styles.toolDesc}>validate, execute, trim response</span>
              </div>
            </div>
            <div className={`${styles.verdict} ${styles.verdictGood}`}>ALWAYS 2</div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
