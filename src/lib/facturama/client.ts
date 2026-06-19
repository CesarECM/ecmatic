// S12.6 — Cliente Facturama para CFDI 4.0 (Mexico).
// Graceful-off: todas las funciones devuelven null si faltan credenciales.

const SANDBOX_URL = "https://apisandbox.facturama.mx";
const PROD_URL    = "https://api.facturama.mx";

function baseUrl() {
  return process.env.FACTURAMA_SANDBOX !== "false" ? SANDBOX_URL : PROD_URL;
}

function authHeader() {
  const user = process.env.FACTURAMA_USER;
  const pass = process.env.FACTURAMA_PASSWORD;
  if (!user || !pass) return null;
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("[facturama] Credenciales no configuradas");

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`[facturama] ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<T>;
}

// ── Tipos CFDI 4.0 ──────────────────────────────────────────────────────────

export interface CfdiReceptor {
  Rfc: string;
  Name: string;
  CfdiUse: string;        // G03 gastos generales / D10 pagos por servicios educativos
  FiscalRegime: string;   // 616 sin obligaciones / 612 persona física actividades empresariales
  TaxZipCode: string;     // CP fiscal del receptor
}

export interface CfdiItem {
  ProductCode: string;    // 86101500 servicios de capacitación
  Description: string;
  Unit: string;           // E48 unidad de servicio
  UnitCode: string;
  UnitPrice: number;
  Quantity: number;
  Subtotal: number;
  TaxObject: string;      // "02" con impuestos / "01" sin impuestos
  Taxes?: CfdiTax[];
  Total: number;
}

export interface CfdiTax {
  Total: number;
  Name: string;           // "IVA"
  Base: number;
  Rate: number;           // 0.16
  IsRetention: boolean;
}

export interface CfdiPayload {
  Serie?: string;
  Currency: string;       // "MXN"
  ExpeditionPlace: string; // CP del emisor
  PaymentForm: string;    // "03" transferencia / "01" efectivo
  PaymentMethod: string;  // "PUE" pago en una exhibición
  CfdiType: string;       // "I" ingreso
  Receiver: CfdiReceptor;
  Items: CfdiItem[];
}

export interface CfdiResultado {
  Id: string;
  CfdiType: string;
  Serie: string;
  Folio: string;
  Uuid: string;
  Status: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function construirItemServicio(descripcion: string, monto: number): CfdiItem {
  const subtotal = Number((monto / 1.16).toFixed(2));
  const iva      = Number((subtotal * 0.16).toFixed(2));
  const total    = Number((subtotal + iva).toFixed(2));

  return {
    ProductCode: "86101500",
    Description: descripcion,
    Unit: "E48",
    UnitCode: "E48",
    UnitPrice: subtotal,
    Quantity: 1,
    Subtotal: subtotal,
    TaxObject: "02",
    Taxes: [{ Total: iva, Name: "IVA", Base: subtotal, Rate: 0.16, IsRetention: false }],
    Total: total,
  };
}

// ── Operaciones CFDI ────────────────────────────────────────────────────────

export async function emitirFactura(payload: CfdiPayload): Promise<CfdiResultado | null> {
  if (!authHeader()) return null;
  return req<CfdiResultado>("POST", "/api/Cfdi", payload);
}

export async function obtenerFactura(tipo: string, id: string): Promise<CfdiResultado | null> {
  if (!authHeader()) return null;
  return req<CfdiResultado>("GET", `/api/Cfdi/${tipo}/${id}`);
}

export async function cancelarFactura(
  tipo: string,
  id: string,
  motivo: "01" | "02" | "03" | "04" = "02"
): Promise<boolean> {
  if (!authHeader()) return false;
  await req("DELETE", `/api/Cfdi/${tipo}/${id}?motive=${motivo}`);
  return true;
}
