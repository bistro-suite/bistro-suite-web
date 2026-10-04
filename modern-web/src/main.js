import m from "mithril";
import "./styles.css";

let products = [];
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const storageKey = "bistro-demo-cart-v1";
const orderAttemptKey = "bistro-demo-order-attempt-v1";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const bistroSlug = import.meta.env.VITE_BISTRO_SLUG || "demo-bistro";
const adminDemo = {
  enabled: import.meta.env.VITE_ADMIN_DEMO_ENABLED === "true",
  readOnly: import.meta.env.VITE_ADMIN_DEMO_READ_ONLY === "true",
  email: import.meta.env.VITE_ADMIN_DEMO_EMAIL || "",
  password: import.meta.env.VITE_ADMIN_DEMO_PASSWORD || "",
  message: import.meta.env.VITE_ADMIN_DEMO_MESSAGE || "Puedes explorar el panel. En este modo demo no está permitido agregar, quitar ni modificar información.",
};

function readCart() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
    if (!Array.isArray(saved)) return [];
    return saved.filter((line) => typeof line.productId === "string" && typeof line.lineId === "string" && Number.isInteger(line.quantity) && line.quantity > 0 && typeof line.note === "string");
  } catch {
    return [];
  }
}

function readOrderAttempt() {
  try {
    const key = sessionStorage.getItem(orderAttemptKey);
    return key && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key) ? key : "";
  } catch { return ""; }
}

function newOrderAttemptKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
    const value = Math.floor(Math.random() * 16);
    return (letter === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function resetOrderAttempt() {
  state.checkoutIdempotencyKey = "";
  try { sessionStorage.removeItem(orderAttemptKey); } catch { /* Keep the in-memory cart flow available. */ }
}

const state = {
  category: "Todo",
  query: "",
  selected: null,
  cartOpen: false,
  checkoutOpen: false,
  checkoutMethod: "delivery",
  checkoutIdempotencyKey: readOrderAttempt(),
  checkoutBusy: false,
  checkoutError: "",
  orderConfirmation: null,
  cart: readCart(),
  dialogQuantity: 1,
  dialogNote: "",
  notice: "",
  dialogReturnFocus: null,
  drawerReturnFocus: null,
  menuStatus: "loading",
  menuError: "",
  menuMeta: null,
};

function normalizeProduct(product) {
  if (!product || (typeof product.id !== "string" && typeof product.id !== "number") || typeof product.name !== "string" || !product.name.trim() || !Number.isSafeInteger(product.price_cop) || product.price_cop < 0 || typeof product.available !== "boolean") {
    throw new Error("El API devolvió un producto con campos no válidos.");
  }

  const imageUrl = typeof product.image_url === "string" && (/^https:\/\//i.test(product.image_url) || /^\/(?!\/)/.test(product.image_url))
    ? (product.image_url.startsWith("/storage/") && apiBaseUrl ? `${apiBaseUrl}${product.image_url}` : product.image_url)
    : null;

  return {
    id: String(product.id),
    name: String(product.name),
    category: typeof product.category === "string" && product.category.trim() ? product.category : "La carta",
    description: typeof product.description === "string" ? product.description : "",
    price_cop: product.price_cop,
    available: product.available === true,
    image_url: imageUrl,
    illustration: typeof product.illustration === "string" ? product.illustration : "🍽️",
    tag: typeof product.tag === "string" ? product.tag : "",
  };
}

function loadMenu() {
  state.menuStatus = "loading";
  state.menuError = "";

  return m.request({ method: "GET", url: `${apiBaseUrl}/api/v1/public/bistros/${encodeURIComponent(bistroSlug)}/menu`, background: true })
    .then((response) => {
      if (!response || !Array.isArray(response.data)) throw new Error("El API devolvió una carta inválida.");
      products = response.data.map(normalizeProduct).filter((product) => product.available);
      state.menuMeta = response.meta || {};

      const availableIds = new Set(products.map((product) => product.id));
      const validCart = state.cart.filter((line) => availableIds.has(line.productId));
      if (validCart.length !== state.cart.length) {
        state.cart = validCart;
        try { sessionStorage.setItem(storageKey, JSON.stringify(validCart)); } catch { state.notice = "No pudimos actualizar el carrito guardado."; }
        state.notice ||= "Se quitaron del carrito productos que ya no están disponibles.";
      }

      state.menuStatus = "ready";
    })
    .catch(() => {
      state.menuStatus = "error";
      state.menuError = "No pudimos cargar la carta. Comprueba tu conexión e inténtalo de nuevo.";
    })
    .finally(() => m.redraw());
}

function setQuantity(lineId, next) {
  if (state.checkoutBusy) return;
  resetOrderAttempt();
  const updated = next < 1 ? state.cart.filter((line) => line.lineId !== lineId) : state.cart.map((line) => line.lineId === lineId ? { ...line, quantity: next } : line);
  state.cart = updated;
  try { sessionStorage.setItem(storageKey, JSON.stringify(updated)); } catch { state.notice = "No pudimos guardar el carrito en esta pestaña."; }
}

function cartItems() {
  return state.cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ ...product, ...line }] : [];
  });
}
function cartCount() { return state.cart.reduce((sum, line) => sum + line.quantity, 0); }
function cartTotal() { return cartItems().reduce((sum, item) => sum + item.price_cop * item.quantity, 0); }
function configuredDeliveryFee() {
  return state.checkoutMethod === "delivery" ? state.menuMeta?.fulfillment?.delivery_fee_cop || 0 : 0;
}
function addToCart(product) {
  resetOrderAttempt();
  const lineId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.cart = [...state.cart, { lineId, productId: product.id, quantity: state.dialogQuantity, note: state.dialogNote.trim() }];
  try { sessionStorage.setItem(storageKey, JSON.stringify(state.cart)); } catch { state.notice = "No pudimos guardar el carrito en esta pestaña."; }
  state.dialogReturnFocus = null;
  state.drawerReturnFocus = document.querySelector(".cart-button");
  state.selected = null;
  state.orderConfirmation = null;
  state.cartOpen = true;
  state.notice = `${state.dialogQuantity} × ${product.name} se añadió al carrito.`;
  state.dialogQuantity = 1;
  state.dialogNote = "";
}
function dismissNotice() { state.notice = ""; }
function openCart() { state.drawerReturnFocus = document.activeElement; state.cartOpen = true; }
function closeCart() {
  if (state.checkoutBusy) return;
  state.cartOpen = false;
  state.checkoutOpen = false;
  requestAnimationFrame(() => state.drawerReturnFocus?.focus?.());
}

function submitOrder(event) {
  event.preventDefault();
  if (!state.cart.length || state.checkoutBusy) return;
  const form = new FormData(event.currentTarget);
  const payload = {
    idempotency_key: state.checkoutIdempotencyKey || (state.checkoutIdempotencyKey = newOrderAttemptKey()),
    customer_name: String(form.get("customer_name")).trim(),
    customer_phone: String(form.get("customer_phone")).trim(),
    customer_email: String(form.get("customer_email")).trim() || null,
    fulfillment_method: String(form.get("fulfillment_method")),
    neighborhood: String(form.get("neighborhood") || "").trim() || null,
    delivery_address: String(form.get("delivery_address") || "").trim() || null,
    items: cartItems().map((item) => ({ product_id: Number(item.id), quantity: item.quantity, note: item.note || null })),
  };
  state.checkoutBusy = true;
  state.checkoutError = "";
  try { sessionStorage.setItem(orderAttemptKey, state.checkoutIdempotencyKey); } catch { /* The key remains stable while the page stays open. */ }
  m.request({ method: "GET", url: `${apiBaseUrl}/sanctum/csrf-cookie`, background: true })
    .then(() => m.request({
      method: "POST",
      url: `${apiBaseUrl}/api/v1/public/bistros/${encodeURIComponent(bistroSlug)}/orders`,
      body: payload,
      headers: csrfHeaders(),
      background: true,
    }))
    .then((response) => {
      state.orderConfirmation = response.data;
      state.cart = [];
      try { sessionStorage.removeItem(storageKey); } catch { /* The confirmed order must remain visible. */ }
      resetOrderAttempt();
      state.checkoutOpen = false;
    })
    .catch((error) => {
      state.checkoutError = error?.response?.errors?.items?.[0] || Object.values(error?.response?.errors || {})[0]?.[0] || "No pudimos enviar el pedido. Revisa tu conexión e inténtalo de nuevo.";
    })
    .finally(() => { state.checkoutBusy = false; m.redraw(); });
}

function ProductArt({ product, className }) {
  return m(`span.${className}`, product.image_url
    ? m("img", { src: product.image_url, alt: product.name, loading: "lazy" })
    : m("span", { "aria-hidden": "true" }, product.illustration));
}

function ProductCard(product) {
  return m("article.product-card", { key: product.id }, [
    m("button.product-open", {
      type: "button",
      "aria-label": `Ver ${product.name}, ${money.format(product.price_cop)}`,
      onclick: () => { state.dialogReturnFocus = document.activeElement; state.dialogQuantity = 1; state.dialogNote = ""; state.selected = product; },
    }, [
      ProductArt({ product, className: "product-art" }),
      m("span.product-copy", [
        m("span.product-category", product.category),
        m("strong", product.name),
        m("span.product-description", product.description),
        m("span.product-price", money.format(product.price_cop)),
      ]),
      m("span.open-indicator", { "aria-hidden": "true" }, "+"),
    ]),
  ]);
}

function ProductDialog() {
  const product = state.selected;
  if (!product) return null;
  return m("div.dialog-backdrop", {
    onclick: (event) => { if (event.target === event.currentTarget) closeDialog(); },
    oncreate: ({ dom }) => {
      document.body.classList.add("overlay-open");
      dom.querySelector("button")?.focus();
      dom.addEventListener("keydown", trapDialogFocus);
    },
    onremove: () => document.body.classList.remove("overlay-open"),
  }, m("section.product-dialog", { role: "dialog", "aria-modal": "true", "aria-labelledby": "detail-title", "aria-describedby": "detail-description" }, [
    m("button.icon-button.dialog-close", { type: "button", "aria-label": "Cerrar detalle", onclick: closeDialog }, "×"),
    ProductArt({ product, className: "dialog-art" }),
    m("div.dialog-content", [
      m("span.eyebrow", product.category),
      m("h2#detail-title", product.name),
      m("p#detail-description", product.description),
      product.tag ? m("span.tag", product.tag) : null,
      m("div.dialog-order", [
        m("label.note-label", [m("span", "Nota para este plato · opcional"), m("textarea", { maxlength: 180, rows: 2, placeholder: "Ej.: sin cebolla", value: state.dialogNote, oninput: (event) => { state.dialogNote = event.target.value; } })]),
        m("div.dialog-actions", [
          m("div.quantity-control.dialog-quantity", [m("button", { type: "button", "aria-label": "Quitar una unidad", disabled: state.dialogQuantity <= 1, onclick: () => { state.dialogQuantity = Math.max(1, state.dialogQuantity - 1); } }, "−"), m("span", { "aria-label": `Cantidad: ${state.dialogQuantity}` }, state.dialogQuantity), m("button", { type: "button", "aria-label": "Añadir una unidad", onclick: () => { state.dialogQuantity += 1; } }, "+")]),
          m("strong.dialog-price", money.format(product.price_cop * state.dialogQuantity)),
          m("button.button.button-primary", { type: "button", onclick: () => addToCart(product) }, "Añadir al carrito"),
        ]),
      ]),
    ]),
  ]));
}

function closeDialog() {
  state.selected = null;
  requestAnimationFrame(() => state.dialogReturnFocus?.focus?.());
}
function trapDialogFocus(event) {
  if (event.key === "Escape") { closeDialog(); return; }
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll("button:not([disabled]), a[href], [tabindex='0']")];
  if (!items.length) return;
  if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
}

function CartDrawer() {
  if (!state.cartOpen) return null;
  const items = cartItems();
  const fulfillment = state.menuMeta?.fulfillment || {};
  const methods = [
    ...(fulfillment.delivery_enabled ? [{ value: "delivery", label: `Domicilio · ${money.format(fulfillment.delivery_fee_cop || 0)}` }] : []),
    ...(fulfillment.pickup_enabled ? [{ value: "pickup", label: `Pasar por el local${fulfillment.pickup_address ? ` · ${fulfillment.pickup_address}` : ""}` }] : []),
  ];
  if (state.orderConfirmation) return m("div.drawer-backdrop", {
    onclick: (event) => { if (event.target === event.currentTarget) closeCart(); },
    oncreate: ({ dom }) => { document.body.classList.add("overlay-open"); dom.querySelector("button")?.focus(); dom.addEventListener("keydown", trapDrawerFocus); },
    onremove: () => document.body.classList.remove("overlay-open"),
  }, m("aside.cart-drawer", { role: "dialog", "aria-modal": "true", "aria-labelledby": "cart-title" }, [
    m("header.drawer-header", [m("div", [m("span.eyebrow", "Pedido recibido"), m("h2#cart-title", "Gracias por elegirnos")]), m("button.icon-button", { type: "button", "aria-label": "Cerrar confirmación", onclick: () => { state.orderConfirmation = null; closeCart(); } }, "×")]),
    m("section.order-confirmation", [m("span.order-check", { "aria-hidden": "true" }, "✓"), m("p", "Tu pedido quedó registrado con el número"), m("strong.order-reference", state.orderConfirmation.reference), m("p", `Productos: ${money.format(state.orderConfirmation.subtotal_cop)}.`), state.orderConfirmation.delivery_fee_cop > 0 ? m("p", `Domicilio: ${money.format(state.orderConfirmation.delivery_fee_cop)}.`) : null, m("strong", `Total: ${money.format(state.orderConfirmation.total_cop)}.`), m("p", "El pago se coordina con el bistró por teléfono. No se realizó ningún cobro en línea."), m("button.button.button-primary", { type: "button", onclick: () => { state.orderConfirmation = null; closeCart(); } }, "Volver a la carta")]),
  ]));
  return m("div.drawer-backdrop", {
    onclick: (event) => { if (event.target === event.currentTarget) closeCart(); },
    oncreate: ({ dom }) => { document.body.classList.add("overlay-open"); dom.querySelector("button")?.focus(); dom.addEventListener("keydown", trapDrawerFocus); },
    onremove: () => document.body.classList.remove("overlay-open"),
  }, m("aside.cart-drawer", { role: "dialog", "aria-modal": "true", "aria-labelledby": "cart-title" }, [
    m("header.drawer-header", [m("div", [m("span.eyebrow", "Tu selección"), m("h2#cart-title", "Carrito")]), m("button.icon-button", { type: "button", "aria-label": "Cerrar carrito", onclick: closeCart }, "×")]),
    items.length ? m("div.drawer-items", items.map((item) => m("article.cart-line", { key: item.lineId }, [
      ProductArt({ product: item, className: "cart-art" }),
      m("div.cart-line-copy", [m("strong", item.name), m("span", money.format(item.price_cop)), item.note ? m("span.cart-note", `Nota: ${item.note}`) : null]),
      m("div.quantity-control", [
        m("button", { type: "button", "aria-label": `Quitar una unidad de ${item.name}`, onclick: () => setQuantity(item.lineId, item.quantity - 1) }, "−"),
        m("span", { "aria-label": `Cantidad: ${item.quantity}` }, item.quantity),
        m("button", { type: "button", "aria-label": `Añadir una unidad de ${item.name}`, onclick: () => setQuantity(item.lineId, item.quantity + 1) }, "+"),
      ]),
    ]))) : m("div.cart-empty", [m("span.empty-art", { "aria-hidden": "true" }, "🥣"), m("h3", "Tu carrito está vacío"), m("p", "Cuando encuentres algo que te guste, aparecerá aquí."), m("button.button.button-secondary", { type: "button", onclick: () => { closeCart(); document.querySelector(".menu-heading")?.scrollIntoView({ behavior: "smooth" }); } }, "Explorar la carta")]),
    items.length && state.checkoutOpen ? m("form.checkout-form", { onsubmit: submitOrder }, [
      m("span.eyebrow", "DATOS DEL PEDIDO"),
      state.checkoutError ? m("p.admin-message.is-error", { role: "alert" }, state.checkoutError) : null,
      m("label", ["Nombre", m("input", { name: "customer_name", autocomplete: "name", maxlength: 120, required: true })]),
      m("label", ["Teléfono de contacto", m("input", { name: "customer_phone", type: "tel", autocomplete: "tel", maxlength: 32, required: true })]),
      m("label", ["Correo (opcional)", m("input", { name: "customer_email", type: "email", autocomplete: "email", maxlength: 254 })]),
      m("label", ["¿Cómo recibes tu pedido?", m("select", { name: "fulfillment_method", value: state.checkoutMethod, onchange: (event) => { state.checkoutMethod = event.target.value; } }, methods.map((method) => m("option", { value: method.value }, method.label)))]),
      state.checkoutMethod === "delivery" ? [
        m("label", ["Barrio", m("select", { name: "neighborhood", required: true }, [m("option", { value: "" }, "Elige tu barrio"), (fulfillment.delivery_neighborhoods || []).map((neighborhood) => m("option", { value: neighborhood }, neighborhood))])]),
        m("label", ["Dirección", m("input", { name: "delivery_address", autocomplete: "street-address", maxlength: 255, required: true })]),
      ] : null,
      state.checkoutMethod === "pickup" && fulfillment.pickup_address ? m("p.checkout-note", `Recoge en: ${fulfillment.pickup_address}`) : null,
      fulfillment.is_demo ? m("p.checkout-note", "Zonas, tarifas y dirección son datos de muestra; el bistró debe confirmarlos antes de usarlos.") : null,
      m("div.total-row.checkout-total", [m("span", state.checkoutMethod === "delivery" ? `Productos + domicilio (${money.format(configuredDeliveryFee())})` : "Total de productos"), m("strong", money.format(cartTotal() + configuredDeliveryFee()))]),
      m("p.checkout-note", "El pago se coordina directamente con el bistró; no se cobra en línea."),
      m("div.admin-form-actions", [m("button.button.button-secondary", { type: "button", onclick: () => { state.checkoutOpen = false; state.checkoutError = ""; } }, "Volver al carrito"), m("button.button.button-primary", { type: "submit", disabled: state.checkoutBusy || !methods.length }, state.checkoutBusy ? "Enviando…" : `Confirmar · ${money.format(cartTotal() + configuredDeliveryFee())}`)]),
    ]) : items.length ? m("footer.drawer-footer", [m("div.total-row", [m("span", "Total de productos"), m("strong", money.format(cartTotal()))]), m("p.checkout-note#checkout-note", "Elige una opción de entrega al continuar. No se cobra en línea."), m("button.button.button-primary", { type: "button", disabled: !methods.length, onclick: () => { state.checkoutOpen = true; state.checkoutMethod = fulfillment.delivery_enabled ? "delivery" : "pickup"; state.checkoutError = ""; } }, methods.length ? "Continuar con el pedido" : "Pedidos no disponibles")]) : null,
  ]));
}
function trapDrawerFocus(event) {
  if (event.key === "Escape") { closeCart(); return; }
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll("button:not([disabled]), a[href], [tabindex='0']")];
  if (!items.length) return;
  if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
}

function MenuContent() {
  if (state.menuStatus === "loading") {
    return m("div.menu-loading", { role: "status", "aria-live": "polite" }, [
      m("span.sr-only", "Cargando la carta"),
      m("div.product-grid", Array.from({ length: 3 }, (_, index) => m("div.menu-skeleton", { key: index, "aria-hidden": "true" }, [m("span"), m("div", [m("span"), m("span"), m("span")])]))),
    ]);
  }

  if (state.menuStatus === "error") {
    return m("div.menu-error", { role: "alert" }, [
      m("span", { "aria-hidden": "true" }, "⌁"),
      m("p", state.menuError),
      m("button.button.button-secondary", { type: "button", onclick: loadMenu }, "Intentar de nuevo"),
    ]);
  }

  const categories = ["Todo", ...new Set(products.map((product) => product.category))];
  const visible = products.filter((product) => (state.category === "Todo" || product.category === state.category) && `${product.name} ${product.description}`.toLocaleLowerCase("es").includes(state.query.trim().toLocaleLowerCase("es")));

  return m("div.menu-content", [
    m("div.category-list", { role: "group", "aria-label": "Filtrar por categoría" }, categories.map((category) => m("button.category-chip", { type: "button", class: state.category === category ? "is-active" : "", "aria-pressed": state.category === category, onclick: () => { state.category = category; } }, category))),
    visible.length ? m("div.product-grid", visible.map((product) => ProductCard(product))) : products.length ? m("div.empty-results", [m("span", { "aria-hidden": "true" }, "⌕"), m("h3", "No encontramos ese plato"), m("p", "Prueba con otro nombre o cambia la categoría."), m("button.text-button", { type: "button", onclick: () => { state.query = ""; state.category = "Todo"; } }, "Ver toda la carta")]) : m("div.empty-results", [m("span", { "aria-hidden": "true" }, "🥣"), m("h3", "La carta está en preparación"), m("p", "Vuelve pronto para descubrir los platos disponibles.")]),
  ]);
}

const App = {
  oninit() { loadMenu(); },
  view() {
    return m("div.site-shell", [
      m("header.site-header", [
        m("a.brand", { href: "#inicio", "aria-label": "Bistró, ir al inicio" }, [m("span.brand-mark", { "aria-hidden": "true" }, "b"), m("span", [m("strong", "bistró"), m("small", state.menuMeta?.demo ? "carta de muestra" : "carta del día")])]),
        m("nav.header-actions", { "aria-label": "Acciones" }, [
          m("span.header-note", state.menuMeta?.demo ? "Menú de ejemplo" : "Carta del bistró"),
          adminDemo.enabled ? m("a.button.admin-entry", { href: "/admin" }, "Panel administrativo") : null,
          m("button.button.cart-button", { type: "button", onclick: openCart, "aria-haspopup": "dialog", "aria-expanded": state.cartOpen }, [m("span", "Tu carrito"), m("span.cart-badge", { "aria-label": `${cartCount()} productos` }, cartCount())]),
        ]),
      ]),
      m("main#inicio", [
        m("section.hero", [m("div.hero-text", [m("span.eyebrow", [m("span.eyebrow-dot"), "Una carta para descubrir"]), m("h1", ["Comer bien, ", m("em", "sin prisa.")]), m("p", "Platos sencillos, ingredientes que hablan por sí solos y un buen motivo para sentarse a la mesa."), m("a.hero-link", { href: "#la-carta" }, ["Explorar la carta ", m("span", "↓")])]), m("div.hero-visual", { "aria-hidden": "true" }, [m("div.plate", [m("span", "🥗")]), m("span.hero-sparkle", "✳"), m("span.hero-caption", "Hecho para compartir")])]),
        m("section.menu-section#la-carta", [
          m("div.menu-heading", [m("div", [m("span.eyebrow", "Algo rico te espera"), m("h2", "La carta")]), m("label.search-box", [m("span.sr-only", "Buscar en la carta"), m("span", { "aria-hidden": "true" }, "⌕"), m("input", { type: "search", placeholder: "Buscar un plato", value: state.query, disabled: state.menuStatus !== "ready", oninput: (event) => { state.query = event.target.value; } })])]),
          state.menuMeta?.notice ? m("p.menu-notice", state.menuMeta.notice) : null,
          MenuContent(),
        ]),
      ]),
      m("footer.site-footer", [m("span", [m("span.footer-mark", "b"), " bistró"]), m("span", state.menuMeta?.demo ? "Carta de muestra · precios ilustrativos" : "Carta del bistró"), m("a", { href: "/admin" }, "Administrar carta"), m("a", { href: "#inicio" }, "Volver arriba ↑")]),
      state.notice ? m("div.toast", { role: "status" }, [m("span", { "aria-hidden": "true" }, "✓"), state.notice, m("button", { type: "button", "aria-label": "Cerrar aviso", onclick: dismissNotice }, "×")]) : null,
      ProductDialog(), CartDrawer(),
    ]);
  },
};

const admin = { user: null, products: [], orders: [], orderQuery: "", orderStatusFilter: "all", selectedOrder: null, orderReturnFocus: null, settings: null, activeTab: "orders", form: null, file: null, loading: true, busy: false, error: "", notice: "", blockedAction: "" };
const blankProduct = () => ({ name: "", description: "", category: "Platos principales", price_cop: 0, available: true, tag: "", illustration: "🍽️" });

function blockDemoMutation(action) {
  if (!adminDemo.readOnly) return false;
  admin.blockedAction = action;
  return true;
}

function csrfHeaders() {
  const token = document.cookie.split("; ").find((part) => part.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
  return { Accept: "application/json", ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}) };
}

function adminRequest(method, url, data) {
  return m.request({ method, url: `${apiBaseUrl}${url}`, body: data, headers: csrfHeaders(), background: true });
}

function loadAdmin(showLoading = true) {
  if (showLoading) admin.loading = true;
  admin.error = "";
  return adminRequest("GET", "/api/v1/auth/user")
    .then((response) => {
      admin.user = response.data;
      return Promise.all([adminRequest("GET", "/api/v1/admin/products"), adminRequest("GET", "/api/v1/admin/orders"), adminRequest("GET", "/api/v1/admin/settings")]);
    })
    .then(([productResponse, orderResponse, settingsResponse]) => {
      admin.products = productResponse.data.map(normalizeProduct);
      admin.orders = orderResponse.data;
      admin.settings = settingsResponse.data;
      admin.loading = false;
    })
    .catch((error) => {
      admin.loading = false;
      admin.user = null;
      if (error?.code !== 401 && error?.code !== 419) admin.error = "No pudimos cargar el panel. Intenta de nuevo.";
    }).finally(() => m.redraw());
}

function loginAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  admin.busy = true;
  admin.error = "";
  m.request({ method: "GET", url: `${apiBaseUrl}/sanctum/csrf-cookie`, background: true })
    .then(() => adminRequest("POST", "/api/v1/auth/login", { email: values.get("email"), password: values.get("password") }))
    .then(() => loadAdmin())
    .catch((error) => { admin.error = error?.response?.errors?.email?.[0] || "No pudimos iniciar sesión. Revisa tus datos."; })
    .finally(() => { admin.busy = false; m.redraw(); });
}

function saveAdminProduct(event) {
  event.preventDefault();
  if (blockDemoMutation("guardar este producto")) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  const payload = {
    name: String(values.get("name")).trim(), description: String(values.get("description")).trim(),
    category: String(values.get("category")).trim(), price_cop: Number(values.get("price_cop")),
    available: values.get("available") === "on", tag: String(values.get("tag")).trim(), illustration: admin.form.illustration || "🍽️",
  };
  const existingId = admin.form.id;
  const method = existingId ? "PUT" : "POST";
  const endpoint = existingId ? `/api/v1/admin/products/${existingId}` : "/api/v1/admin/products";
  admin.busy = true;
  admin.error = "";
  adminRequest(method, endpoint, payload)
    .then((response) => {
      const product = response.data;
      if (!admin.file) return product;
      const upload = new FormData();
      upload.set("image", admin.file);
      return adminRequest("POST", `/api/v1/admin/products/${product.id}/image`, upload).then((result) => result.data);
    })
    .then((product) => {
      admin.notice = `${product.name} se guardó correctamente.`;
      admin.form = null;
      admin.file = null;
      return loadAdmin();
    })
    .catch((error) => { admin.error = Object.values(error?.response?.errors || {})[0]?.[0] || "No pudimos guardar el producto. Revisa los campos e inténtalo de nuevo."; })
    .finally(() => { admin.busy = false; m.redraw(); });
}

function deleteAdminProduct(product) {
  if (blockDemoMutation(`eliminar “${product.name}”`)) return;
  if (!window.confirm(`¿Eliminar “${product.name}” de la carta?`)) return;
  admin.busy = true;
  adminRequest("DELETE", `/api/v1/admin/products/${product.id}`)
    .then(() => { admin.notice = `${product.name} se eliminó.`; return loadAdmin(); })
    .catch(() => { admin.error = "No pudimos eliminar el producto."; })
    .finally(() => { admin.busy = false; m.redraw(); });
}

function logoutAdmin() {
  adminRequest("POST", "/api/v1/auth/logout").finally(() => { admin.user = null; admin.form = null; m.redraw(); });
}

function updateOrderStatus(order, status) {
  if (blockDemoMutation("cambiar el estado del pedido")) return;
  admin.busy = true;
  admin.error = "";
  adminRequest("PATCH", `/api/v1/admin/orders/${order.id}/status`, { status })
    .then((response) => {
      admin.orders = admin.orders.map((item) => item.id === order.id ? response.data : item);
      if (admin.selectedOrder?.id === order.id) admin.selectedOrder = response.data;
      admin.notice = `${order.reference}: ${orderStatusLabel(status).toLocaleLowerCase("es")} correctamente.`;
    })
    .catch((error) => { admin.error = error?.response?.message || "No pudimos actualizar el estado del pedido."; })
    .finally(() => { admin.busy = false; m.redraw(); });
}

function openOrderDetails(order, event) {
  admin.orderReturnFocus = event.currentTarget;
  admin.selectedOrder = order;
}

function closeOrderDetails() {
  admin.selectedOrder = null;
  requestAnimationFrame(() => admin.orderReturnFocus?.focus());
}

function AdminOrderDetails() {
  const order = admin.selectedOrder;
  if (!order) return null;
  const isDelivery = order.fulfillment_method === "delivery";
  return m("div.admin-dialog-backdrop", {
    onclick: (event) => { if (event.target === event.currentTarget) closeOrderDetails(); },
    onkeydown: (event) => { if (event.key === "Escape") { event.preventDefault(); closeOrderDetails(); } },
  }, m("section.admin-order-dialog", { role: "dialog", "aria-modal": "true", "aria-labelledby": "admin-order-title", oncreate: (vnode) => vnode.dom.querySelector("button")?.focus() }, [
    m("header.admin-dialog-header", [m("div", [m("span.eyebrow", `${order.reference} · ${orderDate(order.created_at)}`), m("h2#admin-order-title", "Detalle del pedido")]), m("button.admin-dialog-close", { type: "button", "aria-label": "Cerrar detalle", onclick: closeOrderDetails }, "×")]),
    m("div.admin-dialog-scroll", [
      m("div.admin-dialog-status", [m("span.admin-order-status", { class: `status-${order.status}` }, orderStatusLabel(order.status)), m("span", isDelivery ? `Domicilio · ${order.neighborhood}` : "Recogida en el local")]),
      m("section.admin-detail-section", [m("h3", "Cliente"), m("div.admin-detail-grid", [m("span", "Nombre"), m("strong", order.customer_name), m("span", "Teléfono"), m("a", { href: `tel:${order.customer_phone}` }, order.customer_phone), order.customer_email ? [m("span", "Correo"), m("a", { href: `mailto:${order.customer_email}` }, order.customer_email)] : null])]),
      m("section.admin-detail-section", [m("h3", isDelivery ? "Dirección de entrega" : "Punto de recogida"), m("p.admin-detail-address", isDelivery ? order.delivery_address : order.pickup_address || "Dirección no registrada")]),
      m("section.admin-detail-section", [m("h3", `Pedido · ${order.items.reduce((sum, item) => sum + item.quantity, 0)} artículos`), m("div.admin-dialog-items", order.items.map((item, index) => m("div.admin-dialog-line", { key: `${order.id}-detail-${index}` }, [m("div", [m("strong", `${item.quantity} × ${item.product_name}`), m("small", `${money.format(item.unit_price_cop)} por unidad`), item.note ? m("p", `Nota: ${item.note}`) : null]), m("strong", money.format(item.line_total_cop))])))]),
      m("section.admin-detail-section.admin-total-breakdown", [m("div", [m("span", "Productos"), m("span", money.format(order.subtotal_cop))]), isDelivery ? m("div", [m("span", "Domicilio"), m("span", money.format(order.delivery_fee_cop || 0))]) : null, m("div.admin-grand-total", [m("strong", "Total del pedido"), m("strong", money.format(order.total_cop))])]),
    ]),
    m("footer.admin-dialog-footer", [m("button.button.button-secondary", { type: "button", onclick: closeOrderDetails }, "Cerrar"), m("div.admin-order-actions", [order.allowed_next_statuses.includes("confirmed") ? m("button.button.button-primary", { type: "button", disabled: admin.busy, onclick: () => updateOrderStatus(order, "confirmed") }, "Confirmar pedido") : null, order.allowed_next_statuses.includes("delivered") ? m("button.button.button-primary", { type: "button", disabled: admin.busy, onclick: () => updateOrderStatus(order, "delivered") }, "Marcar entregado") : null, order.allowed_next_statuses.includes("cancelled") ? m("button.text-button.admin-delete", { type: "button", disabled: admin.busy, onclick: () => { if (window.confirm(`¿Cancelar el pedido ${order.reference}?`)) updateOrderStatus(order, "cancelled"); } }, "Cancelar") : null])]),
  ]));
}

function orderStatusLabel(status) {
  return ({ pending: "Pendiente", confirmed: "Confirmado", cancelled: "Cancelado", delivered: "Entregado" })[status] || status;
}

function orderDate(value) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

function filteredAdminOrders() {
  const query = normalizeSearch(admin.orderQuery);
  return admin.orders.filter((order) => {
    const matchesStatus = admin.orderStatusFilter === "all" || order.status === admin.orderStatusFilter;
    const matchesQuery = !query || normalizeSearch(`${order.reference} ${order.customer_name} ${order.customer_phone} ${order.customer_email || ""}`).includes(query);
    return matchesStatus && matchesQuery;
  });
}

function saveBistroSettings(event) {
  event.preventDefault();
  if (blockDemoMutation("guardar la configuración")) return;
  const values = new FormData(event.currentTarget);
  const payload = {
    delivery_enabled: values.get("delivery_enabled") === "on",
    delivery_fee_cop: Number(values.get("delivery_fee_cop")),
    delivery_neighborhoods: String(values.get("delivery_neighborhoods")).split("\n").map((value) => value.trim()).filter(Boolean),
    pickup_enabled: values.get("pickup_enabled") === "on",
    pickup_address: String(values.get("pickup_address")).trim() || null,
  };
  admin.busy = true;
  admin.error = "";
  adminRequest("PATCH", "/api/v1/admin/settings", payload)
    .then((response) => { admin.settings = response.data; admin.notice = "La configuración de entrega se guardó."; })
    .catch((error) => { admin.error = Object.values(error?.response?.errors || {})[0]?.[0] || "No pudimos guardar los ajustes."; })
    .finally(() => { admin.busy = false; m.redraw(); });
}

function BistroSettingsForm() {
  if (!admin.settings) return m("p", { role: "status" }, "Cargando configuración…");
  return m("form.admin-form.settings-editor", { onsubmit: saveBistroSettings }, [
    m("div", [m("span.eyebrow", "ENTREGA Y RECOGIDA"), m("h2", "Opciones para tus clientes"), m("p", "Los cambios se reflejan enseguida en la carta y el checkout.")]),
    admin.settings.is_demo ? m("p.admin-message", "Estos valores iniciales son de muestra. Reemplázalos y confirma las zonas y tarifas antes de usar el demo con clientes.") : null,
    m("label.admin-check", [m("input", { name: "delivery_enabled", type: "checkbox", checked: admin.settings.delivery_enabled }), "Ofrecer domicilio"]),
    m("label", ["Barrios cubiertos · uno por línea", m("textarea", { name: "delivery_neighborhoods", rows: 6, maxlength: 12000, value: admin.settings.delivery_neighborhoods.join("\n") }), m("small", "El checkout solo aceptará barrios incluidos aquí.")]),
    m("label", ["Tarifa de domicilio (COP)", m("input", { name: "delivery_fee_cop", type: "number", min: 0, max: 100000000, step: 500, required: true, value: admin.settings.delivery_fee_cop })]),
    m("label.admin-check", [m("input", { name: "pickup_enabled", type: "checkbox", checked: admin.settings.pickup_enabled }), "Permitir recoger en el local"]),
    m("label", ["Dirección del local", m("input", { name: "pickup_address", maxlength: 255, value: admin.settings.pickup_address || "", required: admin.settings.pickup_enabled }), m("small", "Se muestra a los clientes que eligen recoger su pedido.")]),
    m("div.admin-form-actions", [m("button.button.button-primary", { type: "submit", disabled: admin.busy }, admin.busy ? "Guardando…" : "Guardar configuración")]),
  ]);
}

function DemoRestrictionDialog() {
  if (!admin.blockedAction) return null;
  const close = () => { admin.blockedAction = ""; };
  return m("div.admin-dialog-backdrop", {
    onclick: (event) => { if (event.target === event.currentTarget) close(); },
    onkeydown: (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } },
  }, m("section.demo-restriction-dialog", { role: "dialog", "aria-modal": "true", "aria-labelledby": "demo-restriction-title", "aria-describedby": "demo-restriction-copy", oncreate: (vnode) => vnode.dom.querySelector("button")?.focus() }, [
    m("span.demo-restriction-icon", { "aria-hidden": "true" }, "✓"),
    m("span.eyebrow", "BISTRO SUITE · MODO DEMO"),
    m("h2#demo-restriction-title", "Acción no disponible"),
    m("p#demo-restriction-copy", adminDemo.message),
    m("small", `Acción: ${admin.blockedAction}. No se guardó ningún cambio.`),
    m("button.button.button-primary", { type: "button", onclick: close }, "Entendido"),
  ]));
}

function AdminApp() {
  if (admin.loading) return m("main.admin-shell", m("p", { role: "status" }, "Cargando tu espacio…"));
  if (!admin.user) return m("main.admin-shell", m("section.admin-login", [
    m("a.brand.admin-brand", { href: "/" }, [m("span.brand-mark", "b"), m("span", [m("strong", "bistró"), m("small", "gestión de carta")])]),
    m("span.eyebrow", "ADMINISTRACIÓN"), m("h1", "Tu carta, bajo control"), m("p", "Ingresa con la cuenta de administración de tu bistró."),
    adminDemo.enabled ? m("div.demo-login-card", [m("span.eyebrow", adminDemo.readOnly ? "ACCESO DE DEMOSTRACIÓN · SOLO LECTURA" : "ACCESO DE DEMOSTRACIÓN"), m("p", "Las credenciales ya están preparadas para que explores el portal."), m("span", [m("strong", "Usuario"), ` ${adminDemo.email}`]), m("span", [m("strong", "Contraseña"), ` ${adminDemo.password}`])]) : null,
    admin.error ? m("p.admin-message.is-error", { role: "alert" }, admin.error) : null,
    m("form.admin-form", { onsubmit: loginAdmin }, [
      m("label", ["Correo electrónico", m("input", { name: "email", type: "email", autocomplete: "username", required: true, value: adminDemo.enabled ? adminDemo.email : "" })]),
      m("label", ["Contraseña", m("input", { name: "password", type: "password", autocomplete: "current-password", required: true, value: adminDemo.enabled ? adminDemo.password : "" })]),
      m("button.button.button-primary", { type: "submit", disabled: admin.busy }, admin.busy ? "Ingresando…" : adminDemo.enabled ? "Entrar al panel de muestra" : "Ingresar"),
    ]), m("a.admin-back", { href: "/" }, "← Volver a la carta"),
  ]));

  const categories = [...new Set(admin.products.map((product) => product.category))];
  const visibleOrders = filteredAdminOrders();
  const orderFilters = [
    ["all", "Todos"], ["pending", "Pendientes"], ["confirmed", "Confirmados"], ["delivered", "Entregados"], ["cancelled", "Cancelados"],
  ];
  return m("main.admin-shell", [
    m("header.admin-header", [m("a.brand.admin-brand", { href: "/" }, [m("span.brand-mark", "b"), m("span", [m("strong", "bistró"), m("small", "gestión de carta")])]), m("div", [adminDemo.readOnly ? m("span.demo-readonly-badge", "Demo · Solo lectura") : null, m("span.admin-account", `${admin.user.bistro?.name || "Bistró"} · ${admin.user.name}`), m("button.text-button", { type: "button", onclick: logoutAdmin }, "Cerrar sesión")])]),
    m("section.admin-content", [
      adminDemo.readOnly ? m("p.demo-readonly-banner", [m("strong", "Estás en modo de solo lectura."), ` ${adminDemo.message}`]) : null,
      m("nav.admin-tabs", { "aria-label": "Administración del bistró" }, [
        m("button.admin-tab", { type: "button", class: admin.activeTab === "orders" ? "is-active" : "", onclick: () => { admin.activeTab = "orders"; admin.form = null; admin.notice = ""; } }, `Pedidos · ${admin.orders.filter((order) => order.status === "pending").length} pendientes`),
        m("button.admin-tab", { type: "button", class: admin.activeTab === "products" ? "is-active" : "", onclick: () => { admin.activeTab = "products"; admin.notice = ""; } }, "Productos"),
        m("button.admin-tab", { type: "button", class: admin.activeTab === "settings" ? "is-active" : "", onclick: () => { admin.activeTab = "settings"; admin.form = null; admin.notice = ""; } }, "Entrega y recogida"),
      ]),
      admin.activeTab === "orders" ? m("div.admin-title-row", [m("div", [m("span.eyebrow", "ATENCIÓN AL CLIENTE"), m("h1", "Pedidos recibidos"), m("p", "Los pedidos más recientes de tu bistró, con sus datos de contacto y entrega.")]), m("button.button.button-secondary", { type: "button", disabled: admin.busy, onclick: () => loadAdmin(false) }, "Actualizar")]) : admin.activeTab === "products" ? m("div.admin-title-row", [m("div", [m("span.eyebrow", "TU NEGOCIO"), m("h1", "Productos de la carta"), m("p", `${admin.products.length} productos · ${categories.length} categorías`)]), m("button.button.button-primary", { type: "button", onclick: () => { if (blockDemoMutation("agregar un producto")) return; admin.form = blankProduct(); admin.file = null; admin.error = ""; } }, "+ Nuevo producto")]) : m("div.admin-title-row", [m("div", [m("span.eyebrow", "CONFIGURACIÓN"), m("h1", "Entrega y recogida"), m("p", "Define dónde y cómo pueden recibir sus pedidos.")])]),
      admin.notice ? m("p.admin-message", { role: "status" }, admin.notice) : null,
      admin.error ? m("p.admin-message.is-error", { role: "alert" }, admin.error) : null,
      admin.activeTab === "orders" ? m("div.admin-order-browser", [
        m("div.admin-order-tools", [m("label.admin-order-search", [m("span", { "aria-hidden": "true" }, "⌕"), m("span.sr-only", "Buscar por referencia o cliente"), m("input", { type: "search", placeholder: "Referencia o nombre del cliente", value: admin.orderQuery, oninput: (event) => { admin.orderQuery = event.target.value; } }), admin.orderQuery ? m("button", { type: "button", "aria-label": "Limpiar búsqueda", onclick: () => { admin.orderQuery = ""; } }, "×") : null]), m("span.admin-order-result-count", `${visibleOrders.length} de ${admin.orders.length} pedidos`)]),
        m("div.admin-order-filters", { role: "group", "aria-label": "Filtrar pedidos por estado" }, orderFilters.map(([status, label]) => {
          const count = status === "all" ? admin.orders.length : admin.orders.filter((order) => order.status === status).length;
          return m("button.admin-order-filter", { type: "button", class: admin.orderStatusFilter === status ? "is-active" : "", "aria-pressed": admin.orderStatusFilter === status, onclick: () => { admin.orderStatusFilter = status; } }, [label, m("span", count)]);
        })),
        m("section.admin-orders", { "aria-label": "Pedidos" }, visibleOrders.length ? visibleOrders.map((order) => m("article.admin-order", { key: order.id }, [
        m("header.admin-order-header", [m("div", [m("span.eyebrow", `${order.reference} · ${orderDate(order.created_at)}`), m("h2", order.customer_name)]), m("span.admin-order-status", { class: `status-${order.status}` }, orderStatusLabel(order.status))]),
        m("div.admin-order-summary", [m("span", order.fulfillment_method === "delivery" ? `Domicilio · ${order.neighborhood}` : "Recogida en el local"), m("span", `${order.items.reduce((sum, item) => sum + item.quantity, 0)} artículos`), m("strong", money.format(order.total_cop))]),
        m("footer.admin-order-footer", [m("button.text-button", { type: "button", onclick: (event) => openOrderDetails(order, event) }, "Ver detalle del pedido →"), m("div.admin-order-actions", [order.allowed_next_statuses.includes("confirmed") ? m("button.button.button-primary", { type: "button", disabled: admin.busy, onclick: () => updateOrderStatus(order, "confirmed") }, "Confirmar") : null, order.allowed_next_statuses.includes("delivered") ? m("button.button.button-primary", { type: "button", disabled: admin.busy, onclick: () => updateOrderStatus(order, "delivered") }, "Marcar entregado") : null, order.allowed_next_statuses.includes("cancelled") ? m("button.text-button.admin-delete", { type: "button", disabled: admin.busy, onclick: () => { if (blockDemoMutation("cancelar este pedido")) return; if (window.confirm(`¿Cancelar el pedido ${order.reference}?`)) updateOrderStatus(order, "cancelled"); } }, "Cancelar") : null])]),
        ])) : admin.orders.length ? m("p.admin-empty-orders", [m("span", { "aria-hidden": true }, "⌕"), m("strong", "No encontramos pedidos"), m("span", "Prueba con otra búsqueda o cambia el filtro de estado."), m("button.text-button", { type: "button", onclick: () => { admin.orderQuery = ""; admin.orderStatusFilter = "all"; } }, "Mostrar todos los pedidos")]) : m("p.admin-empty-orders", [m("span", { "aria-hidden": true }, "⌁"), m("strong", "Todavía no hay pedidos"), m("span", "Cuando alguien confirme su pedido desde la carta, aparecerá aquí.")]))
      ]) : admin.activeTab === "products" ? m("div.admin-layout", [
        m("section.admin-products", { "aria-label": "Productos" }, admin.products.length ? admin.products.map((product) => m("article.admin-product", { key: product.id }, [
          product.image_url ? m("img.admin-product-image", { src: product.image_url, alt: "", loading: "lazy" }) : m("span.admin-product-image.admin-product-placeholder", product.illustration),
          m("div.admin-product-copy", [m("span.eyebrow", product.category), m("strong", product.name), m("span", money.format(product.price_cop)), m("span.admin-availability", { class: product.available ? "is-available" : "" }, product.available ? "Disponible" : "Agotado")]),
          m("div.admin-product-actions", [m("button.text-button", { type: "button", onclick: () => { if (blockDemoMutation(`editar “${product.name}”`)) return; admin.form = { ...product }; admin.file = null; admin.error = ""; } }, "Editar"), m("button.text-button.admin-delete", { type: "button", disabled: admin.busy, onclick: () => deleteAdminProduct(product) }, "Eliminar")]),
        ])) : m("p", "Aún no hay productos.")),
        admin.form ? m("form.admin-form.admin-editor", { onsubmit: saveAdminProduct }, [
          m("div", [m("span.eyebrow", admin.form.id ? "EDITAR PRODUCTO" : "NUEVO PRODUCTO"), m("h2", admin.form.id ? admin.form.name : "Agregar a la carta")]),
          m("label", ["Nombre", m("input", { name: "name", maxlength: 120, required: true, value: admin.form.name, oninput: (event) => { admin.form.name = event.target.value; } })]),
          m("label", ["Descripción", m("textarea", { name: "description", maxlength: 1000, rows: 3, value: admin.form.description, oninput: (event) => { admin.form.description = event.target.value; } })]),
          m("label", ["Categoría", m("input", { name: "category", list: "admin-categories", required: true, value: admin.form.category, oninput: (event) => { admin.form.category = event.target.value; } }), m("datalist#admin-categories", categories.map((category) => m("option", { value: category })))]),
          m("label", ["Precio (COP)", m("input", { name: "price_cop", type: "number", min: 0, step: 100, required: true, value: admin.form.price_cop, oninput: (event) => { admin.form.price_cop = Number(event.target.value); } })]),
          m("label", ["Etiqueta", m("input", { name: "tag", maxlength: 80, value: admin.form.tag, oninput: (event) => { admin.form.tag = event.target.value; } })]),
          m("label", ["Imagen del producto", m("input", { name: "image", type: "file", accept: "image/jpeg,image/png,image/webp", onchange: (event) => { admin.file = event.target.files?.[0] || null; } }), m("small", "JPG, PNG o WebP · máximo 5 MB")]),
          m("label.admin-check", [m("input", { name: "available", type: "checkbox", checked: admin.form.available, onchange: (event) => { admin.form.available = event.target.checked; } }), "Disponible en la carta"]),
          m("div.admin-form-actions", [m("button.button.button-secondary", { type: "button", onclick: () => { admin.form = null; admin.error = ""; } }, "Cancelar"), m("button.button.button-primary", { type: "submit", disabled: admin.busy }, admin.busy ? "Guardando…" : "Guardar producto")]),
        ]) : null,
      ]) : BistroSettingsForm(),
    ]),
    AdminOrderDetails(),
    DemoRestrictionDialog(),
  ]);
}

const AdminRoot = {
  oninit: loadAdmin,
  oncreate() { admin.refreshTimer = window.setInterval(() => { if (admin.user) loadAdmin(false); }, 60000); },
  onremove() { window.clearInterval(admin.refreshTimer); },
  view: AdminApp,
};

m.mount(document.getElementById("app"), location.pathname.startsWith("/admin") ? AdminRoot : App);
