import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <p>
        <strong>apimcp</strong>
        {' · '}
        <a href="https://github.com/bisratttt/mcpify" target="_blank" rel="noopener noreferrer">GitHub</a>
        {' · '}
        MIT license
      </p>
      <p className={styles.sub}>Built with local-first embeddings — your spec never leaves your machine.</p>
    </footer>
  );
}
