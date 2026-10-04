import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("el panel guía al administrador sin sesión a iniciar sesión", async ({ app, browser, screen }) => {
  await browser.route("**/api/v1/auth/user", (route) => route.fulfill({ status: 401, json: { message: "Unauthenticated." } }));
  await app.open("/admin");

  await expect(screen.getByRole("heading", "Tu carta, bajo control")).toBeVisible();
  await expect(screen.getByLabel("Correo electrónico")).toBeVisible();
  await expect(screen.getByLabel("Contraseña")).toBeVisible();
  await expect(screen.getByLabel("Correo electrónico")).toHaveValue("demo@example.test");
  await expect(screen.getByText("ACCESO DE DEMOSTRACIÓN · SOLO LECTURA")).toBeVisible();
  await expect(screen.getByRole("link", "← Volver a la carta")).toBeVisible();
});

test("el panel demo permite explorar el portal y bloquea las acciones de escritura", async ({ app, browser, screen }) => {
  let orderStatus = "pending";
  let submittedStatus: string | undefined;
  const order = {
    id: 15,
    reference: "BS-12345678",
    status: orderStatus,
    fulfillment_method: "delivery",
    customer_name: "Camila Prueba",
    customer_phone: "3001234567",
    customer_email: "camila@example.test",
    neighborhood: "Centro",
    delivery_address: "Calle 10 # 5-20",
    pickup_address: null,
    subtotal_cop: 15000,
    delivery_fee_cop: 5000,
    total_cop: 20000,
    created_at: "2026-10-04T12:00:00Z",
    allowed_next_statuses: ["confirmed", "cancelled"],
    items: [{ product_name: "Pastel de garbanzo", quantity: 1, unit_price_cop: 15000, line_total_cop: 15000, note: "Sin cebolla" }],
  };
  await browser.route("**/api/v1/auth/user", (route) => route.fulfill({ status: 200, json: { data: {
    id: 5,
    name: "Admin E2E",
    email: "admin@example.test",
    bistro: { id: 1, name: "Bistró E2E", slug: "demo-bistro" },
  } } }));
  await browser.route("**/api/v1/admin/products", (route) => route.fulfill({ status: 200, json: { data: [{
    id: 21, name: "Pastel de garbanzo", description: "Plato regional", category: "Para empezar", price_cop: 7000,
    available: true, image_url: "/images/menu/cucuta/pastel-garbanzo.webp", illustration: "🥟", tag: "Regional",
  }] } }));
  await browser.route("**/api/v1/admin/settings", (route) => route.fulfill({ status: 200, json: { data: {
    delivery_enabled: true,
    delivery_fee_cop: 5000,
    delivery_neighborhoods: ["Centro", "Caobos"],
    pickup_enabled: true,
    pickup_address: "Dirección de muestra, Cúcuta",
    is_demo: true,
  } } }));
  await browser.route("**/api/v1/admin/orders", (route) => route.fulfill({ status: 200, json: { data: [order] } }));
  await browser.route("**/api/v1/admin/orders/15/status", async (route) => {
    const request = route.request;
    const payload = request.postData ? JSON.parse(request.postData) : {};
    submittedStatus = payload.status;
    orderStatus = payload.status;
    await route.fulfill({ status: 200, json: { data: {
      ...order,
      status: orderStatus,
      allowed_next_statuses: orderStatus === "confirmed" ? ["delivered", "cancelled"] : [],
    } } });
  });

  await app.open("/admin");
  await expect(screen.getByRole("heading", "Pedidos recibidos")).toBeVisible();
  await expect(screen.getByRole("heading", "Camila Prueba")).toBeVisible();
  await expect(screen.getByRole("button", /Pendientes/)).toBeVisible();

  await screen.getByRole("button", /Ver detalle del pedido/).tap();
  const dialog = screen.getByRole("dialog", "Detalle del pedido");
  await expect(dialog).toBeVisible();
  await expect(screen.getByText("Nota: Sin cebolla")).toBeVisible();
  await dialog.getByRole("button", "Confirmar pedido").tap();
  await expect(screen.getByRole("dialog", "Acción no disponible")).toBeVisible();
  await expect(screen.getByText("Puedes explorar el portal, pero el demo no permite guardar cambios.")).toBeVisible();
  if (submittedStatus || orderStatus !== "pending") throw new Error("El modo demo intentó cambiar el estado del pedido.");
  await screen.getByRole("button", "Entendido").tap();
  await dialog.getByRole("button", "Cerrar detalle").tap();

  await screen.getByRole("button", "Productos").tap();
  await screen.getByRole("button", "Editar").tap();
  await expect(screen.getByRole("dialog", "Acción no disponible")).toBeVisible();
  await screen.getByRole("button", "Entendido").tap();
  await screen.getByRole("button", "+ Nuevo producto").tap();
  await expect(screen.getByRole("dialog", "Acción no disponible")).toBeVisible();
  await screen.getByRole("button", "Entendido").tap();

  await screen.getByRole("button", "Entrega y recogida").tap();
  await screen.getByRole("button", "Guardar configuración").tap();
  await expect(screen.getByRole("dialog", "Acción no disponible")).toBeVisible();
});

test("las credenciales precargadas permiten entrar al espacio de muestra", async ({ app, browser, screen }) => {
  let authChecks = 0;
  await browser.route("**/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
  await browser.route("**/api/v1/auth/login", (route) => route.fulfill({ status: 200, json: { data: { id: 5 } } }));
  await browser.route("**/api/v1/auth/user", (route) => {
    authChecks += 1;
    return route.fulfill(authChecks === 1
      ? { status: 401, json: { message: "Unauthenticated." } }
      : { status: 200, json: { data: { id: 5, name: "Admin demo", email: "demo@example.test", bistro: { name: "Bistró E2E" } } } });
  });
  await browser.route("**/api/v1/admin/products", (route) => route.fulfill({ status: 200, json: { data: [] } }));
  await browser.route("**/api/v1/admin/orders", (route) => route.fulfill({ status: 200, json: { data: [] } }));
  await browser.route("**/api/v1/admin/settings", (route) => route.fulfill({ status: 200, json: { data: {
    delivery_enabled: true, delivery_fee_cop: 5000, delivery_neighborhoods: ["Centro"], pickup_enabled: true,
    pickup_address: "Dirección de prueba", is_demo: true,
  } } }));

  await app.open("/admin");
  await screen.getByRole("button", "Entrar al panel de muestra").tap();
  await expect(screen.getByRole("heading", "Pedidos recibidos")).toBeVisible();
  await expect(screen.getByText("Demo · Solo lectura")).toBeVisible();
});
