import styles from "./explore.module.css";

export function ListingSkeleton({ count = 12 }: { count?: number }) {
  return <div className={styles.grid} aria-label="Loading stays" aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div key={index} className={styles.skeletonCard}>
      <div className={`skeleton ${styles.skeletonImage}`} />
      <div className={`skeleton ${styles.skeletonLine}`} />
      <div className={`skeleton ${styles.skeletonLine}`} style={{ width: "45%" }} />
      <div className={`skeleton ${styles.skeletonLine}`} style={{ width: "30%" }} />
    </div>)}
  </div>;
}
