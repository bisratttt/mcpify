import { useEffect, useRef, useState } from 'react';
import CopyButton from './CopyButton';
import styles from './Hero.module.css';

const CMD = 'npx apimcp convert ./stripe.yaml -o ./stripe-mcp';

export default function Hero() {
  const [displayed, setDisplayed] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const indexRef = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayed(CMD.slice(0, ++indexRef.current));
        if (indexRef.current >= CMD.length) {
          clearInterval(interval);
          setTimeout(() => setCursorVisible(false), 1800);
        }
      }, 38);
      return () => clearInterval(interval);
    }, 600);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className={styles.hero}>
      <div className={styles.grid} />
      <div className={styles.glow} />

      <div className={styles.badge}>
        <span className={styles.dot} />
        MCP · OpenAPI · Postman · GraphQL · HAR
      </div>

      <h1 className={styles.heading}>
        <span className={styles.accent}>api</span>mcp
      </h1>

      <p className={styles.tagline}>
        Your API spec walked in.<br />
        <em>An MCP server walked out.</em>
      </p>

      <div className={styles.terminal}>
        <div className={styles.bar}>
          <span className={`${styles.dot2} ${styles.red}`} />
          <span className={`${styles.dot2} ${styles.yellow}`} />
          <span className={`${styles.dot2} ${styles.green}`} />
          <span className={styles.barTitle}>bash</span>
        </div>
        <div className={styles.body}>
          <span className={styles.prompt}>$ </span>
          <span className={styles.cmd}>{displayed}</span>
          {cursorVisible && <span className={styles.cursor} />}
        </div>
        <CopyButton text={CMD} className={styles.copyBtn} />
      </div>

      <div className={styles.cta}>
        <a className={styles.btnPrimary} href="#quickstart">Get started</a>
        <a
          className={styles.btnOutline}
          href="https://github.com/bisratttt/mcpify"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub →
        </a>
      </div>
    </div>
  );
}
