import styles from "./booking.module.css";

export function CheckoutSkeleton() {
  return <section className={styles.page} aria-label="Loading checkout" aria-busy="true">
    <div className={`${styles.skeleton} ${styles.titleSkeleton}`} />
    <div className={styles.layout}>
      <div>{[1, 2, 3].map(item => <div key={item} className={`${styles.skeleton} ${styles.sectionSkeleton}`} />)}</div>
      <div className={`${styles.skeleton} ${styles.summarySkeleton}`} />
    </div>
  </section>;
}
