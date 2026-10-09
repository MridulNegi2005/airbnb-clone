import { SearchIcon } from "@/components/ui/search-icon";
import { AppImage } from "@/components/ui/app-image";
import styles from "./site-shell.module.css";

export function CompactSearchContent({location="Anywhere",dates="Anytime",guests="Add guests"}:{location?:string;dates?:string;guests?:string}) {
  return <><span><span className={styles.compactHouse}><AppImage src="https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/4aae4ed7-5939-4e76-b100-e69440ebeae4.png?im_w=240" width={48} height={48} alt="" unoptimized/></span>{location}</span><span>{dates}</span><span>{guests}</span><span className={styles.compactIcon}><SearchIcon size={12}/></span></>;
}
