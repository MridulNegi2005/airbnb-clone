"use client";
import styles from "./search.module.css";
export function PriceRange({ minimum, maximum, onChange, prices=[] }: { minimum: number; maximum: number; onChange: (min: number, max: number) => void; prices?:number[] }) {
  function clamp() { onChange(Math.max(0, Math.min(minimum, maximum, 50000)), Math.min(50000, Math.max(minimum, maximum, 0))); }
  const bins=Array.from({length:40},()=>0);
  prices.forEach(price=>{if(Number.isFinite(price)&&price>=0){const bin=Math.min(39,Math.floor(price/1250));bins[bin]=(bins[bin]??0)+1;}});
  const highest=Math.max(1,...bins);
  const low=Math.max(0,Math.min(50000,minimum)),high=Math.max(low,Math.min(50000,maximum));
  return <>{prices.length>0&&<div className={styles.histogram} aria-hidden="true">{bins.map((count,index)=><span key={index} style={{height:`${Math.max(3,count/highest*100)}%`,background:(index+1)*1250>=low&&index*1250<=high?"var(--brand)":"var(--line)"}}/>)}</div>}<div className={styles.slider}><div className={styles.sliderTrack} /><div className={styles.sliderSelected} style={{ left: `${low / 500}%`, right: `${(50000 - high) / 500}%` }} /><input aria-label="Minimum nightly price" type="range" min={0} max={50000} step={100} value={low} onChange={(event) => onChange(Math.min(Number(event.target.value), maximum), maximum)} /><input aria-label="Maximum nightly price" type="range" min={0} max={50000} step={100} value={high} onChange={(event) => onChange(minimum, Math.max(Number(event.target.value), minimum))} /></div><div className={styles.priceInputs}><label>Minimum<span className="flex items-center gap-1 text-base text-primary">₹<input aria-label="Minimum price in rupees" type="number" min={0} max={50000} value={minimum} onBlur={clamp} onChange={(event) => onChange(Number(event.target.value), maximum)} /></span></label><label>Maximum<span className="flex items-center gap-1 text-base text-primary">₹<input aria-label="Maximum price in rupees" type="number" min={0} max={50000} value={maximum} onBlur={clamp} onChange={(event) => onChange(minimum, Number(event.target.value))} />{maximum >= 50000 && <span>+</span>}</span></label></div></>;
}

