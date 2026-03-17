import Reveal from './Reveal';
import styles from './TwoTools.module.css';

const BAD_TOOLS = ['listPets', 'createPet', 'getPet', 'updatePet', 'deletePet', 'listOrders', 'createOrder', '…'];

export default function TwoTools() {
  return (
    <section id="two-tools" className={styles.section}>
      <Reveal><div className={styles.label}>Architecture</div></Reveal>
      <Reveal><h2>2 tools, not 500</h2></Reveal>
      <Reveal>
        <p className={styles.sub}>
          One tool per endpoint drowns your agent before it asks a question.
          apimcp generates exactly two tools, regardless of how large the API is.
        </p>
      </Reveal>

      <Reveal>
        <div className={styles.comparison}>
          <div className={styles.bad}>
            <div className={`${styles.compLabel} ${styles.badLabel}`}>❌ one-tool-per-endpoint</div>
            {BAD_TOOLS.map(t => (
              <div key={t} className={styles.pill}>{t}</div>
            ))}
            <div className={styles.pillNote}>197 more tools eating your context</div>
          </div>

          <div className={styles.arrow}>→</div>

          <div className={styles.good}>
            <div className={`${styles.compLabel} ${styles.goodLabel}`}>✓ apimcp</div>
            <div className={styles.card}>
              <div className={styles.cardName}>search_docs</div>
              <div className={styles.cardDesc}>semantic search — returns IDs, safety badges, param types</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardName}>call_api</div>
              <div className={styles.cardDesc}>validates params, executes endpoint, trims response</div>
            </div>
            <div className={`${styles.pillNote} ${styles.goodNote}`}>always exactly 2 tools</div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
