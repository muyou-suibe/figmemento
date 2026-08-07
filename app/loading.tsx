export default function Loading() {
  return (
    <main className="loading-shell" aria-busy="true" aria-label="Loading PhotoGift">
      <div className="top-note"><span>Free shipping on orders over $49</span><span className="top-note-dot">·</span><span>Made from your memories</span></div>
      <header className="loading-header"><span className="loading-brand">✦ PhotoGift</span><span className="loading-line" /></header>
      <section className="loading-hero"><div className="loading-copy"><span className="skeleton skeleton-eyebrow" /><span className="skeleton skeleton-title" /><span className="skeleton skeleton-title short" /><span className="skeleton skeleton-text" /><span className="skeleton skeleton-button" /></div><span className="skeleton loading-art" /></section>
      <section className="loading-grid" aria-hidden="true">{[1, 2, 3, 4].map((item) => <span className="skeleton loading-card" key={item} />)}</section>
    </main>
  );
}
