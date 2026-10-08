'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { Camera, GripVertical, ImagePlus, MoreHorizontal } from 'lucide-react';
import { AppImage as Image } from '@/components/ui/app-image';
import { ApiError, uploadPhoto, type UploadProgress } from '@/lib/api';
import styles from './listing-form.module.css';

type FailedUpload = { file: File; message: string };
type PendingUpload = { file: File; progress: UploadProgress };
function loadImage(url: string): Promise<void> { return new Promise((resolve, reject) => { const image = new window.Image(); const timer = setTimeout(() => { image.src = ''; reject(new Error('The photo took too long to load. Try a different URL.')); }, 10000); image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error('This image could not load. Check the URL and try again.')); }; image.src = url; }); }
export function PhotoStep({ photos, onChange, onBusyChange }: { photos: string[]; onChange: (photos: string[]) => void; onBusyChange: (busy: boolean) => void }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState<PendingUpload[]>([]), [failures, setFailures] = useState<FailedUpload[]>([]), [tab, setTab] = useState<'upload' | 'url'>('upload'), [cooldown, setCooldown] = useState(0);
  const latest = useRef(photos);
  const uploadLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => { onBusyChange(busy || uploading.length > 0); return () => onBusyChange(false); }, [busy, uploading.length, onBusyChange]);
  useEffect(() => { if (cooldown <= 0) return; const timer = setTimeout(() => setCooldown(0), cooldown * 1000); return () => clearTimeout(timer); }, [cooldown]);
  function addPhoto(value: string) { const current = latest.current; if (current.length >= 20) throw new Error('You can add up to 20 photos.'); if (current.includes(value)) throw new Error('This photo is already added.'); latest.current = [...current, value]; onChange(latest.current); }
  async function addUrl() { setError(''); try { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw new Error('Use an HTTPS image URL.'); if (photos.length >= 20) throw new Error('You can add up to 20 photos.'); setBusy(true); await loadImage(parsed.href); addPhoto(parsed.href); setUrl(''); } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not add photo.'); } finally { setBusy(false); } }
  async function uploadFiles(files: File[]) {
    if (uploadLock.current || busy || cooldown > 0) return;
    uploadLock.current = true;
    latest.current = photos;
    let cursor = 0;
    setUploading(files.map(file => ({ file, progress: { phase: 'queued', retry: 0, waitSeconds: 0 } })));
    async function worker() { while (cursor < files.length) {
      const file = files[cursor++]; if (!file) continue;
      setError(''); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setFailures(old => [...old, { file, message: 'Use JPEG, PNG or WebP.' }]); setUploading(old => old.filter(item => item.file !== file)); continue; }
      if (file.size > 8 * 1024 * 1024) { setFailures(old => [...old, { file, message: 'That photo is too large (max 8 MB).' }]); setUploading(old => old.filter(item => item.file !== file)); continue; }
      if (latest.current.length >= 20) { setError('You can add up to 20 photos.'); break; }
      setUploading(old => old.map(item => item.file === file ? { ...item, progress: { phase: 'uploading', retry: 0, waitSeconds: 0 } } : item));
      try { const result = await uploadPhoto(file, { onProgress: progress => setUploading(old => old.map(item => item.file === file ? { ...item, progress } : item)) }); addPhoto(result.url); } catch (problem) { if (problem instanceof ApiError && problem.status === 429) { setCooldown(problem.retryAfterSeconds || 60); for (const queued of files.slice(cursor)) setFailures(old => [...old, { file: queued, message: 'Upload paused. Try again after the rate limit resets.' }]); cursor = files.length; } setFailures(old => [...old, { file, message: problem instanceof Error ? problem.message : 'Upload failed.' }]); } finally { setUploading(old => old.filter(item => item.file !== file)); }
    } }
    try { await worker(); }
    finally { setUploading([]); uploadLock.current = false; }
  }
  function selectFiles(event: ChangeEvent<HTMLInputElement>) { if (event.target.files) void uploadFiles(Array.from(event.target.files)); event.target.value = ''; }
  function move(index: number, target: number) { onChange(arrayMove(photos, index, target)); }
  function dragEnd(event: DragEndEvent) { if (!event.over || event.active.id === event.over.id) return; const from = photos.indexOf(String(event.active.id)), to = photos.indexOf(String(event.over.id)); if (from >= 0 && to >= 0) move(from, to); }
  return <div>
    <div className={styles.tabs} role="tablist" aria-label="Add photos"><button role="tab" aria-selected={tab === 'upload'} aria-controls="photo-upload-panel" id="photo-upload-tab" onClick={() => setTab('upload')}>Upload photos</button><button role="tab" aria-selected={tab === 'url'} aria-controls="photo-url-panel" id="photo-url-tab" onClick={() => setTab('url')}>Add by URL</button></div>
    {tab === 'url' && <div role="tabpanel" id="photo-url-panel" aria-labelledby="photo-url-tab" className={styles.urlRow}><label className={styles.field}>Add photo by URL<input type="url" placeholder="https://example.com/photo.jpg" value={url} onChange={event => setUrl(event.target.value)} /></label><button type="button" className="outline-button" disabled={busy || uploading.length > 0 || !url.trim() || photos.length >= 20} onClick={() => { latest.current = photos; void addUrl(); }}>{busy ? 'Checking…' : 'Add'}</button></div>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {tab === 'upload' && <div role="tabpanel" id="photo-upload-panel" aria-labelledby="photo-upload-tab" className={styles.dropzone} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}><Camera size={64} aria-hidden="true" /><h2>Drag your photos here</h2><p>Choose at least 5 photos for best results</p><button type="button" className="outline-button" disabled={busy || uploading.length > 0 || cooldown > 0 || photos.length >= 20} onClick={() => input.current?.click()}>Browse</button><span className="muted small">JPEG, PNG or WebP · Up to 8 MB each · 20 photos maximum</span><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={selectFiles} /></div>}
    {failures.map((failure, index) => <div className={styles.uploadStatus} key={`${failure.file.name}-${index}`}><span className="error-text">{failure.file.name}: {failure.message}</span><button type="button" className="text-button" disabled={uploading.length > 0 || cooldown > 0} onClick={() => { setFailures(old => old.filter((_, item) => item !== index)); void uploadFiles([failure.file]); }}>Retry</button><button type="button" aria-label={`Dismiss failed upload ${failure.file.name}`} className="text-button" onClick={() => setFailures(old => old.filter((_, item) => item !== index))}>Dismiss</button></div>)}
    <p className="muted small">{photos.length} / 20 photos. Drag the handle to reorder, or use each photo’s menu.</p>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={photos} strategy={rectSortingStrategy}><div className={styles.photoGrid}>{photos.map((photo, index) => <SortablePhoto key={photo} photo={photo} index={index} total={photos.length} disabled={busy || uploading.length > 0} onMove={target => move(index, target)} onDelete={() => onChange(photos.filter((_, item) => item !== index))} />)}{uploading.map(({ file, progress }, index) => <div key={`pending-${file.name}-${index}`} role="status" className={styles.photo}><div className={styles.uploadStatus} style={{ position: 'absolute', inset: 16, margin: 0, flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}><ImagePlus size={24} aria-hidden="true" /><strong>{progress.phase === 'processing' ? 'Processing…' : progress.phase === 'queued' ? 'Queued' : 'Uploading…'}</strong><span>{file.name}</span>{progress.phase === 'processing' && <span className="muted small">Retry {progress.retry} of 3 after {progress.waitSeconds} seconds</span>}{progress.phase !== 'queued' && <progress aria-label={`${progress.phase === 'processing' ? 'Processing' : 'Uploading'} ${file.name}`} />}</div></div>)}</div></SortableContext></DndContext>
  </div>;
}
function SortablePhoto({ photo, index, total, disabled, onMove, onDelete }: { photo: string; index: number; total: number; disabled: boolean; onMove: (target: number) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo, disabled });
  const [open, setOpen] = useState(false), [above, setAbove] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); container.current?.querySelector<HTMLButtonElement>(`button[aria-expanded]`)?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={node => { setNodeRef(node); container.current = node; }} className={`${styles.photo} ${index === 0 ? styles.cover : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined, transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined }}><Image src={photo} alt={`Photo ${index + 1}${index === 0 ? ', cover photo' : ''}`} fill sizes="(max-width: 744px) 90vw, 630px" />{index === 0 && <span className={styles.coverBadge}>Cover photo</span>}<button type="button" className={styles.dragHandle} disabled={disabled} {...attributes} {...listeners} aria-label={`Reorder photo ${index + 1}`}><GripVertical size={20} /></button><button type="button" className={styles.photoMenuButton} disabled={disabled} aria-label={`Options for photo ${index + 1}`} aria-expanded={open} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setAbove(window.innerHeight - rect.bottom < 260 && rect.top > 200); setOpen(value => !value); }}><MoreHorizontal size={20} /></button>{open && <div className={`${styles.photoMenu} ${above ? styles.photoMenuAbove : ""}`} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}><button type="button" disabled={index === 0} onClick={() => { onMove(index - 1); setOpen(false); }}>Move backward</button><button type="button" disabled={index === total - 1} onClick={() => { onMove(index + 1); setOpen(false); }}>Move forward</button><button type="button" disabled={index === 0} onClick={() => { onMove(0); setOpen(false); }}>Make cover photo</button><button type="button" onClick={onDelete}>Delete photo</button></div>}</div>;
}




