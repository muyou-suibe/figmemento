(() => {
  "use strict";

  const STORAGE_KEY = "figmemento-full-chain-demo-v2";
  const products = [
    {
      id: "couple",
      name: "3D Couple Figure",
      category: "3D keepsakes",
      description: "A small sculptural keepsake with a soft, hand-finished feel.",
      sku: "FM-COUPLE-3D",
      fulfillmentType: "physical",
      productionMode: "made to order",
      leadTime: "8–12 business days",
      basePrice: 128,
      sizes: [["6 cm", "6cm", 0], ["8 cm", "8cm", 22], ["10 cm", "10cm", 44]],
      finishes: [["Matte", "matte", 0], ["Pearl", "pearl", 15]]
    },
    {
      id: "pet",
      name: "Pet Memorial Figure",
      category: "Pet keepsakes",
      description: "A gentle portrait object for a much-loved companion.",
      sku: "FM-PET-MEM",
      fulfillmentType: "physical",
      productionMode: "made to order",
      leadTime: "10–14 business days",
      basePrice: 146,
      sizes: [["8 cm", "8cm", 0], ["10 cm", "10cm", 28]],
      finishes: [["Soft paint", "soft-paint", 0], ["Fine texture", "fine-texture", 18]]
    },
    {
      id: "portrait",
      name: "Craft Portrait",
      category: "Memory pieces",
      description: "A warm framed portrait with room for a short dedication.",
      sku: "FM-CRAFT-PORTRAIT",
      fulfillmentType: "physical",
      productionMode: "made to order",
      leadTime: "6–10 business days",
      basePrice: 98,
      sizes: [["12 × 16 cm", "12x16cm", 0], ["18 × 24 cm", "18x24cm", 36]],
      finishes: [["Print", "print", 0], ["Hand detail", "hand-detail", 24]]
    }
  ];

  const supplierOffers = [
    { id: "supplier-a", name: "Shanghai studio A", offer: "3D figure / standard finish", cost: 44, days: "8–10 production business days" },
    { id: "supplier-b", name: "Shanghai studio B", offer: "3D figure / fine detail", cost: 52, days: "10–12 production business days" }
  ];
  const customerSteps = ["photo_review", "preview_pending", "preview_approved", "in_production", "quality_check"];
  const supplierSteps = ["unassigned", "assigned", "work_order_ready", "submitted_to_supplier", "supplier_confirmed", "in_production", "supplier_completed", "en_route_to_warehouse", "warehouse_received", "warehouse_qc", "ready_for_outbound"];
  const trackingSteps = ["shipment_created", "shipped", "in_transit", "delivered"];
  const pretty = (value) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const initialState = () => ({
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
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function product() { return products.find((item) => item.id === state.selectedProductId) || products[0]; }
  function selectedOption(items, value) { return items.find((item) => item[1] === value) || items[0]; }
  function sizeOption() { return selectedOption(product().sizes, state.selectedSize); }
  function finishOption() { return selectedOption(product().finishes, state.selectedFinish); }
  function unitPrice() { return product().basePrice + sizeOption()[2] + finishOption()[2]; }
  function cartTotal() { return state.cart ? state.cart.unitPrice * state.cart.quantity : 0; }
  function isPaid() { return state.payment === "paid" && Boolean(state.order); }
  function customerComplete() { return state.customerFulfillment === "quality_check"; }
  function supplierComplete() { return state.supplierState === "ready_for_outbound"; }
  function trackingComplete() { return state.trackingState === "delivered"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]); }
  function fallback(label) { return `<div class="discoveryMediaFallback" role="img" aria-label="${escapeHtml(label)} preview unavailable"><span aria-hidden="true">✦</span><small>Marketing preview unavailable</small></div>`; }
  function productMedia(item) { return fallback(`${item.name} marketing`); }

  function render() {
    renderHero();
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

  function renderHero() {
    document.querySelector("#hero-polaroids").innerHTML = products.map((item, index) => `<div class="discoveryPolaroid discoveryPolaroid${index + 1}"><div class="discoveryPolaroidMedia">${productMedia(item)}</div><p>${escapeHtml(item.name)}</p></div>`).join("");
  }

  function renderProducts() {
    document.querySelector("#product-grid").innerHTML = products.map((item) => `<article class="discoveryCard"><a class="discoveryCardLink" href="#customize" data-product="${item.id}" aria-label="Choose ${escapeHtml(item.name)}"><span class="discoveryCardPin" aria-hidden="true"></span><div class="discoveryCardMedia">${productMedia(item)}</div><div class="discoveryCardCopy"><p class="discoveryCardCategory">${escapeHtml(item.category)}</p><h3 class="discoveryCardName">${escapeHtml(item.name)}</h3><p class="discoveryCardDescription">${escapeHtml(item.description)}</p><div class="discoveryCardMeta"><strong>From ${money(item.basePrice)}</strong><span>Available to explore</span></div></div></a></article>`).join("");
  }

  function renderCustomize() {
    const item = product();
    const media = document.querySelector("#product-media");
    media.innerHTML = productMedia(item);
    document.querySelector("#customize-panel").innerHTML = `<div class="fusionPdpTitleBlock"><p class="eyebrow">${escapeHtml(item.category)}</p><h1 class="detailTitle">${escapeHtml(item.name)}</h1><p class="description">${escapeHtml(item.description)}</p></div><p class="listingPrice">${money(unitPrice())}</p><section class="fusionPdpSpec" aria-labelledby="product-spec-heading"><div class="fusionPdpSpecHeading"><span>Product details</span><h2 id="product-spec-heading">At a glance</h2></div><dl class="fulfillment"><div><dt>Delivery format</dt><dd>${item.fulfillmentType}</dd></div><div><dt>Production</dt><dd>${item.productionMode}</dd></div><div><dt>Production lead time</dt><dd>${item.leadTime}</dd></div><div><dt>Shipping</dt><dd>Required</dd></div></dl></section><section class="selector" aria-labelledby="variant-heading"><h2 class="selectorHeading" id="variant-heading">Choose your version</h2><fieldset class="optionGroup"><legend>Size / format</legend><div class="optionValues">${item.sizes.map((option) => `<button class="optionButton ${option[1] === state.selectedSize ? "optionSelected" : ""}" data-size="${option[1]}" type="button">${escapeHtml(option[0])}</button>`).join("")}</div></fieldset><fieldset class="optionGroup"><legend>Material / finish</legend><div class="optionValues">${item.finishes.map((option) => `<button class="optionButton ${option[1] === state.selectedFinish ? "optionSelected" : ""}" data-finish="${option[1]}" type="button">${escapeHtml(option[0])}</button>`).join("")}</div></fieldset><p class="selectionStatus selectionReady" role="status">Selected variant is ready · ${escapeHtml(item.sku)}</p><p class="skuLine"><span>SKU</span><strong>${escapeHtml(item.sku)}</strong></p></section><section class="customizationShell" aria-labelledby="personalize-heading"><h2 class="selectorHeading" id="personalize-heading">Personalize your gift</h2><p>Customer input is summarized locally and is not a production preview.</p><div class="customizationTextField"><label class="customizationFieldLabel" for="custom-note"><span>Short dedication</span><span class="customizationRequirement">Optional</span></label><textarea class="customizationTextarea" id="custom-note" rows="4" maxlength="300" placeholder="A short dedication or production note...">${escapeHtml(state.note)}</textarea><div class="customizationFieldMeta"><span>Development text field</span><span>${state.note.length}/300</span></div></div><div class="customizationImageField"><div class="customizationFieldLabel"><span>Development reference image</span><span class="customizationRequirement">Optional</span></div><div class="customizationImageRequirements"><span>Accepted formats: JPEG, PNG, WebP</span><span>Maximum file size: 4882.8 KB</span><span>Minimum dimensions: 600 × 400px</span></div><section class="customizationImageSlot" aria-label="Image 1"><div class="customizationImageSlotHeader"><h3>Image 1 of 1</h3></div><label class="customizationFileLabel" for="local-photo">Choose image 1</label><input class="customizationFileInput" id="local-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="local-photo-help" /><div class="customizationImagePreview">${state.photo ? `<div class="customizationImagePreviewMedia"><img src="${state.photo.dataUrl}" alt="Customer input preview of ${escapeHtml(state.photo.name)}" /></div><p class="customizationAcceptedMetadata">${escapeHtml(state.photo.name)} · local preview only</p>` : fallback("Customer input")}</div><p class="customizationHelpText" id="local-photo-help">Images are previewed on this device only. No upload or remote URL is created.</p><div class="customizationImageActions"><button class="customizationSecondaryButton" id="remove-photo" type="button" ${state.photo ? "" : "disabled"}>Remove image</button></div></section></div></section><section class="customizationSummary" aria-labelledby="customization-summary-heading"><h2 class="selectorHeading" id="customization-summary-heading">Customization summary</h2><dl class="customizationSummaryList"><div class="customizationSummaryRow"><dt>Variant</dt><dd>${escapeHtml(sizeOption()[0])} · ${escapeHtml(finishOption()[0])}</dd></div><div class="customizationSummaryRow"><dt>Quantity</dt><dd><span class="quantityControl"><button type="button" data-quantity="down" aria-label="Decrease quantity">−</button><output>${state.quantity}</output><button type="button" data-quantity="up" aria-label="Increase quantity">+</button></span></dd></div><div class="customizationSummaryRow"><dt>Dedication</dt><dd class="customizationSummaryLongText">${state.note ? escapeHtml(state.note) : "Not provided"}</dd></div><div class="customizationSummaryRow"><dt>Image</dt><dd>${state.photo ? "Local preview selected" : "Not provided"}</dd></div></dl><p class="customizationSummaryBoundary">Customer input summary — not a production preview.</p></section><section class="customizationHandoffGate"><p class="customizationHandoffReady">Configuration is ready to hand off to the local demo Cart.</p><p class="customizationHandoffBoundary">The browser-local demo stores this selection only in this device.</p></section><div class="cartAction"><button class="primaryLink" id="add-to-cart" type="button">Add to local Cart · ${money(unitPrice() * state.quantity)}</button><p class="cartActionStatus">No server request is made by this static Pages demo.</p></div>`;
  }

  function empty(title, detail) { return `<section class="empty" role="status"><p class="eyebrow">Local demo</p><h2>${title}</h2><p>${detail}</p></section>`; }
  function renderCart() {
    const panel = document.querySelector("#cart-panel");
    if (!state.cart) { panel.innerHTML = empty("Your cart is waiting.", "Select a piece above, choose its options, and add it here to continue the chain."); return; }
    panel.innerHTML = `<div class="cartLayout"><div><p class="eyebrow">Configured item</p><div class="cartLines"><article class="cartLine"><div class="cartLineCopy"><p class="cardCategory">${escapeHtml(state.cart.sku)}</p><h2>${escapeHtml(state.cart.productName)}</h2><p class="cartLineMeta">${escapeHtml(state.cart.sizeLabel)} · ${escapeHtml(state.cart.finishLabel)} · ${state.cart.quantity} unit(s)</p><p class="cartLineMeta">${state.cart.note ? `Dedication: ${escapeHtml(state.cart.note)}` : "No dedication provided"}</p><p class="cartLineMeta">${state.cart.photoName ? "Local reference image selected" : "No reference image"}</p></div><div class="cartLineControls"><strong>${money(cartTotal())}</strong><label>Quantity <input id="cart-quantity" type="number" min="1" max="9" value="${state.cart.quantity}" /></label><button class="cartRemoveButton" id="remove-cart" type="button">Remove</button></div></article></div><div class="cartAction"><button class="primaryLink" data-nav="checkout" type="button">Review local Checkout</button><button class="secondaryButton" id="edit-customization" type="button">Edit customization</button></div></div><aside class="cartSummary" aria-labelledby="cart-summary-heading"><h2 id="cart-summary-heading">Cart summary</h2><p class="cartTotal">${money(cartTotal())}</p><dl class="checkoutTotals"><div><dt>Unit price</dt><dd>${money(state.cart.unitPrice)}</dd></div><div><dt>Quantity</dt><dd>${state.cart.quantity}</dd></div><div class="checkoutTotalRow"><dt>Local subtotal</dt><dd>${money(cartTotal())}</dd></div></dl><p>This browser-local cart is not an Order and does not reserve inventory.</p><button class="secondaryButton" id="clear-cart" type="button">Clear Cart</button></aside></div>`;
  }

  function checkoutField(key, label, full = false) { return `<label class="checkoutField ${full ? "checkoutFieldFull" : ""}">${label}<input class="checkoutInput" data-checkout="${key}" value="${escapeHtml(state.checkout[key])}" ${key === "email" ? "type=\"email\"" : ""} required /></label>`; }
  function renderCheckout() {
    const panel = document.querySelector("#checkout-panel");
    if (!state.cart) { panel.innerHTML = empty("Checkout unlocks after Cart.", "There is no real order transmission in this demo."); return; }
    panel.innerHTML = `<div class="checkoutLayout"><div class="checkoutMain"><p class="eyebrow">Local checkout review</p><h1 class="title">A careful final look<br /><em>before the next step.</em></h1><p class="checkoutIntro">This is a development checkout evaluation. It rechecks the current browser-local Cart and shows a local arithmetic summary.</p><p class="fixtureNotice" role="status">DEVELOPMENT / TEST ONLY — local shipping and coupon fixtures are not production quotes.</p><form class="checkoutForm" id="checkout-form"><fieldset class="checkoutFieldset"><legend class="selectorHeading">Contact</legend>${checkoutField("email", "Email", true)}</fieldset><fieldset class="checkoutFieldset"><legend class="selectorHeading">Shipping address</legend><div class="checkoutFieldGrid">${checkoutField("firstName", "First name")}${checkoutField("lastName", "Last name")}${checkoutField("country", "Country")}${checkoutField("state", "State / province")}${checkoutField("city", "City")}${checkoutField("postal", "Postal code")}${checkoutField("address", "Address line 1", true)}</div></fieldset><fieldset class="checkoutFieldset"><legend class="selectorHeading">Local shipping</legend><label class="checkoutField">Shipping method<select class="checkoutInput"><option>Local standard — $5.00 fixture</option></select></label><p class="checkoutHelp">DEVELOPMENT / TEST ONLY · Local demo estimate: 5–10 business days.</p></fieldset><button class="primaryLink" type="submit">Review local checkout</button></form><div class="checkoutFeedbackSuccess" id="checkout-ready" hidden><h2>Local checkout summary ready</h2><p>This is not a payable amount and does not create an Order or Payment.</p><button class="primaryLink" id="simulate-payment" type="button">Simulate successful Payment</button></div></div><aside class="checkoutSummary" aria-labelledby="checkout-summary-heading"><h2 id="checkout-summary-heading">Local summary</h2><div class="checkoutLines"><article class="checkoutLine"><div><strong>${escapeHtml(state.cart.productName)}</strong><span>${escapeHtml(state.cart.sku)} · Qty ${state.cart.quantity}</span><span>${escapeHtml(state.cart.sizeLabel)} · ${escapeHtml(state.cart.finishLabel)}</span></div><strong>${money(cartTotal())}</strong></article></div><dl class="checkoutTotals"><div><dt>Subtotal</dt><dd>${money(cartTotal())}</dd></div><div><dt>Shipping fixture</dt><dd>$5.00</dd></div><div><dt>Discount</dt><dd>$0.00</dd></div><div><dt>Tax</dt><dd>Not activated</dd></div><div class="checkoutTotalRow"><dt>Local demo total</dt><dd>${money(cartTotal() + 5)}</dd></div></dl><p class="checkoutTaxNotice">Tax is not activated in this local demo. This arithmetic total is not payable, charged, or an Order total.</p></aside></div>`;
  }

  function renderOrder() {
    const panel = document.querySelector("#order-panel");
    if (!state.order) { panel.innerHTML = empty("Your Order reference will appear here.", "Complete the synthetic checkout to create one browser-local Local Order."); return; }
    const item = state.order.item;
    panel.innerHTML = `<div class="checkoutLayout"><div class="checkoutMain"><p class="eyebrow">Local Order created</p><h1 class="title">Your order is held<br /><em>for the next step.</em></h1><p class="fixtureNotice" role="status">DEVELOPMENT / TEST ONLY — This is a process-memory Local Order. No real money was charged.</p><section class="checkoutFeedbackSuccess"><h2>Payment succeeded in the local simulation</h2><p>Canonical reference: <strong>${state.order.orderNumber}</strong></p><p>Payment is a local transition only. No external provider is called.</p></section><section class="fulfillmentCard"><p class="eyebrow">Committed item snapshot</p><h2>${escapeHtml(item.productName)}</h2><p>${escapeHtml(item.sku)} · ${escapeHtml(item.sizeLabel)} · ${escapeHtml(item.finishLabel)} · Qty ${item.quantity}</p><p>Selected options and customer input remain browser-local demo facts.</p></section><div class="paymentActions"><button class="primaryLink" data-nav="fulfillment" type="button">Enter customer Fulfillment</button><button class="secondaryLink" data-nav="supplier" type="button">Open supplier boundary</button></div></div><aside class="checkoutSummary"><h2>Local Order summary</h2><dl class="checkoutTotals"><div><dt>Order reference</dt><dd>${state.order.orderNumber}</dd></div><div><dt>Payment</dt><dd>succeeded</dd></div><div class="checkoutTotalRow"><dt>Local demo total</dt><dd>${money(state.order.total)}</dd></div></dl><p class="checkoutTaxNotice">Arithmetic only · not payable · not an Order authorization.</p></aside></div>`;
  }

  function renderFulfillment() {
    const panel = document.querySelector("#fulfillment-panel");
    if (!state.order) { panel.innerHTML = empty("Fulfillment unlocks after payment.", "Customer preview and production status will be shown after a local Order exists."); return; }
    const index = customerSteps.indexOf(state.customerFulfillment);
    const next = customerSteps[index + 1];
    const nextLabel = { preview_pending: "Move to preview pending", preview_approved: "Approve preview", in_production: "Start customer production", quality_check: "Complete quality check" }[next];
    panel.innerHTML = `<section class="fulfillmentCard"><p class="eyebrow">Customer-facing lifecycle</p><h2>Local Fulfillment</h2><p>Customer approval and production visibility stay separate from supplier operations.</p><p class="fixtureNotice">DEVELOPMENT / TEST ONLY — No production preview or shipping workflow is active.</p><div class="trackingTimeline" aria-label="Customer Fulfillment lifecycle">${customerSteps.map((step, stepIndex) => `<div class="trackingTimelineItem ${stepIndex < index ? "done" : stepIndex === index ? "current" : ""}"><span>${pretty(step)}</span></div>`).join("")}</div><div class="fulfillmentActions">${next ? `<button class="primaryLink" data-customer-transition="${next}" type="button">${nextLabel}</button>` : `<p class="checkoutFeedbackSuccess">Customer Fulfillment is at <strong>quality_check</strong>. This state is terminal for the customer review flow.</p>`}<button class="secondaryLink" data-nav="supplier" type="button">Continue to supplier operations</button></div></section>`;
  }

  function renderSupplier() {
    const panel = document.querySelector("#supplier-panel");
    if (!state.order) { panel.innerHTML = empty("Supplier operations unlock after Order creation.", "Assignment is explicit and never an automatic lowest-price selection."); return; }
    const index = supplierSteps.indexOf(state.supplierState);
    const next = supplierSteps[index + 1];
    const offer = supplierOffers.find((item) => item.id === state.selectedSupplierId);
    const nextLabel = { assigned: "Create Supplier WorkOrder", work_order_ready: "Submit to supplier", submitted_to_supplier: "Confirm supplier acceptance", supplier_confirmed: "Start supplier production", in_production: "Mark supplier completed", supplier_completed: "Send en route to warehouse", en_route_to_warehouse: "Record warehouse receipt", warehouse_received: "Record warehouse receipt", warehouse_qc: "Perform warehouse QC", ready_for_outbound: "Mark ready for outbound" }[next];
    panel.innerHTML = `<div class="operatorToolHeader"><p class="eyebrow">Internal operations</p><h1 class="title">Supplier operations<br /><em>for local review.</em></h1><p class="fixtureNotice">DEVELOPMENT / TEST ONLY — Server-side authority is represented by this deterministic static demo. No supplier API, Shipment, or Tracking integration.</p></div><section class="supplierOperatorNotice"><p><strong>Canonical configured item</strong></p><p>${escapeHtml(state.order.orderNumber)} / ${escapeHtml(state.order.item.orderItemId)} · ${escapeHtml(state.order.item.sku)} · Qty ${state.order.item.quantity}</p><p>Supplier selection is an explicit operator action and uses the committed item snapshot.</p></section>${state.supplierState === "unassigned" ? `<section class="supplierOperatorContent"><h2>Reviewed supplier candidates</h2><div class="supplierTableWrap"><table><caption class="visuallyHidden">Explicit local supplier candidates</caption><thead><tr><th>Supplier</th><th>Offer</th><th>Production</th><th>Action</th></tr></thead><tbody>${supplierOffers.map((item) => `<tr><th scope="row">${escapeHtml(item.name)}</th><td>${escapeHtml(item.offer)}</td><td>${escapeHtml(item.days)}</td><td><button class="secondaryLink" data-supplier="${item.id}" type="button">Choose supplier</button></td></tr>`).join("")}</tbody></table></div></section>` : `<section class="supplierOperatorNotice"><p><strong>Assigned supplier snapshot</strong></p><p>${escapeHtml(offer.name)} · ${escapeHtml(offer.offer)} · ${money(offer.cost)} / unit · ${escapeHtml(offer.days)}</p></section>`}<section class="supplierOperatorContent"><h2>Supplier production lifecycle</h2><div class="supplierTableWrap"><table><caption class="visuallyHidden">Supplier lifecycle</caption><thead><tr><th>Current state</th><th>Next server action</th><th>Authority</th></tr></thead><tbody><tr><th scope="row">${pretty(state.supplierState)}</th><td>${next ? (state.supplierState === "unassigned" ? "Choose supplier above" : `<button class="primaryLink" data-supplier-transition="${next}" type="button">${nextLabel}</button>`) : "Terminal — ready for outbound"}</td><td>Canonical Order item snapshot</td></tr></tbody></table></div></section><p class="supplierOperatorNotice">${offer ? "Supplier operations do not mutate Customer Fulfillment or Order facts." : "Choose one reviewed supplier candidate to continue."}</p>`;
  }

  function renderWarehouse() {
    const panel = document.querySelector("#warehouse-panel");
    if (!state.order || !supplierComplete()) { panel.innerHTML = empty("Warehouse is waiting for production.", "Warehouse receipt and QC become available only after the Supplier WorkOrder reaches ready_for_outbound."); return; }
    const ready = supplierComplete();
    panel.innerHTML = `<div class="operatorToolHeader"><p class="eyebrow">Shanghai warehouse / QC</p><h1 class="title">Receive, inspect,<br /><em>release.</em></h1><p class="fixtureNotice">DEVELOPMENT / TEST ONLY — Receipt and QC are local process-memory actions.</p></div><section class="supplierOperatorNotice"><p><strong>Warehouse receipt</strong> · Recorded</p><p><strong>Quality control</strong> · Accepted</p><p>No Shipment is created by warehouse QC.</p></section><section class="supplierOperatorContent"><h2>Outbound boundary</h2><div class="supplierTableWrap"><table><thead><tr><th>Order / item</th><th>Current state</th><th>Action</th></tr></thead><tbody><tr><th scope="row">${state.order.orderNumber} / ${state.order.item.orderItemId}</th><td>${ready ? "ready_for_outbound" : "pending"}</td><td>${state.shipment ? "Shipment created explicitly" : `<button class="primaryLink" data-create-shipment="true" type="button">Create outbound shipment</button>`}</td></tr></tbody></table></div></section><p class="checkoutFeedbackSuccess">Production is complete. Outbound shipment is not created until the explicit action above.</p>`;
  }

  function renderTracking() {
    const panel = document.querySelector("#tracking-panel");
    if (!state.shipment) { panel.innerHTML = empty("Tracking is not created yet.", "Reach ready_for_outbound, then use the explicit Create outbound shipment action. Shipment is never automatic."); return; }
    const index = trackingSteps.indexOf(state.trackingState);
    const next = trackingSteps[index + 1];
    const nextLabel = { shipped: "Mark Shipped", in_transit: "Mark In Transit", delivered: "Mark Delivered" }[next];
    panel.innerHTML = `<div class="trackingCard"><p class="eyebrow">Customer-facing shipment</p><h2>Shipment ${state.shipment.shipmentNumber}</h2><p class="fixtureNotice">DEVELOPMENT / TEST ONLY — Local Demo Carrier fixture. No live carrier telemetry or 17TRACK lookup.</p><div class="trackingStatus"><span>Current status</span><strong>${pretty(state.trackingState)}</strong></div><dl class="trackingMeta"><div><dt>Tracking number</dt><dd>${state.shipment.trackingNumber}</dd></div><div><dt>Carrier fixture</dt><dd>Local Parcel Simulation</dd></div></dl><ol class="trackingTimeline" aria-label="Local tracking progress">${trackingSteps.map((step, stepIndex) => `<li class="${stepIndex <= index ? "complete" : ""}"><span>${pretty(step)}</span><time>Local demo event</time></li>`).join("")}</ol><div class="operatorToolActions">${next ? `<button class="primaryLink" data-tracking-transition="${next}" type="button">${nextLabel}</button>` : `<p class="trackingTerminal">Terminal state — no further local Tracking action is available.</p>`}</div></div>`;
  }

  function renderEvidence() {
    const rows = [["Order", state.order ? state.order.orderNumber : "not created"], ["Payment", state.payment], ["Customer Fulfillment", state.order ? state.customerFulfillment : "locked"], ["Supplier", state.selectedSupplierId ? supplierOffers.find((item) => item.id === state.selectedSupplierId).name : "unassigned"], ["Supplier lifecycle", state.supplierState], ["Warehouse", supplierComplete() ? "QC complete" : "waiting"], ["Shipment", state.shipment ? state.shipment.shipmentNumber : "not created"], ["Tracking", state.trackingState]];
    document.querySelector("#evidence-grid").innerHTML = rows.map(([label, value]) => `<div class="evidence-item"><span>${label}</span><strong>${escapeHtml(pretty(value))}</strong></div>`).join("");
  }

  function renderNavigation() {
    const count = document.querySelector("#cart-count");
    const quantity = state.cart?.quantity || 0;
    count.textContent = quantity;
    count.hidden = quantity === 0;
  }

  function bindEvents() {
    document.querySelectorAll("[data-product]").forEach((element) => element.addEventListener("click", (event) => { event.preventDefault(); selectProduct(element.dataset.product); }));
    document.querySelectorAll("[data-size]").forEach((element) => element.addEventListener("click", () => { state.selectedSize = element.dataset.size; saveState(); render(); }));
    document.querySelectorAll("[data-finish]").forEach((element) => element.addEventListener("click", () => { state.selectedFinish = element.dataset.finish; saveState(); render(); }));
    document.querySelectorAll("[data-quantity]").forEach((element) => element.addEventListener("click", () => { state.quantity = Math.max(1, Math.min(9, state.quantity + (element.dataset.quantity === "up" ? 1 : -1))); saveState(); render(); }));
    document.querySelectorAll("[data-nav]").forEach((element) => element.addEventListener("click", () => navigate(element.dataset.nav)));
    document.querySelector("#custom-note")?.addEventListener("input", (event) => { state.note = event.target.value.slice(0, 300); saveState(); renderCustomize(); bindEvents(); });
    document.querySelector("#local-photo")?.addEventListener("change", handlePhoto);
    document.querySelector("#remove-photo")?.addEventListener("click", () => { state.photo = null; saveState(); render(); });
    document.querySelector("#add-to-cart")?.addEventListener("click", addToCart);
    document.querySelector("#edit-customization")?.addEventListener("click", () => navigate("customize"));
    document.querySelector("#clear-cart")?.addEventListener("click", () => { state.cart = null; saveState(); render(); });
    document.querySelector("#remove-cart")?.addEventListener("click", () => { state.cart = null; saveState(); render(); });
    document.querySelector("#cart-quantity")?.addEventListener("change", (event) => { const quantity = Math.max(1, Math.min(9, Number(event.target.value) || 1)); state.cart.quantity = quantity; state.quantity = quantity; saveState(); render(); });
    document.querySelector("#checkout-form")?.addEventListener("submit", (event) => { event.preventDefault(); document.querySelector("#checkout-ready").hidden = false; });
    document.querySelectorAll("[data-checkout]").forEach((element) => element.addEventListener("input", (event) => { state.checkout[event.target.dataset.checkout] = event.target.value; saveState(); }));
    document.querySelector("#simulate-payment")?.addEventListener("click", simulatePayment);
    document.querySelectorAll("[data-customer-transition]").forEach((element) => element.addEventListener("click", () => transitionCustomer(element.dataset.customerTransition)));
    document.querySelectorAll("[data-supplier]").forEach((element) => element.addEventListener("click", () => { state.selectedSupplierId = element.dataset.supplier; state.supplierState = "assigned"; saveState(); render(); navigate("supplier"); }));
    document.querySelectorAll("[data-supplier-transition]").forEach((element) => element.addEventListener("click", () => transitionSupplier(element.dataset.supplierTransition)));
    document.querySelector("[data-create-shipment]")?.addEventListener("click", createShipment);
    document.querySelectorAll("[data-tracking-transition]").forEach((element) => element.addEventListener("click", () => transitionTracking(element.dataset.trackingTransition)));
    document.querySelector("#restart-demo")?.addEventListener("click", resetDemo);
    document.querySelector("#menu-button")?.addEventListener("click", toggleMenu);
    document.querySelector(".headerSearch")?.addEventListener("submit", (event) => { event.preventDefault(); navigate("shop"); });
  }

  function selectProduct(id) { const item = products.find((candidate) => candidate.id === id); if (!item) return; state.selectedProductId = id; state.selectedSize = item.sizes[0][1]; state.selectedFinish = item.finishes[0][1]; state.photo = null; saveState(); render(); navigate("customize"); }
  function handlePhoto(event) { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; const reader = new FileReader(); reader.addEventListener("load", () => { state.photo = { name: file.name, dataUrl: reader.result }; saveState(); render(); showToast("Local preview ready — nothing was uploaded."); }); reader.readAsDataURL(file); }
  function addToCart() { const item = product(); state.cart = { productId: item.id, productName: item.name, sku: item.sku, sizeLabel: sizeOption()[0], finishLabel: finishOption()[0], quantity: state.quantity, note: state.note.trim(), photoName: state.photo?.name || null, unitPrice: unitPrice(), fulfillmentType: item.fulfillmentType }; saveState(); render(); navigate("cart"); showToast("Added to the browser-local demo Cart."); }
  function simulatePayment() { if (!state.cart || state.order) return; state.payment = "paid"; state.order = { orderNumber: "DEMO-ORDER-0001", total: cartTotal() + 5, item: { orderItemId: "DEMO-ITEM-0001", productName: state.cart.productName, sku: state.cart.sku, sizeLabel: state.cart.sizeLabel, finishLabel: state.cart.finishLabel, quantity: state.cart.quantity, note: state.cart.note, photoName: state.cart.photoName, fulfillmentType: state.cart.fulfillmentType } }; saveState(); render(); navigate("order"); showToast("Demo payment accepted. Local Order created."); }
  function transitionCustomer(next) { if (customerSteps[customerSteps.indexOf(state.customerFulfillment) + 1] !== next) return; state.customerFulfillment = next; saveState(); render(); showToast(`Customer Fulfillment → ${pretty(next)}`); }
  function transitionSupplier(next) { if (supplierSteps[supplierSteps.indexOf(state.supplierState) + 1] !== next) return; state.supplierState = next; saveState(); render(); showToast(`Supplier lifecycle → ${pretty(next)}`); }
  function createShipment() { if (!supplierComplete() || state.shipment) return; state.shipment = { shipmentNumber: "DEMO-SHIPMENT-0001", trackingNumber: "DEMO-TRACK-0001" }; state.trackingState = "shipment_created"; saveState(); render(); navigate("tracking"); showToast("Explicit outbound Shipment created."); }
  function transitionTracking(next) { if (trackingSteps[trackingSteps.indexOf(state.trackingState) + 1] !== next) return; state.trackingState = next; saveState(); render(); showToast(`Tracking → ${pretty(next)}`); }
  function navigate(section) { document.querySelector(`#${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function toggleMenu() { const button = document.querySelector("#menu-button"); const menu = document.querySelector("#mobile-menu"); const open = button.getAttribute("aria-expanded") === "true"; button.setAttribute("aria-expanded", String(!open)); menu.hidden = open; menu.style.display = open ? "none" : "flex"; }
  function resetDemo() { state = initialState(); saveState(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); showToast("Demo restarted from deterministic initial state."); }
  function showToast(message) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); }

  render();
})();
