import { useEffect, useRef, useState } from 'react';
import CopyButton from './CopyButton';
import styles from './Hero.module.css';

const CMD = 'npx build-mcp convert ./stripe.yaml -o ./stripe-mcp';
const FORMATS = ['OpenAPI', 'Postman', 'GraphQL', 'HAR'];

const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
      0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
      -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
      .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
      -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
      1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
      1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
      1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>
);

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
      <h1 className={styles.heading}>
        <span className={styles.accent}>build</span>
        <span className={styles.dash}>-</span>
        <span>mcp</span>
      </h1>

      {/* Flow: show what it does */}
      <div className={styles.flow}>
        <div className={styles.formats}>
          {FORMATS.map((fmt, i) => (
            <div
              key={fmt}
              className={styles.format}
              style={{ animationDelay: `${i * 0.75}s` }}
            >
              {fmt}
            </div>
          ))}
        </div>

        <div className={styles.wire}>
          <div className={styles.wireLine} />
          <span className={styles.pixel} />
          <span className={`${styles.pixel} ${styles.p2}`} />
          <span className={`${styles.pixel} ${styles.p3}`} />
        </div>

        <div className={styles.processor}>
          <svg className={styles.processorIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
            <path d="M9 15h6" strokeLinecap="round" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
          </svg>
        </div>

        <div className={styles.wire}>
          <div className={styles.wireLine} />
          <span className={styles.pixel} />
          <span className={`${styles.pixel} ${styles.p2}`} />
          <span className={`${styles.pixel} ${styles.p3}`} />
        </div>

        <div className={styles.output}>
          <div className={styles.mcpBox}>MCP Server</div>
          <span className={styles.toolCount}>2 tools</span>
        </div>
      </div>

      <div className={styles.terminal}>
        <div className={styles.bar}>
          <span className={styles.barTitle}>terminal</span>
        </div>
        <div className={styles.body}>
          <span className={styles.prompt}>{'>'} </span>
          <span className={styles.cmd}>{displayed}</span>
          {cursorVisible && <span className={styles.cursor} />}
          <CopyButton text={CMD} className={styles.copyBtn} />
        </div>
      </div>

      <div className={styles.cta}>
        <a className={styles.btnPrimary} href="#quickstart">Get started</a>
        <a
          className={styles.btnGithub}
          href="https://github.com/bisratttt/mcpify"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GithubIcon /> GitHub
        </a>
      </div>
    </div>
  );
}
