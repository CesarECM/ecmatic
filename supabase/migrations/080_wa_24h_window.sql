-- MPS-19 S72.1 — Ventana WA 24h: flag de routing en cola de aprobación.
-- requiere_template=true → el lead está fuera de la ventana de sesión de 24h de WA;
-- el mensaje debe enviarse como template pre-aprobado desde GHL, no como mensaje libre.

ALTER TABLE ghl_approval_queue
  ADD COLUMN IF NOT EXISTS requiere_template BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ghl_approval_queue.requiere_template IS
  'true cuando el lead no ha respondido en >24h — el mensaje debe enviarse como template WA desde GHL';
