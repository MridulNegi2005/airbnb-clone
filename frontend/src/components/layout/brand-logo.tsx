import Link from "next/link";
import Image from "next/image";
import styles from "./brand-logo.module.css";

export function BrandLogo({compact=false}:{compact?:boolean}) {
  return <Link href="/" className={`brand-logo ${styles.logo} ${compact?styles.compact:""}`} aria-label="Airbnb home"><Image className={styles.wordmark} src="/airbnb-logo.svg" width={102} height={32} alt="" priority/><Image className={styles.belo} src="/airbnb-belo.svg" width={30} height={32} alt="" priority/></Link>;
}
