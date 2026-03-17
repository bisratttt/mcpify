import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <p>
        MIT license{' · '}
        <a href="https://github.com/bisratttt/mcpify" target="_blank" rel="noopener noreferrer">GitHub</a>
      </p>
    </footer>
  );
}
