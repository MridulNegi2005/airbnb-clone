"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { UserPublic } from "@/types/api";
import { ProfileAvatar } from "./profile-avatar";
import styles from "./profiles.module.css";

export function ProfileConnections({ hosts, loading, error, retry }: { hosts: UserPublic[]; loading: boolean; error?: string; retry: () => void }) {
  return <div className={styles.connectionsList}>{loading ? <div aria-label="Loading connections" aria-busy="true">{[0, 1, 2].map(item => <div className={styles.connectionSkeleton} key={item}><span className="skeleton" /><span className="skeleton" /></div>)}</div> : error ? <div role="alert"><p className="error-text">{error}</p><button type="button" className="text-button" onClick={retry}>Try again</button></div> : hosts.length ? hosts.map(host => <Link key={host.id} href={`/users/${host.id}`}><ProfileAvatar user={host} size={72} verified={false} /><span>{host.name}</span><ChevronRight size={16} /></Link>) : <Link href="/">Explore places to stay</Link>}</div>;
}
