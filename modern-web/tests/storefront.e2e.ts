import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const menuUrl = "**/api/v1/public/bistros/demo-bistro/menu";
const orderUrl = "**/api/v1/public/bistros/demo-bistro/orders";

const menu = {
  data: [
    {
      id: 41,
      name: "Pastel de garbanzo",
      category: "Tradición cucuteña",
      description: "Masa dorada rellena de garbanzo y especias.",
      price_cop: 15000,
      available: true,
      image_url: null,
      illustration: "🥟",
      tag: "De la casa",
    },
    {
      id: 42,
      name: "Mute santandereano",
      category: "Sopas",
      description: "Sopa lenta con maíz, verduras y carne.",
      price_cop: 22000,
      available: true,
      image_url: null,
      illustration: "🥣",
      tag: "",
    },
    {
      id: 43,
      name: "Producto agotado",
      category: "Sopas",
      description: "No debe aparecer en la carta pública.",
      price_cop: 10000,
      available: false,
      image_url: null,
      illustration: "🥣",
      tag: "",
    },
  ],
  meta: {
    demo: true,
    notice: "Carta de muestra.",
    fulfillment: {
      delivery_enabled: true,
      delivery_fee_cop: 5000,
      delivery_neighborhoods: ["Centro", "Caobos"],
      pickup_enabled: true,
      pickup_address: "Dirección de muestra, Cúcuta",
      is_demo: true,
    },
  },
};

async function stubMenu(browser: { route: (url: string, handler: (route: any) => Promise<void>) => Promise<void> }) {
  await browser.route(menuUrl, (route) => route.fulfill({ status: 200, json: menu }));
}

test("la carta filtra por categoría y búsqueda, y oculta productos agotados", async ({ app, browser, screen }) => {
  await stubMenu(browser);
  await app.open("/#la-carta");

  await expect(screen.getByRole("heading", "La carta")).toBeVisible();
  await expect(screen.getByRole("button", /Ver Pastel de garbanzo/)).toBeVisible();
  await expect(screen.getByRole("button", /Ver Mute santandereano/)).toBeVisible();
  await expect(screen.getByText("Producto agotado")).toHaveCount(0);

  await screen.getByRole("button", "Tradición cucuteña").tap();
  await expect(screen.getByRole("button", /Ver Pastel de garbanzo/)).toBeVisible();
  await expect(screen.getByRole("button", /Ver Mute santandereano/)).toHaveCount(0);

  await screen.getByLabel("Buscar en la carta").fill("mute");
  await expect(screen.getByText("No encontramos ese plato")).toBeVisible();
  await screen.getByRole("button", "Ver toda la carta").tap();
  await expect(screen.getByRole("button", /Ver Mute santandereano/)).toBeVisible();
});

test("un cliente configura un pedido y recibe confirmación sin escribir en una base real", async ({ app, browser, screen }) => {
  let submittedOrder: Record<string, any> | undefined;
  await stubMenu(browser);
  await browser.route("**/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
  await browser.route(orderUrl, async (route) => {
    const request = route.request;
    submittedOrder = request.postData ? JSON.parse(request.postData) : undefined;
    await route.fulfill({
      status: 201,
      json: { data: {
        reference: "E2E-DEMO-001",
        status: "pending",
        fulfillment_method: "delivery",
        subtotal_cop: 30000,
        delivery_fee_cop: 5000,
        total_cop: 35000,
      } },
    });
  });

  await app.open("/#la-carta");
  await screen.getByRole("button", /Ver Pastel de garbanzo/).tap();
  await screen.getByLabel("Nota para este plato · opcional").fill("Sin cebolla");
  await screen.getByRole("button", "Añadir una unidad").tap();
  await expect(screen.getByLabel("Cantidad: 2")).toBeVisible();
  await screen.getByRole("button", "Añadir al carrito").tap();

  await expect(screen.getByRole("heading", "Carrito")).toBeVisible();
  await expect(screen.getByText("Nota: Sin cebolla")).toBeVisible();
  await screen.getByRole("button", "Continuar con el pedido").tap();
  await screen.getByLabel("Nombre").fill("Cliente E2E");
  await screen.getByLabel("Teléfono de contacto").fill("3001234567");
  await screen.getByLabel("Barrio").selectOption("Centro");
  await screen.getByLabel("Dirección").fill("Calle 10 # 5-20");
  await screen.getByRole("button", /Confirmar/).tap();

  await expect(screen.getByRole("heading", "Gracias por elegirnos")).toBeVisible();
  await expect(screen.getByText("E2E-DEMO-001")).toBeVisible();
  await expect(screen.getByText(/Total:.*35\.000/)).toBeVisible();
  if (submittedOrder?.customer_name !== "Cliente E2E" || submittedOrder?.customer_phone !== "3001234567") {
    throw new Error(`El checkout no envió los datos del cliente: ${JSON.stringify(submittedOrder)}`);
  }
  if (submittedOrder?.fulfillment_method !== "delivery" || submittedOrder?.neighborhood !== "Centro" || submittedOrder?.delivery_address !== "Calle 10 # 5-20") {
    throw new Error(`El checkout no envió la modalidad y dirección seleccionadas: ${JSON.stringify(submittedOrder)}`);
  }
  if (submittedOrder?.items?.[0]?.product_id !== 41 || submittedOrder?.items?.[0]?.quantity !== 2 || submittedOrder?.items?.[0]?.note !== "Sin cebolla") {
    throw new Error(`El checkout no conservó producto, cantidad y nota de la línea: ${JSON.stringify(submittedOrder)}`);
  }
});

test("un cliente elige recogida y envía la dirección del local sin domicilio", async ({ app, browser, screen }) => {
  let submittedOrder: Record<string, any> | undefined;
  await stubMenu(browser);
  await browser.route("**/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
  await browser.route(orderUrl, async (route) => {
    const request = route.request;
    submittedOrder = request.postData ? JSON.parse(request.postData) : undefined;
    await route.fulfill({ status: 201, json: { data: {
      reference: "E2E-PICKUP-001",
      status: "pending",
      fulfillment_method: "pickup",
      subtotal_cop: 15000,
      delivery_fee_cop: 0,
      total_cop: 15000,
    } } });
  });

  await app.open("/#la-carta");
  await screen.getByRole("button", /Ver Pastel de garbanzo/).tap();
  await screen.getByRole("button", "Añadir al carrito").tap();
  await screen.getByRole("button", "Continuar con el pedido").tap();
  await screen.getByLabel("Nombre").fill("Cliente Recogida");
  await screen.getByLabel("Teléfono de contacto").fill("3001234567");
  await screen.getByLabel("¿Cómo recibes tu pedido?").selectOption({ value: "pickup" });

  await expect(screen.getByText("Recoge en: Dirección de muestra, Cúcuta")).toBeVisible();
  await expect(screen.getByText("Total de productos")).toBeVisible();
  await screen.getByRole("button", /Confirmar/).tap();

  await expect(screen.getByText("E2E-PICKUP-001")).toBeVisible();
  if (submittedOrder?.fulfillment_method !== "pickup" || submittedOrder?.neighborhood !== null || submittedOrder?.delivery_address !== null) {
    throw new Error(`El checkout de recogida envió datos de domicilio: ${JSON.stringify(submittedOrder)}`);
  }
});

test("el checkout muestra el error de validación del API y permite corregirlo", async ({ app, browser, screen }) => {
  let attempts = 0;
  await stubMenu(browser);
  await browser.route("**/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
  await browser.route(orderUrl, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 422, json: {
        message: "The given data was invalid.",
        errors: { neighborhood: ["Ese barrio está fuera de la cobertura configurada."] },
      } });
      return;
    }
    await route.fulfill({ status: 201, json: { data: {
      reference: "E2E-RETRY-001",
      status: "pending",
      fulfillment_method: "delivery",
      subtotal_cop: 15000,
      delivery_fee_cop: 5000,
      total_cop: 20000,
    } } });
  });

  await app.open("/#la-carta");
  await screen.getByRole("button", /Ver Pastel de garbanzo/).tap();
  await screen.getByRole("button", "Añadir al carrito").tap();
  await screen.getByRole("button", "Continuar con el pedido").tap();
  await screen.getByLabel("Nombre").fill("Cliente Reintento");
  await screen.getByLabel("Teléfono de contacto").fill("3001234567");
  await screen.getByLabel("Barrio").selectOption("Centro");
  await screen.getByLabel("Dirección").fill("Calle 10 # 5-20");
  await screen.getByRole("button", /Confirmar/).tap();

  await expect(screen.getByRole("alert")).toContainText("Ese barrio está fuera de la cobertura configurada.");
  await expect(screen.getByLabel("Barrio")).toBeVisible();
  await screen.getByRole("button", /Confirmar/).tap();
  await expect(screen.getByText("E2E-RETRY-001")).toBeVisible();
  if (attempts !== 2) throw new Error(`Se esperaban dos intentos del pedido; se observaron ${attempts}.`);
});
