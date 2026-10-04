import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("el panel guía al administrador sin sesión a iniciar sesión", async ({ app, browser, screen }) => {
  await browser.route("**/api/v1/auth/user", (route) => route.fulfill({ status: 401, json: { message: "Unauthenticated." } }));
  await app.open("/admin");

  await expect(screen.getByRole("heading", "Tu carta, bajo control")).toBeVisible();
  await expect(screen.getByLabel("Correo electrónico")).toBeVisible();
  await expect(screen.getByLabel("Contraseña")).toBeVisible();
  await expect(screen.getByRole("link", "← Volver a la carta")).toBeVisible();
});

test("el panel muestra bandeja, filtros y detalle con una sesión de prueba", async ({ app, browser, screen }) => {
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
  await browser.route("**/api/v1/admin/products", (route) => route.fulfill({ status: 200, json: { data: [] } }));
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
  await expect(dialog.getByRole("button", "Marcar entregado")).toBeVisible();
  if (submittedStatus !== "confirmed") throw new Error(`El panel no envió el estado confirmado: ${submittedStatus}`);
  await dialog.getByRole("button", "Marcar entregado").tap();
  await expect(dialog.getByRole("button", "Marcar entregado")).toHaveCount(0);
  if (submittedStatus !== "delivered" || orderStatus !== "delivered") {
    throw new Error(`El panel no completó la transición a entregado: ${submittedStatus}`);
  }
});
