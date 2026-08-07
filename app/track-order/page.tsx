import Link from "next/link";
import { TrackOrderForm } from "./TrackOrderForm";
import styles from "../info-page.module.css";

export const metadata = { title: "Track your order — PhotoGift", description: "Check your PhotoGift payment and fulfillment status with your order number and checkout email." };

export default function TrackOrderPage() {
  return <main className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/"><span>✦</span>Photo<span>Gift</span></Link><Link className={styles.back} href="/">Back to storefront ↗</Link></header><article className={styles.article}><p className="eyebrow">Customer care</p><h1>Track your order</h1><p className={styles.intro}>Enter the order number from your confirmation and the email used at checkout.</p><TrackOrderForm /></article></main>;
}
