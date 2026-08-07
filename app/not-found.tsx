import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <p className="eyebrow">PhotoGift · Page not found</p>
      <h1>That little piece<br /><em>isn’t here.</em></h1>
      <p className="not-found-copy">The page may have moved, but your favorite memories are still waiting for you.</p>
      <div className="hero-actions"><Link className="button button-dark" href="/">Back to storefront <span>↗</span></Link><Link className="text-link" href="/#shop">Browse gifts <span>↓</span></Link></div>
    </main>
  );
}
