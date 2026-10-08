import styles from "@/components/listing-detail/detail.module.css";

export default function LoadingListing() {
  return <div className={styles.page} aria-label="Loading stay details" aria-busy="true">
    <div className={`${styles.skeleton} ${styles.titleSkeleton}`} />
    <div className={`${styles.skeleton} ${styles.gallerySkeleton}`} />
    <div className={styles.bodyGrid}>
      <div><div className={`${styles.skeleton} ${styles.textSkeleton}`} /><div className={`${styles.skeleton} ${styles.textSkeleton}`} /><div className={`${styles.skeleton} ${styles.sectionSkeleton}`} /></div>
      <div className={`${styles.skeleton} ${styles.cardSkeleton}`} />
    </div>
  </div>;
}
