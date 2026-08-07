"use client";
/* eslint-disable @next/next/no-img-element -- object URLs from the local upload cannot use next/image. */

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { categories, Category, Product, productFromDatabase, products } from "./catalog";
import { getSupabaseBrowserClient } from "./lib/supabase-browser";
import { siteConfig } from "./site-config";

type CartItem = Product & {
  customization?: {
    note?: string;
    options?: Record<string, string>;
    photoPath?: string;
    photoPaths?: string[];
    photoMeta?: {
      originalFilename: string;
      contentType: string;
      fileSizeBytes: number;
      width: number;
      height: number;
      quality: "good" | "low";
    };
    photoMetas?: CartItem["customization"]["photoMeta"][];
  };
};

const targetUploadBytes = 3.5 * 1024 * 1024;

async function optimizeLargeImage(file: File): Promise<File> {
  if (file.size <= targetUploadBytes) return file;
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      element.src = sourceUrl;
    });
    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!compressed || compressed.size > targetUploadBytes) throw new Error("IMAGE_TOO_LARGE");
    return new File([compressed], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      element.src = sourceUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function ProductArt({ art, small = false }: { art: Product["art"]; small?: boolean }) {
  return (
    <div className={`product-art art-${art} ${small ? "product-art-small" : ""}`} aria-hidden="true">
      <span className="art-sun" />
      {art === "figure" && <><span className="figure-head" /><span className="figure-body" /><span className="figure-base" /></>}
      {art === "portrait" && <><span className="portrait-head" /><span className="portrait-body" /><span className="portrait-frame" /></>}
      {art === "pet" && <><span className="pet-ear pet-ear-left" /><span className="pet-ear pet-ear-right" /><span className="pet-head" /><span className="pet-body" /><span className="pet-base" /></>}
      {art === "cube" && <><span className="cube-face cube-front" /><span className="cube-face cube-side" /><span className="cube-face cube-top" /></>}
      {art === "digital" && <><span className="digital-card" /><span className="digital-spark spark-one" /><span className="digital-spark spark-two" /></>}
    </div>
  );
}

export default function Home() {
  const [category, setCategory] = useState<Category>("All gifts");
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponState, setCouponState] = useState<{ code: string; discountCents: number; label: string } | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [orderState, setOrderState] = useState<"idle" | "creating" | "created" | "error">("idle");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<{ status: "success" | "cancelled"; order: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<CartItem["customization"]["photoMeta"] | null>(null);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoMetas, setPhotoMetas] = useState<NonNullable<CartItem["customization"]>["photoMeta"][]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "uploaded" | "error">("idle");
  const [customNote, setCustomNote] = useState("");
  const [toast, setToast] = useState("");
  const [activeSection, setActiveSection] = useState("top");
  const [sortBy, setSortBy] = useState<"featured" | "price-low" | "price-high" | "name">("featured");

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("products")
          .select("slug, name, category, description, price_cents, art_key")
          .eq("is_published", true)
          .order("created_at", { ascending: true });

        if (error) throw error;
        const databaseProducts = (data ?? [])
          .map((row) => productFromDatabase(row))
          .filter((product): product is Product => product !== null);

        if (active && databaseProducts.length > 0) setCatalog(databaseProducts);
      } catch {
        // Keep the replaceable local catalog available while Supabase is not configured or reachable.
      }
    }

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const savedCart = window.localStorage.getItem("photogift-cart");
    let restoredCart: CartItem[] = [];
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart) as CartItem[];
        restoredCart = parsed.filter((item) => products.some((product) => product.id === item.id));
      } catch {
        window.localStorage.removeItem("photogift-cart");
      }
    }
    window.queueMicrotask(() => {
      setCart(restoredCart);
      setCartReady(true);
    });
  }, []);

  useEffect(() => {
    if (cartReady) window.localStorage.setItem("photogift-cart", JSON.stringify(cart));
  }, [cart, cartReady]);

  useEffect(() => {
    if (!cartReady) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    const order = params.get("order");
    if (!order || (status !== "success" && status !== "cancelled")) return;

    window.queueMicrotask(() => {
      setCheckoutResult({ status, order });
      setBagOpen(false);
      if (status === "success") setCart([]);
    });
  }, [cartReady]);

  useEffect(() => {
    const hasOverlay = Boolean(selectedProduct || bagOpen || checkoutResult);
    document.body.style.overflow = hasOverlay ? "hidden" : "";
    if (!hasOverlay) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (checkoutResult) setCheckoutResult(null);
      else if (selectedProduct) setSelectedProduct(null);
      else if (bagOpen) setBagOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [bagOpen, checkoutResult, selectedProduct]);

  useEffect(() => {
    if (!searchOpen) return;
    const closeSearchOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", closeSearchOnEscape);
    return () => window.removeEventListener("keydown", closeSearchOnEscape);
  }, [searchOpen]);

  useEffect(() => {
    const sections = ["top", "shop", "how-it-works", "story"].map((id) => document.getElementById(id)).filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id);
    }, { rootMargin: "-20% 0px -60%", threshold: [0.1, 0.4, 0.7] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button, input, textarea, select, a[href]";
    const getDialog = () => document.querySelector<HTMLElement>(".customizer");
    const focusFrame = window.requestAnimationFrame(() => getDialog()?.querySelector<HTMLElement>(focusableSelector)?.focus());
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = getDialog();
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [selectedProduct]);

  const filteredProducts = useMemo(
    () => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matches = catalog.filter((product) => {
        const matchesCategory = category === "All gifts" || product.category === category;
        const matchesQuery = !normalizedQuery || [product.name, product.description, product.category].some((value) => value.toLowerCase().includes(normalizedQuery));
        return matchesCategory && matchesQuery;
      });
      return [...matches].sort((a, b) => sortBy === "price-low" ? a.price - b.price : sortBy === "price-high" ? b.price - a.price : sortBy === "name" ? a.name.localeCompare(b.name) : catalog.indexOf(a) - catalog.indexOf(b));
    },
    [catalog, category, searchQuery, sortBy],
  );
  const visibleProducts = showAllProducts || searchQuery.trim() ? filteredProducts : filteredProducts.slice(0, 8);
  const cartSubtotalCents = useMemo(() => Math.round(cart.reduce((sum, item) => sum + item.price, 0) * 100), [cart]);
  const cartDiscountCents = couponState?.discountCents || 0;
  const cartShippingCents = cartSubtotalCents >= 4900 ? 0 : 799;
  const validCustomerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const addToCart = (product: Product) => {
    if ((!photoPath && photoPaths.length === 0) || uploadState !== "uploaded") {
      showToast("Please save your photo before adding this personalized gift");
      return;
    }
    setCart((items) => [...items, { ...product, customization: { note: customNote, options: selectedOptions, photoPath: photoPath ?? photoPaths[0], photoPaths, photoMeta: photoMeta ?? photoMetas[0], photoMetas } }]);
    setSelectedProduct(null);
    setCheckoutOpen(false);
    setPhotoUrl(null);
    setPhotoPath(null);
    setPhotoMeta(null);
    setPhotoUrls([]);
    setPhotoPaths([]);
    setPhotoMetas([]);
    setSelectedOptions({});
    setUploadState("idle");
    setCustomNote("");
    setBagOpen(true);
    showToast(`${product.name} added to your bag`);
  };

  const createOrder = async () => {
    if (!validCustomerEmail) {
      setOrderState("error");
      showToast("Enter a valid email address for order updates");
      return;
    }
    setOrderState("creating");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: customerEmail,
          couponCode: couponState?.code || undefined,
          items: cart.map((item) => ({ slug: item.id, quantity: 1, customization: item.customization ?? {} })),
        }),
      });
      const result = (await response.json()) as { orderNumber?: string; checkoutUrl?: string | null; error?: string };
      if (!response.ok || !result.orderNumber) throw new Error(result.error || "Order creation failed");
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setOrderNumber(result.orderNumber);
      setOrderState("created");
    } catch (error) {
      setOrderState("error");
      showToast(error instanceof Error ? error.message : "We could not start your order");
    }
  };

  const applyCoupon = async () => {
    setCouponLoading(true);
    setCouponMessage("");
    try {
      const response = await fetch("/api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponCode, subtotalCents: cartSubtotalCents }) });
      const result = await response.json() as { code?: string; discountCents?: number; label?: string; error?: string };
      if (!response.ok || !result.code || typeof result.discountCents !== "number" || !result.label) throw new Error(result.error || "Coupon could not be applied.");
      setCouponState({ code: result.code, discountCents: result.discountCents, label: result.label });
      setCouponMessage(`${result.code} applied · ${result.label}`);
    } catch (error) {
      setCouponState(null);
      setCouponMessage(error instanceof Error ? error.message : "Coupon could not be applied.");
    } finally {
      setCouponLoading(false);
    }
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 5);
    if (files.length === 0) return;
    // Allow the same file to be selected again after a failed upload.
    event.currentTarget.value = "";
    setPhotoUrl((current) => current ?? URL.createObjectURL(files[0]));
    setPhotoPath(null);
    setPhotoMeta(null);
    setUploadState("uploading");
    const nextPaths: string[] = [];
    const nextMetas: NonNullable<CartItem["customization"]>["photoMeta"][] = [];

    try {
      for (const file of files) {
        const uploadFile = await optimizeLargeImage(file);
        const dimensions = await readImageDimensions(uploadFile);
        const quality = Math.min(dimensions.width, dimensions.height) >= 800 ? "good" : "low";
        const formData = new FormData();
        formData.append("file", uploadFile, uploadFile.name);
        let result: { storageKey?: string; error?: string } = {};
        let responseOk = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetch("/api/uploads", { method: "POST", body: formData });
          result = (await response.json()) as { storageKey?: string; error?: string };
          responseOk = response.ok && Boolean(result.storageKey);
          if (responseOk) break;
          if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        if (!responseOk || !result.storageKey) throw new Error(result.error || "Upload failed");
        nextPaths.push(result.storageKey);
        nextMetas.push({ originalFilename: uploadFile.name, contentType: uploadFile.type, fileSizeBytes: uploadFile.size, ...dimensions, quality });
      }
      setPhotoPaths((current) => [...current, ...nextPaths]);
      setPhotoPath((current) => current ?? nextPaths[0]);
      setPhotoMetas((current) => [...current, ...nextMetas]);
      setPhotoMeta((current) => current ?? nextMetas[0]);
      setUploadState("uploaded");
    } catch (error) {
      setUploadState("error");
      showToast(error instanceof Error && error.message === "IMAGE_TOO_LARGE" ? "This image is still over 10MB after compression." : "Photo preview is ready, but saving failed. Please try again.");
    }
  };

  return (
    <main className="site-shell" id="main-content">
      <a className="skip-link" href="#shop">Skip to gifts</a>
      <div className="top-note"><span>Free shipping on orders over ${siteConfig.shippingThreshold}</span><span className="top-note-dot">·</span><span>Made from your memories</span></div>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={`${siteConfig.brandName} home`}><span className="brand-mark">✦</span><span>Photo<span>Gift</span></span></a>
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <a href="#shop" aria-current={activeSection === "shop" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Shop gifts</a>
          <a href="#how-it-works" aria-current={activeSection === "how-it-works" ? "page" : undefined} onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#story" aria-current={activeSection === "story" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Our story</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" aria-label={searchOpen ? "Close search" : "Search"} aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>⌕</button>
          <button className="bag-button" aria-label={`Open bag with ${cart.length} item${cart.length === 1 ? "" : "s"}`} onClick={() => setBagOpen(true)}>Bag <span>{cart.length}</span></button>
          <button className="menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button>
        </div>
      </header>

      {searchOpen && <div className="site-search"><label htmlFor="site-search-input">Search gifts</label><input id="site-search-input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Try “pet”, “portrait” or “figure”" autoFocus />{searchQuery && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearchQuery("")}>Clear</button>}<button type="button" onClick={() => { setSearchOpen(false); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}>View results <span>↘</span></button></div>}

      {checkoutResult && <div className="checkout-result-backdrop" role="presentation"><section className="checkout-result" role="dialog" aria-modal="true" aria-labelledby="checkout-result-title"><div className={`checkout-result-mark ${checkoutResult.status === "success" ? "is-success" : "is-cancelled"}`}>{checkoutResult.status === "success" ? "✓" : "!"}</div><p className="eyebrow">{checkoutResult.status === "success" ? "Payment received" : "Payment not completed"}</p><h2 id="checkout-result-title">{checkoutResult.status === "success" ? "Your memory is on its way." : "Your bag is still saved."}</h2><p>{checkoutResult.status === "success" ? "Thank you. We’ve received your order and will review the details before production." : "No payment was taken. You can return to your bag whenever you’re ready."}</p><div className="checkout-result-order"><span>Order number</span><strong>{checkoutResult.order}</strong></div><button className="button button-dark full-button" onClick={() => setCheckoutResult(null)}>{checkoutResult.status === "success" ? "Continue shopping" : "Return to bag"}</button></section></div>}

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Gifts that feel like you</p>
          <h1>Your favorite moments,<br /><em>made tangible.</em></h1>
          <p className="hero-lede">Personalized keepsakes made from the people, pets and places you never want to forget.</p>
          <div className="hero-actions"><a className="button button-dark" href="#shop">Find your gift <span>↗</span></a><a className="text-link" href="#how-it-works">See how it works <span>↓</span></a></div>
          <div className="hero-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span></div><span><strong>4.9/5</strong> from memory makers worldwide</span></div>
        </div>
        <div className="hero-visual"><div className="hero-shape" /><div className="hero-card hero-card-back"><span>made with love</span></div><div className="hero-card hero-card-front"><ProductArt art="figure" /><div className="hero-card-label"><span>your story</span><strong>in miniature</strong></div></div><span className="hero-sticker">a little<br /><strong>piece of you</strong></span><span className="hero-scribble">✳</span></div>
      </section>

      <section className="marquee" aria-label="PhotoGift promises"><div><span>Thoughtful by design</span><b>✦</b><span>Made to be kept</span><b>✦</b><span>Personalized for you</span><b>✦</b><span>Thoughtful by design</span><b>✦</b><span>Made to be kept</span></div></section>

      <section className="shop-section" id="shop">
        <div className="section-heading"><div><p className="eyebrow">The gift guide</p><h2>Made for <em>meaningful</em> moments.</h2></div><p className="section-intro">From a tiny version of your favorite person to a portrait of your best friend, start with the feeling you want to hold onto.</p></div>
        <div className="catalog-toolbar"><div className="category-tabs" role="tablist" aria-label="Gift categories">{categories.map((item, index) => <button key={item} className={category === item ? "active" : ""} onClick={() => { setCategory(item); setShowAllProducts(false); }} onKeyDown={(event) => { if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return; event.preventDefault(); const nextIndex = event.key === "ArrowRight" ? (index + 1) % categories.length : (index - 1 + categories.length) % categories.length; const nextTab = document.querySelector<HTMLButtonElement>(`[data-gift-tab="${categories[nextIndex]}"]`); nextTab?.focus(); nextTab?.click(); }} data-gift-tab={item} role="tab" aria-selected={category === item} aria-controls="gift-grid" tabIndex={category === item ? 0 : -1}>{item}</button>)}</div><label className="sort-control">Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label></div>
        <div id="gift-grid" role="tabpanel" aria-label={`${category} gifts`} aria-live="polite">{filteredProducts.length > 0 ? <div className="product-grid">{visibleProducts.map((product) => <article className="product-card" key={product.id}><button className="product-image" onClick={() => setSelectedProduct(product)} aria-label={`Customize ${product.name}`}><ProductArt art={product.art} /><span className="quick-add">Customize <span>↗</span></span></button><div className="product-meta"><div><p className="product-category">{product.tag && <span className="product-tag">{product.tag}</span>}<span>{product.category}</span></p><h3>{product.name}</h3><p className="product-description">{product.description}</p></div><strong className="product-price">${product.price.toFixed(2)}</strong></div></article>)}</div> : <div className="empty-catalog" role="status"><strong>No gifts match that search.</strong><span>Try a different word or browse all gifts.</span><button type="button" className="text-link" onClick={() => { setSearchQuery(""); setCategory("All gifts"); }}>Clear filters <span>↗</span></button></div>}</div>
        <div className="shop-more"><span>{searchQuery.trim() ? `${filteredProducts.length} matching gifts` : showAllProducts ? `${filteredProducts.length} gifts in this collection` : `A considered edit of ${filteredProducts.length} gifts`}</span>{filteredProducts.length > 8 && !searchQuery.trim() && <button type="button" className="text-link" onClick={() => setShowAllProducts((visible) => !visible)}>{showAllProducts ? "Show fewer" : "View all gifts"} <span>{showAllProducts ? "↑" : "→"}</span></button>}</div>
      </section>

      <section className="how-section" id="how-it-works"><div className="how-heading"><p className="eyebrow">The PhotoGift way</p><h2>From your camera roll<br />to <em>their happy tears.</em></h2></div><div className="steps"><div className="step"><span className="step-number">01</span><div className="step-icon">⌁</div><h3>Choose your feeling</h3><p>Pick a keepsake that feels like them, whether that’s a tiny figure or a gentle portrait.</p></div><div className="step"><span className="step-number">02</span><div className="step-icon">⌑</div><h3>Send us your photo</h3><p>Upload a favorite memory and tell us the little details that make it yours.</p></div><div className="step"><span className="step-number">03</span><div className="step-icon">✦</div><h3>We make the magic</h3><p>Our makers turn your story into something real, ready to keep and give.</p></div></div></section>

      <section className="story-section" id="story"><div className="story-image"><div className="story-image-inner"><span className="story-caption">small things<br /><em>hold big feelings</em></span></div></div><div className="story-copy"><p className="eyebrow">Why we started</p><h2>Some gifts are<br />more than <em>things.</em></h2><p>PhotoGift began with a simple idea: the best gifts don’t just look good. They bring a person back to a moment, a place, or a little face you love.</p><p>So we make custom pieces with warmth, care, and just enough imperfection to feel wonderfully yours.</p><a className="text-link" href="#how-it-works">Meet the makers <span>→</span></a></div></section>

      <footer className="site-footer"><div className="footer-main"><div><a className="brand brand-footer" href="#top"><span className="brand-mark">✦</span><span>Photo<span>Gift</span></span></a><p>Little pieces of the people<br />and pets you love.</p></div><div className="footer-links"><div><p>Explore</p><a href="#shop">All gifts</a><a href="#how-it-works">How it works</a><a href="#story">Our story</a></div><div><p>Need a hand?</p><a href={`mailto:${siteConfig.supportEmail}`}>Contact us</a><a href="/track-order">Track your order</a><a href="/shipping-returns">Shipping & returns</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div><div><p>Stay close</p><span className="footer-note">New stories and shop updates<br />will live here soon.</span></div></div></div><div className="footer-bottom"><span>© 2026 {siteConfig.brandName}</span><span>Made for memories, wherever you are.</span></div></footer>

{bagOpen && <div className="bag-backdrop" role="presentation" onClick={() => setBagOpen(false)}><aside className="bag-drawer" role="dialog" aria-modal="true" aria-labelledby="bag-title" onClick={(event) => event.stopPropagation()}><div className="bag-header"><div><p className="eyebrow">Your little collection</p><h2 id="bag-title">Your bag <span>{cart.length}</span></h2></div><button className="modal-close" aria-label="Close bag" onClick={() => setBagOpen(false)}>×</button></div>{cart.length === 0 ? <div className="empty-bag"><div className="empty-bag-mark">✦</div><h3>Nothing here yet.</h3><p>Choose a memory-making gift and it will appear here.</p><button className="button button-dark" onClick={() => { setBagOpen(false); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}>Browse gifts</button></div> : <><div className="bag-items">{cart.map((item, index) => <div className="bag-item" key={`${item.id}-${index}`}><ProductArt art={item.art} small /><div><p className="product-category">{item.category}</p><h3>{item.name}</h3><strong>${item.price.toFixed(2)}</strong>{item.customization?.photoPath && <small className="bag-customization">Photo saved securely</small>}</div><button className="remove-item" aria-label={`Remove ${item.name}`} onClick={() => setCart((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div><div className="bag-summary"><div><span>Subtotal</span><strong>${(cartSubtotalCents / 100).toFixed(2)}</strong></div>{couponState && <div><span>Discount</span><strong>−${(cartDiscountCents / 100).toFixed(2)}</strong></div>}<div><span>Estimated total</span><strong>${((cartSubtotalCents - cartDiscountCents + cartShippingCents) / 100).toFixed(2)}</strong></div><p>Shipping is free over $49; otherwise $7.99. Payment is added in the next step.</p><div className="coupon-form"><label htmlFor="coupon-code">Coupon code</label><div><input id="coupon-code" value={couponCode} onChange={(event) => { setCouponCode(event.target.value); setCouponState(null); setCouponMessage(""); }} placeholder="WELCOME10" autoComplete="off" /><button type="button" onClick={() => void applyCoupon()} disabled={couponLoading || !couponCode.trim()}>{couponLoading ? "Checking..." : "Apply"}</button></div>{couponMessage && <small>{couponMessage}</small>}</div>{orderState === "created" ? <div className="order-success"><strong>Order {orderNumber} is ready.</strong><span>We saved your request. Payment setup is the next step.</span></div> : checkoutOpen ? <div className="checkout-form"><label htmlFor="customer-email">Email for order updates</label><input id="customer-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /><button className="button button-dark full-button" disabled={orderState === "creating" || !validCustomerEmail} onClick={() => void createOrder()}>{orderState === "creating" ? "Creating order..." : "Create order draft"} <span>↗</span></button><button className="text-link checkout-back" onClick={() => setCheckoutOpen(false)}>Back to bag</button></div> : <button className="button button-dark full-button" onClick={() => setCheckoutOpen(true)}>Continue to checkout <span>↗</span></button>}</div></>}</aside></div>}
      {selectedProduct && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedProduct(null)}><section className="customizer" role="dialog" aria-modal="true" aria-labelledby="customizer-title" aria-describedby="customizer-description" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close customizer" onClick={() => setSelectedProduct(null)}>×</button><div className="customizer-art"><ProductArt art={selectedProduct.art} /></div><div className="customizer-copy"><p className="eyebrow">Make it yours</p><h2 id="customizer-title">{selectedProduct.name}</h2><p className="customizer-price">${selectedProduct.price.toFixed(2)}</p><p id="customizer-description" className="customizer-description">{selectedProduct.description} We’ll check your photo and confirm the details before production.</p><div className="product-details"><span><small>Materials</small>{selectedProduct.materials || (selectedProduct.category === "Digital gifts" ? "High-resolution digital file" : "Made to order from your photo")}</span><span><small>Size</small>{selectedProduct.size || (selectedProduct.category === "Digital gifts" ? "Ready for screen or print" : "Finished size varies by design")}</span><span><small>Lead time</small>{selectedProduct.leadTime || (selectedProduct.category === "Digital gifts" ? "1–2 business days" : "7–14 business days")}</span></div><label className="upload-field"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} /><span className="upload-icon">⌁</span><strong>{uploadState === "uploading" ? "Saving your photo..." : photoUrl ? "Photo ready to preview" : "Upload your photo"}</strong><small>{uploadState === "uploaded" ? "Photo saved securely" : uploadState === "error" ? "Tap to try saving again" : photoUrl ? "Tap to replace" : "JPG, PNG or WEBP · up to 10MB"}</small>{photoUrl && <><img src={photoUrl} alt="Your selected upload" />{photoMeta && <small className={`photo-quality photo-quality-${photoMeta.quality}`}>{photoMeta.quality === "good" ? "Good resolution" : "Lower resolution — a clearer image is recommended"} · {photoMeta.width} × {photoMeta.height}px</small>}{/* Blob previews are intentionally kept as native images because next/image cannot optimize object URLs. */}</>}</label><label className="note-field"><span>Any special details?</span><textarea value={customNote} onChange={(event) => setCustomNote(event.target.value)} placeholder="e.g. blue jacket, sitting together..." rows={3} maxLength={240} /></label><button type="button" className="button button-dark full-button" onClick={() => addToCart(selectedProduct)}>Add to bag · ${selectedProduct.price.toFixed(2)}</button><p className="modal-note">Free shipping over $49 · Preview confirmation included</p></div></section></div>}
      {toast && <div className="toast" role="status">{toast}<span>✓</span></div>}
    </main>
  );
}
