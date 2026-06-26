const GHL_BASE    = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY!}`,
    Version:       GHL_VERSION,
    "Content-Type": "application/json",
  };
}

export async function ghlGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GHL_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function ghlPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL API POST ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function ghlPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method:  "PUT",
    headers: headers(),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL API PUT ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function ghlDelete<T = void>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method:  "DELETE",
    headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL API DELETE ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  const text = await res.text().catch(() => "");
  return (text ? JSON.parse(text) : {}) as T;
}
