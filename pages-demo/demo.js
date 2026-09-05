(() => {
  "use strict";

  const STORAGE_KEY = "figmemento-full-chain-demo-v1";
  const products = [
    {
      id: "couple",
      name: "Custom 3D Couple Figure",
      description: "A small sculptural keepsake with a soft, hand-finished feel.",
      art: "couple",
      badge: "Made for two",
      sku: "FM-COUPLE-3D",
      fulfillmentType: "physical",
      variants: {
        size: [{ label: "6 cm", value: "6cm", delta: 0 }, { label: "8 cm", value: "8cm", delta: 22 }, { label: "10 cm", value: "10cm", delta: 44 }],
        finish: [{ label: "Matte", value: "matte", delta: 0 }, { label: "Pearl", value: "pearl", delta: 15 }]
      },
      basePrice: 128
    },
    {
      id: "pet",
      name: "Pet Memorial Figure",
      description: "A gentle portrait object for a much-loved companion.",
      art: "pet",
      badge: "Remembered",
      sku: "FM-PET-MEM",
      fulfillmentType: "physical",
      variants: {
        size: [{ label: "8 cm", value: "8cm", delta: 0 }, { label: "10 cm", value: "10cm", delta: 28 }],
        finish: [{ label: "Soft paint", value: "soft-paint", delta: 0 }, { label: "Fine texture", value: "fine-texture", delta: 18 }]
      },
      basePrice: 146
    },
    {
      id: "portrait",
      name: "Custom Craft Portrait",
      description: "A warm framed portrait with room for a short dedication.",
      art: "portrait",
      badge: "Studio edition",
      sku: "FM-CRAFT-PORTRAIT",
      fulfillmentType: "physical",
      variants: {
        size: [{ label: "12 × 16 cm", value: "12x16cm", delta: 0 }, { label: "18 × 24 cm", value: "18x24cm", delta: 36 }],
        finish: [{ label: "Print", value: "print", delta: 0 }, { label: "Hand detail", value: "hand-detail", delta: 24 }]
      },
      basePrice: 98
    }
  ];

  const supplierOffers = [
    { id: "supplier-a", name: "Supplier A", specification: "Standard sculpt / matte finish", unitCost: 44, currency: "USD", days: "8–10 business days" },
    { id: "supplier-b", name: "Supplier B", specification: "Fine detail / pearl finish", unitCost: 52, currency: "USD", days: "10–12 business days" }
  ];

  const customerSteps = ["photo_review", "preview_pending", "preview_approved", "in_production", "quality_check"];
  const supplierSteps = ["unassigned", "assigned", "work_order_ready", "submitted_to_supplier", "supplier_confirmed", "in_production", "supplier_completed", "en_route_to_warehouse", "warehouse_received", "warehouse_qc", "ready_for_outbound"];
  const trackingSteps = ["shipment_created", "shipped", "in_transit", "delivered"];
  const pretty = (value) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const money = (value) => `$${value.toFixed(2)}`;

  const initialState = () => ({
    currentSection: "shop",
    selectedProductId: "couple",
    selectedSize: "6cm",
    selectedFinish: "matte",
    quantity: 1,
    note: "",
    photo: null,
    cart: null,
    checkout: { firstName: "Demo", lastName: "Customer", email: "demo@example.invalid", address: "100 Demo Street", city: "San Francisco", state: "CA", postal: "94105", country: "United States" },
    payment: "pending",
    order: null,
    customerFulfillment: "photo_review",
    selectedSupplierId: null,
    supplierState: "unassigned",
    shipment: null,
    trackingState: "not_created"
  });

  let state = loadState();
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved ? { ...initialState(), ...saved, checkout: { ...initialState().checkout, ...(saved.checkout || {}) } } : initialState();
    } catch { return initialState(); }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function selectedProduct() { return products.find((product) => product.id === state.selectedProductId) || products[0]; }
  function selectedSizeOption() { return selectedProduct().variants.size.find((option) => option.value === state.selectedSize) || selectedProduct().variants.size[0]; }
  function selectedFinishOption() { return selectedProduct().variants.finish.find((option) => option.value === state.selectedFinish) || selectedProduct().variants.finish[0]; }
  function currentUnitPrice() { return selectedProduct().basePrice + selectedSizeOption().delta + selectedFinishOption().delta; }
  function cartTotal() { return state.cart ? state.cart.unitPrice * state.cart.quantity : 0; }
  function isPaid() { return state.payment === "paid" && state.order; }
  function isCustomerComplete() { return state.customerFulfillment === "quality_check"; }
  function isSupplierComplete() { return state.supplierState === "ready_for_outbound"; }
  function isTrackingComplete() { return state.trackingState === "delivered"; }

  function htmlEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]);
  }

  function productArt(product, small = false) {
    return `<div class="${small ? "thumb" : "product-art"} ${product.art}">${small ? "" : `<span class="art-object" aria-hidden="true"></span><span class="product-art-label">${product.badge}</span>`}</div>`;
  }

  function render() {
    renderProducts();
    renderCustomize();
    renderCart();
    renderCheckout();
    renderOrder();
    renderFulfillment();
    renderSupplier();
    renderWarehouse();
    renderTracking();
    renderEvidence();
    renderNavigation();
    bindEvents();
  }

  function renderProducts() {
    document.querySelector("#product-grid").innerHTML = products.map((product) => `
      <article class="product-card ${product.id === state.selectedProductId ? "selected" : ""}">
        ${productArt(product)}
        <div class="product-info">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="product-bottom"><span class="price">From ${money(product.basePrice)}</span><button class="select-link" data-product="${product.id}" type="button">${product.id === state.selectedProductId ? "Selected ✓" : "Select piece →"}</button></div>
        </div>
      </article>`).join("");
  }

  function renderCustomize() {
    const product = selectedProduct();
    const panel = document.querySelector("#customize-panel");
    const photo = state.photo;
    panel.innerHTML = `
      <div class="customize-top"><h3>${product.name}</h3><span class="mini-price">${money(currentUnitPrice())} / unit</span></div>
      <div class="field-group"><span class="field-label">Size / format</span><div class="choice-row">${product.variants.size.map((option) => `<button class="choice ${option.value === state.selectedSize ? "selected" : ""}" data-size="${option.value}" type="button">${option.label}</button>`).join("")}</div></div>
      <div class="field-group"><span class="field-label">Material / finish</span><div class="choice-row">${product.variants.finish.map((option) => `<button class="choice ${option.value === state.selectedFinish ? "selected" : ""}" data-finish="${option.value}" type="button">${option.label}</button>`).join("")}</div></div>
      <div class="field-group"><span class="field-label">Quantity</span><div class="quantity-control"><button type="button" data-quantity="down" aria-label="Decrease quantity">−</button><output>${state.quantity}</output><button type="button" data-quantity="up" aria-label="Increase quantity">+</button></div></div>
      <div class="field-group"><label class="field-label" for="custom-note">Custom note <span style="color:var(--quiet);font-weight:400">(optional)</span></label><textarea id="custom-note" placeholder="A short dedication or production note...">${htmlEscape(state.note)}</textarea></div>
      <div class="field-group"><span class="field-label">Photo selection <span style="color:var(--quiet);font-weight:400">(optional)</span></span><div class="upload-box"><input id="local-photo" type="file" accept="image/*" aria-label="Choose a local demo photo" /><p class="upload-help">Images are previewed locally only. No upload or remote URL is created.</p>${photo ? `<div class="local-preview"><img src="${photo.dataUrl}" alt="Local preview of ${htmlEscape(photo.name)}" /><div><strong>${htmlEscape(photo.name)}</strong><span>Local preview only — file is not uploaded.</span></div></div>` : ""}</div></div>
      <div class="action-row"><button class="primary-button" id="add-to-cart" type="button">Add to cart · ${money(currentUnitPrice() * state.quantity)}</button>${state.cart ? `<span class="callout" style="margin:0;padding:9px 11px">Cart ready for review.</span>` : ""}</div>`;
  }

  function renderCart() {
    const panel = document.querySelector("#cart-panel");
    if (!state.cart) {
      panel.innerHTML = `<div class="panel-empty"><strong>Your cart is waiting.</strong>Select a piece above, choose its options, and add it here to continue the chain.</div>`;
      return;
    }
    panel.innerHTML = `<div class="cart-layout"><div class="card-pad"><div class="line-item">${productArt(products.find((item) => item.id === state.cart.productId), true)}<div><h3>${state.cart.productName}</h3><p>${htmlEscape(state.cart.sizeLabel)} · ${htmlEscape(state.cart.finishLabel)} · ${state.cart.quantity} ×<br />${state.cart.note ? `Note: ${htmlEscape(state.cart.note)}` : "No custom note"}</p></div><span class="line-price">${money(cartTotal())}</span></div><div class="action-row"><button class="primary-button" data-nav="checkout" type="button">Proceed to checkout →</button><button class="ghost-button" id="edit-customization" type="button">Edit customization</button></div></div><div class="card-pad"><h3 class="mini-heading">Cart summary</h3><div class="summary-list"><div class="summary-row"><span>Unit price</span><strong>${money(state.cart.unitPrice)}</strong></div><div class="summary-row"><span>Quantity</span><strong>${state.cart.quantity}</strong></div><div class="summary-row total"><span>Subtotal</span><strong>${money(cartTotal())}</strong></div></div><div class="callout">Cart state is retained in this browser for the duration of the demo.</div></div></div>`;
  }

  function renderCheckout() {
    const panel = document.querySelector("#checkout-panel");
    if (!state.cart) { panel.innerHTML = `<div class="panel-empty"><strong>Checkout unlocks after Cart.</strong>There is no real order transmission in this demo.</div>`; return; }
    const field = (key, label, full = false) => `<div class="form-field ${full ? "full" : ""}"><label for="checkout-${key}">${label}</label><input class="text-input" id="checkout-${key}" data-checkout="${key}" value="${htmlEscape(state.checkout[key])}" /></div>`;
    panel.innerHTML = `<div class="checkout-layout"><div class="card-pad"><h3 class="mini-heading">Synthetic delivery details</h3><div class="form-grid">${field("firstName", "First name")}${field("lastName", "Last name")}${field("email", "Email", true)}${field("address", "Address", true)}${field("city", "City")}${field("state", "State / province")}${field("postal", "Postal code")}${field("country", "Country")}</div><div class="callout">Synthetic demo address — no order is transmitted.</div></div><div class="card-pad payment-card"><div><span class="eyebrow" style="color:var(--mint)">Payment boundary</span><h3 class="mini-heading">Ready for a simulation?</h3><p>There is no card form here. The next action creates a synthetic local order in this browser.</p><div class="payment-state">Current payment state: <strong>${state.payment}</strong></div></div><button class="primary-button" id="simulate-payment" type="button">${state.payment === "paid" ? "Payment simulated ✓" : "Simulate successful payment"}</button></div></div>`;
  }

  function renderOrder() {
    const panel = document.querySelector("#order-panel");
    if (!state.order) { panel.innerHTML = `<div class="panel-empty"><strong>Your order reference will appear here.</strong>Complete the synthetic checkout to create one browser-local order.</div>`; return; }
    const item = state.order.item;
    panel.innerHTML = `<div class="order-layout"><div class="card-pad"><div class="state-header"><div><span class="eyebrow">Canonical local reference</span><h3>${state.order.orderNumber}</h3><p>Payment is recorded as a demo-only local transition.</p></div><span class="state-pill">paid</span></div><div class="order-facts"><div class="fact"><span>Order item</span><strong>${item.orderItemId}</strong></div><div class="fact"><span>Product</span><strong>${item.productName}</strong></div><div class="fact"><span>Variant / SKU</span><strong>${item.sizeLabel} · ${item.finishLabel}<br />${item.sku}</strong></div><div class="fact"><span>Selected options</span><strong>size, finish, quantity, note${item.photoName ? ", local photo" : ""}</strong></div><div class="fact"><span>Fulfillment type</span><strong>${item.fulfillmentType}</strong></div><div class="fact"><span>Total</span><strong>${money(state.order.total)}</strong></div></div></div><div class="card-pad"><h3 class="mini-heading">What happens next</h3><p style="color:var(--muted);font-size:13px;line-height:1.65">The customer fulfillment state and the supplier production state are separate records in this rehearsal.</p><div class="action-row"><button class="primary-button" data-nav="fulfillment" type="button">Enter customer fulfillment →</button></div><div class="callout">Order facts are synthetic and browser-local. No Order API or database is contacted.</div></div></div>`;
  }

  function renderFulfillment() {
    const panel = document.querySelector("#fulfillment-panel");
    if (!state.order) { panel.innerHTML = `<div class="panel-empty"><strong>Fulfillment unlocks after payment.</strong>Customer review and production status will be shown independently from supplier operations.</div>`; return; }
    const index = customerSteps.indexOf(state.customerFulfillment);
    const next = customerSteps[index + 1];
    panel.innerHTML = `<div class="card-pad"><div class="state-header"><div><span class="eyebrow">Customer-facing lifecycle</span><h3>Customer Fulfillment</h3><p>Approval and production visibility for the customer-side experience.</p></div><span class="state-pill">${pretty(state.customerFulfillment)}</span></div><div class="timeline">${customerSteps.map((step, stepIndex) => `<div class="timeline-step ${stepIndex < index ? "done" : stepIndex === index ? "current" : ""}">${pretty(step)}</div>`).join("")}</div><div class="action-row">${next ? `<button class="primary-button" data-customer-transition="${next}" type="button">${next === "preview_pending" ? "Move to preview pending" : next === "preview_approved" ? "Approve preview" : next === "in_production" ? "Start customer production" : "Complete quality check"}</button>` : `<span class="callout" style="margin:0">Customer fulfillment is at quality_check.</span>`}<button class="secondary-button" data-nav="supplier" type="button">${isCustomerComplete() ? "Continue to supplier operations →" : "View supplier boundary"}</button></div></div>`;
  }

  function renderSupplier() {
    const panel = document.querySelector("#supplier-panel");
    if (!state.order) { panel.innerHTML = `<div class="panel-empty"><strong>Supplier operations unlock after order creation.</strong>Assignment is an explicit operator action, never an automatic lowest-price selection.</div>`; return; }
    const index = supplierSteps.indexOf(state.supplierState);
    const next = supplierSteps[index + 1];
    const offer = supplierOffers.find((item) => item.id === state.selectedSupplierId);
    const offerMarkup = state.supplierState === "unassigned" ? `<div class="offer-grid">${supplierOffers.map((item) => `<button class="offer-card ${item.id === state.selectedSupplierId ? "selected" : ""}" data-supplier="${item.id}" type="button"><h4>${item.name}</h4><p>${item.specification}<br />${item.days}</p><strong>${money(item.unitCost)} / unit · ${item.currency}</strong></button>`).join("")}</div>` : `<div class="callout"><strong>${offer.name}</strong> assigned with immutable demo snapshot: ${offer.specification} · ${money(offer.unitCost)} ${offer.currency} · ${offer.days}.</div>`;
    const nextLabel = { assigned: "Create supplier work order", work_order_ready: "Submit to supplier", submitted_to_supplier: "Confirm supplier acceptance", supplier_confirmed: "Start supplier production", in_production: "Mark supplier completed", supplier_completed: "Send en route to warehouse", en_route_to_warehouse: "Record warehouse receipt", warehouse_received: "Perform warehouse QC", warehouse_qc: "Mark ready for outbound" }[next];
    panel.innerHTML = `<div class="card-pad"><div class="state-header"><div><span class="eyebrow">Operator-facing lifecycle</span><h3>Supplier Production</h3><p>Separate from Customer Fulfillment. The supplier state will stop at outbound readiness.</p></div><span class="state-pill neutral">${pretty(state.supplierState)}</span></div>${offerMarkup}<div class="timeline">${supplierSteps.map((step, stepIndex) => `<div class="timeline-step ${stepIndex < index ? "done" : stepIndex === index ? "current" : ""}">${pretty(step)}</div>`).join("")}</div><div class="action-row">${state.supplierState === "unassigned" ? `<button class="primary-button" id="assign-supplier" type="button" ${state.selectedSupplierId ? "" : "disabled"}>Assign Supplier</button>` : next ? `<button class="primary-button" data-supplier-transition="${next}" type="button">${nextLabel}</button>` : `<span class="callout" style="margin:0">Supplier production is ready for outbound.</span>`}</div>${offer ? `<div class="independent-grid" style="margin-top:20px"><div class="independent-card"><span class="eyebrow">Supplier Work Order</span><strong>${state.order.orderNumber} / ${state.order.item.orderItemId}</strong><small>Quantity is owned by the canonical order item: ${state.order.item.quantity}.</small></div><div class="independent-card"><span class="eyebrow">Customer state remains</span><strong>${pretty(state.customerFulfillment)}</strong><small>Supplier actions do not mutate customer fulfillment facts.</small></div></div>` : ""}</div>`;
  }

  function renderWarehouse() {
    const panel = document.querySelector("#warehouse-panel");
    if (!state.order || supplierSteps.indexOf(state.supplierState) < supplierSteps.indexOf("en_route_to_warehouse")) { panel.innerHTML = `<div class="panel-empty"><strong>Warehouse is waiting for production.</strong>Receipt is only available after the supplier work reaches en_route_to_warehouse.</div>`; return; }
    const warehouseState = state.supplierState;
    const ready = warehouseState === "ready_for_outbound";
    panel.innerHTML = `<div class="card-pad"><div class="state-header"><div><span class="eyebrow">Warehouse handoff</span><h3>${ready ? "Ready for outbound" : "Warehouse checkpoint"}</h3><p>Receipt and QC are explicit operator actions.</p></div><span class="state-pill ${ready ? "dark" : "neutral"}">${pretty(warehouseState)}</span></div><div class="independent-grid"><div class="independent-card"><span class="eyebrow">Warehouse receipt</span><strong>${["warehouse_received", "warehouse_qc", "ready_for_outbound"].includes(warehouseState) ? "Recorded" : "Awaiting action"}</strong><small>Only after en_route_to_warehouse.</small></div><div class="independent-card"><span class="eyebrow">Quality control</span><strong>${["warehouse_qc", "ready_for_outbound"].includes(warehouseState) ? "Complete" : "Pending"}</strong><small>No shipment is created by QC.</small></div></div>${ready ? `<div class="boundary-card"><strong>Production is complete. Outbound shipment has NOT been created.</strong><p>Shipment and tracking are created only by the separate, explicit action below.</p><div class="action-row"><button class="primary-button" data-create-shipment="true" type="button">Create outbound shipment</button></div></div>` : `<div class="action-row"><button class="secondary-button" data-nav="supplier" type="button">Return to supplier action →</button></div>`}</div>`;
  }

  function renderTracking() {
    const panel = document.querySelector("#tracking-panel");
    if (!state.shipment) { panel.innerHTML = `<div class="panel-empty"><strong>Tracking is not created yet.</strong>Reach ready_for_outbound, then use the explicit Create outbound shipment action. Shipment is never automatic.</div>`; return; }
    const index = trackingSteps.indexOf(state.trackingState);
    const next = trackingSteps[index + 1];
    const nextLabel = { shipped: "Mark shipped", in_transit: "Mark in transit", delivered: "Mark delivered" }[next];
    panel.innerHTML = `<div class="card-pad"><div class="state-header"><div><span class="eyebrow">Customer-facing shipment</span><h3>Shipment ${state.shipment.shipmentNumber}</h3><p>Same synthetic order reference, safe public tracking projection.</p></div><span class="state-pill">${pretty(state.trackingState)}</span></div><div class="timeline">${trackingSteps.map((step, stepIndex) => `<div class="timeline-step ${stepIndex < index ? "done" : stepIndex === index ? "current" : ""}">${pretty(step)}</div>`).join("")}</div><div class="independent-grid"><div class="independent-card"><span class="eyebrow">Tracking number</span><strong>${state.shipment.trackingNumber}</strong><small>Demo carrier: Local Parcel Simulation</small></div><div class="independent-card"><span class="eyebrow">Supplier remains</span><strong>${pretty(state.supplierState)}</strong><small>Tracking lifecycle is separate from supplier production.</small></div></div><div class="action-row">${next ? `<button class="primary-button" data-tracking-transition="${next}" type="button">${nextLabel}</button>` : `<span class="callout" style="margin:0">Delivered is terminal. No next tracking action.</span>`}</div></div>`;
  }

  function renderEvidence() {
    const entries = [
      ["Customer Order", state.order ? state.order.orderNumber : "not created"],
      ["Payment", state.payment],
      ["Customer Fulfillment", state.order ? state.customerFulfillment : "locked"],
      ["Supplier Assignment", state.selectedSupplierId ? supplierOffers.find((item) => item.id === state.selectedSupplierId).name : "unassigned"],
      ["Supplier Work Order", state.supplierState],
      ["Warehouse", state.supplierState === "ready_for_outbound" ? "QC complete" : state.supplierState],
      ["Shipment", state.shipment ? state.shipment.shipmentNumber : "not created"],
      ["Tracking", state.trackingState]
    ];
    document.querySelector("#evidence-grid").innerHTML = entries.map(([label, value]) => `<div class="evidence-item"><span>${label}</span><strong>${htmlEscape(pretty(value))}</strong></div>`).join("");
  }

  function completionCount() { return [state.selectedProductId, state.cart, state.order, isCustomerComplete(), state.selectedSupplierId, state.supplierState === "ready_for_outbound", state.shipment, isTrackingComplete()].filter(Boolean).length + (state.payment === "paid" ? 1 : 0); }

  function renderNavigation() {
    const completed = { shop: Boolean(state.selectedProductId), customize: Boolean(state.cart), cart: Boolean(state.cart), checkout: Boolean(state.order), order: Boolean(state.order), fulfillment: isCustomerComplete(), supplier: Boolean(state.selectedSupplierId), warehouse: isSupplierComplete(), tracking: isTrackingComplete() };
    document.querySelectorAll(".step-link").forEach((link) => { const name = link.dataset.nav; link.classList.toggle("active", state.currentSection === name); link.classList.toggle("done", completed[name] && state.currentSection !== name); });
    document.querySelector("#progress-count").textContent = `${completionCount()} / 9`;
  }

  function bindEvents() {
    document.querySelectorAll("[data-nav]").forEach((element) => element.addEventListener("click", () => navigate(element.dataset.nav)));
    document.querySelectorAll("[data-product]").forEach((element) => element.addEventListener("click", () => selectProduct(element.dataset.product)));
    document.querySelectorAll("[data-size]").forEach((element) => element.addEventListener("click", () => { state.selectedSize = element.dataset.size; saveState(); render(); }));
    document.querySelectorAll("[data-finish]").forEach((element) => element.addEventListener("click", () => { state.selectedFinish = element.dataset.finish; saveState(); render(); }));
    document.querySelectorAll("[data-quantity]").forEach((element) => element.addEventListener("click", () => { state.quantity = Math.max(1, Math.min(9, state.quantity + (element.dataset.quantity === "up" ? 1 : -1))); saveState(); render(); }));
    document.querySelector("#custom-note")?.addEventListener("input", (event) => { state.note = event.target.value.slice(0, 300); saveState(); });
    document.querySelector("#local-photo")?.addEventListener("change", handlePhoto);
    document.querySelector("#add-to-cart")?.addEventListener("click", addToCart);
    document.querySelector("#edit-customization")?.addEventListener("click", () => navigate("customize"));
    document.querySelector("#simulate-payment")?.addEventListener("click", simulatePayment);
    document.querySelectorAll("[data-checkout]").forEach((element) => element.addEventListener("input", (event) => { state.checkout[event.target.dataset.checkout] = event.target.value; saveState(); }));
    document.querySelectorAll("[data-customer-transition]").forEach((element) => element.addEventListener("click", () => transitionCustomer(element.dataset.customerTransition)));
    document.querySelectorAll("[data-supplier]").forEach((element) => element.addEventListener("click", () => { state.selectedSupplierId = element.dataset.supplier; saveState(); render(); }));
    document.querySelector("#assign-supplier")?.addEventListener("click", assignSupplier);
    document.querySelectorAll("[data-supplier-transition]").forEach((element) => element.addEventListener("click", () => transitionSupplier(element.dataset.supplierTransition)));
    document.querySelector("[data-create-shipment]")?.addEventListener("click", createShipment);
    document.querySelectorAll("[data-tracking-transition]").forEach((element) => element.addEventListener("click", () => transitionTracking(element.dataset.trackingTransition)));
    document.querySelector("#reset-demo")?.addEventListener("click", resetDemo);
    document.querySelector("#restart-demo")?.addEventListener("click", resetDemo);
  }

  function selectProduct(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    state.selectedProductId = productId; state.selectedSize = product.variants.size[0].value; state.selectedFinish = product.variants.finish[0].value; state.photo = null; saveState(); render(); navigate("customize");
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) { showToast("Please choose an image file."); return; }
    const reader = new FileReader();
    reader.addEventListener("load", () => { state.photo = { name: file.name, dataUrl: reader.result }; saveState(); render(); showToast("Local preview ready — nothing was uploaded."); });
    reader.readAsDataURL(file);
  }

  function addToCart() {
    const product = selectedProduct();
    state.cart = { productId: product.id, productName: product.name, sku: product.sku, size: state.selectedSize, sizeLabel: selectedSizeOption().label, finish: state.selectedFinish, finishLabel: selectedFinishOption().label, quantity: state.quantity, note: state.note.trim(), photoName: state.photo?.name || null, unitPrice: currentUnitPrice(), fulfillmentType: product.fulfillmentType };
    saveState(); render(); navigate("cart"); showToast("Added to the browser-local demo cart.");
  }

  function simulatePayment() {
    if (!state.cart || state.payment === "paid") return;
    state.payment = "paid";
    state.order = { orderNumber: "DEMO-ORDER-0001", total: cartTotal(), item: { orderItemId: "DEMO-ITEM-0001", productName: state.cart.productName, sku: state.cart.sku, sizeLabel: state.cart.sizeLabel, finishLabel: state.cart.finishLabel, quantity: state.cart.quantity, note: state.cart.note, photoName: state.cart.photoName, fulfillmentType: state.cart.fulfillmentType } };
    saveState(); render(); navigate("order"); showToast("Demo payment accepted. Local order created.");
  }

  function transitionCustomer(next) { if (customerSteps[customerSteps.indexOf(state.customerFulfillment) + 1] !== next) return; state.customerFulfillment = next; saveState(); render(); showToast(`Customer fulfillment → ${pretty(next)}`); }
  function assignSupplier() { if (!state.selectedSupplierId) return; state.supplierState = "assigned"; saveState(); render(); showToast("Supplier assignment snapshot created."); }
  function transitionSupplier(next) { if (supplierSteps[supplierSteps.indexOf(state.supplierState) + 1] !== next) return; state.supplierState = next; saveState(); render(); showToast(`Supplier lifecycle → ${pretty(next)}`); }
  function createShipment() { if (!isSupplierComplete() || state.shipment) return; state.shipment = { shipmentNumber: "DEMO-SHIPMENT-0001", trackingNumber: "DEMO-TRACK-0001" }; state.trackingState = "shipment_created"; saveState(); render(); navigate("tracking"); showToast("Explicit outbound shipment created."); }
  function transitionTracking(next) { if (trackingSteps[trackingSteps.indexOf(state.trackingState) + 1] !== next) return; state.trackingState = next; saveState(); render(); showToast(`Tracking → ${pretty(next)}`); }

  function navigate(section) {
    state.currentSection = section; saveState(); renderNavigation(); document.querySelector(`#${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetDemo() { state = initialState(); saveState(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); showToast("Demo restarted from deterministic initial state."); }
  function showToast(message) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); }

  render();
})();
