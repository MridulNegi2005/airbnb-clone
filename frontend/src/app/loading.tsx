import { ListingSkeleton } from "@/components/explore/listing-skeleton";

export default function Loading() {
  return <><div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[70] h-[3px] bg-brand" /><div className="page-shell py-10"><ListingSkeleton /></div></>;
}
