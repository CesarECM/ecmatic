import crypto from "node:crypto";

// Verifica la firma HMAC-SHA256 que Meta adjunta en cada POST del webhook.
// Falla cerrado si META_APP_SECRET no está configurado.
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error(
      "[webhook] META_APP_SECRET no está configurado — rechazando request. " +
        "Configura la variable (Meta → App Settings → Basic → App Secret).",
    );
    return false;
  }

  if (!signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
