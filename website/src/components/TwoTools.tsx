import { useState, useEffect, useRef } from 'react';
import Reveal from './Reveal';
import styles from './TwoTools.module.css';

const BAD_TOOLS = ['listPets', 'createPet', 'getPet', 'updatePet', 'deletePet', 'listOrders', 'createOrder', '...'];

export default function TwoTools() {
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const countRef = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // reset and restart every time it enters view
          if (intervalRef.current) clearInterval(intervalRef.current);
          countRef.current = 0;
          setCount(0);
          setVisible(false);
          // tick to let pill animation reset before re-adding the class
          requestAnimationFrame(() => {
            setVisible(true);
            intervalRef.current = setInterval(() => {
              countRef.current += Math.ceil(Math.random() * 12);
              if (countRef.current >= 500) {
                countRef.current = 500;
                clearInterval(intervalRef.current!);
              }
              setCount(countRef.current);
            }, 30);
          });
        } else {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <section id="two-tools" className={styles.section} ref={sectionRef}>
      <Reveal><div className={styles.label}>ARCHITECTURE</div></Reveal>
      <Reveal><h2 className={styles.heading}>find then call — two moves, any API</h2></Reveal>
      <Reveal>
        <p className={styles.sub}>
          Most servers dump every endpoint as a separate tool and hope the agent picks right.
          build-mcp gives your agent semantic search to find the relevant endpoint from plain English,
          and a single executor to call it. Local embeddings, no config, no context overflow.
        </p>
      </Reveal>

      <Reveal>
        <div className={styles.semanticBlock}>
          <div className={styles.semanticHeader}>
            <span className={styles.semanticTag}>SEMANTIC SEARCH</span>
            <span className={styles.semanticTagline}>find the right endpoint — no exact name required</span>
          </div>
          <div className={styles.semanticFlow}>
            <div className={styles.semanticStep}>
              <span className={styles.stepQuery}>"list all unpaid invoices"</span>
              <span className={styles.stepArrow}>↓</span>
              <span className={styles.stepEmbed}>Qwen3 embedding (local, no API key)</span>
              <span className={styles.stepArrow}>↓</span>
              <span className={styles.stepResult}>→ GET /invoices — params: status, limit, cursor</span>
            </div>
          </div>
          <p className={styles.semanticNote}>
            search_docs returns the endpoint schema. The agent reads the params and decides what to pass to call_api.
          </p>
          <div className={styles.semanticFeatures}>
            <div className={styles.semanticFeature}><span className={styles.featureDot} />runs entirely offline</div>
            <div className={styles.semanticFeature}><span className={styles.featureDot} />no OpenAI key needed</div>
            <div className={styles.semanticFeature}><span className={styles.featureDot} />SQLite vector index, zero dependencies</div>
          </div>
        </div>
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
