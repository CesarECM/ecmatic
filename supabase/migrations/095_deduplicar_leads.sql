-- 095_deduplicar_leads.sql
-- Fusiona leads duplicados causados por el bug de placeholder ghl_{contactId}:
-- ghl-respuesta-sbc creaba el lead con teléfono "ghl_{contactId}" cuando la API
-- de GHL fallaba; luego el webhook ContactCreate no encontraba ese lead (buscaba
-- por teléfono real) y creaba un segundo registro.
--
-- Estrategia de winner: más mensajes → teléfono real > placeholder → más antiguo.
-- Se migran las tablas críticas antes del DELETE; el resto cae por CASCADE.
-- Tablas con RESTRICT (pagos) se reasignan explícitamente para no bloquear el DELETE.
--
-- DIAGNÓSTICO PREVIO (ejecutar sin transacción para ver qué se va a fusionar):
-- SELECT w.id AS winner_id, w.telefono AS winner_tel, w.nombre AS winner_nombre,
--        lo.id AS loser_id, lo.telefono AS loser_tel, lo.nombre AS loser_nombre,
--        (SELECT COUNT(*) FROM mensajes WHERE lead_id = w.id)  AS winner_msgs,
--        (SELECT COUNT(*) FROM mensajes WHERE lead_id = lo.id) AS loser_msgs
-- FROM (
--   SELECT l.id, l.ghl_contact_id, l.telefono, l.nombre,
--          COALESCE((SELECT COUNT(*) FROM mensajes m WHERE m.lead_id = l.id), 0) AS n,
--          ROW_NUMBER() OVER (
--            PARTITION BY l.ghl_contact_id
--            ORDER BY COALESCE((SELECT COUNT(*) FROM mensajes m WHERE m.lead_id = l.id),0) DESC,
--                     (l.telefono NOT LIKE 'ghl_%')::int DESC,
--                     l.created_at ASC
--          ) AS rn
--   FROM leads l WHERE l.ghl_contact_id IS NOT NULL AND l.activo = TRUE
-- ) w
-- JOIN (
--   SELECT l.id, l.ghl_contact_id, l.telefono, l.nombre,
--          ROW_NUMBER() OVER (
--            PARTITION BY l.ghl_contact_id
--            ORDER BY COALESCE((SELECT COUNT(*) FROM mensajes m WHERE m.lead_id = l.id),0) DESC,
--                     (l.telefono NOT LIKE 'ghl_%')::int DESC,
--                     l.created_at ASC
--          ) AS rn
--   FROM leads l WHERE l.ghl_contact_id IS NOT NULL AND l.activo = TRUE
-- ) lo ON lo.ghl_contact_id = w.ghl_contact_id AND lo.rn > 1
-- WHERE w.rn = 1;

BEGIN;

-- ── 1. Tabla temporal con todos los pares (winner + losers) ──────────────────────

CREATE TEMP TABLE _dupes AS
WITH msg_count AS (
  SELECT lead_id, COUNT(*) AS n
  FROM mensajes
  GROUP BY lead_id
),
ranked AS (
  SELECT
    l.id,
    l.ghl_contact_id,
    l.telefono,
    l.nombre,
    l.email,
    l.created_at,
    COALESCE(mc.n, 0) AS num_mensajes,
    ROW_NUMBER() OVER (
      PARTITION BY l.ghl_contact_id
      ORDER BY
        COALESCE(mc.n, 0) DESC,               -- más mensajes primero
        (l.telefono NOT LIKE 'ghl_%')::int DESC, -- teléfono real sobre placeholder
        l.created_at ASC                       -- más antiguo como desempate
    ) AS rn
  FROM leads l
  LEFT JOIN msg_count mc ON mc.lead_id = l.id
  WHERE l.ghl_contact_id IS NOT NULL
    AND l.activo = TRUE
),
con_dupes AS (
  SELECT ghl_contact_id
  FROM ranked
  GROUP BY ghl_contact_id
  HAVING COUNT(*) > 1
)
SELECT
  w.id        AS winner_id,
  lo.id       AS loser_id,
  w.telefono  AS winner_tel,
  lo.telefono AS loser_tel,
  w.nombre    AS winner_nombre,
  lo.nombre   AS loser_nombre,
  w.email     AS winner_email,
  lo.email    AS loser_email
FROM ranked w
JOIN ranked lo ON lo.ghl_contact_id = w.ghl_contact_id AND lo.rn > 1
JOIN con_dupes cd ON cd.ghl_contact_id = w.ghl_contact_id
WHERE w.rn = 1;

-- ── 2. Migrar mensajes (ON DELETE CASCADE — reasignar antes de borrar) ───────────

UPDATE mensajes
SET lead_id = d.winner_id
FROM _dupes d
WHERE mensajes.lead_id = d.loser_id;

-- ── 3. Migrar seguimiento_lead ───────────────────────────────────────────────────
-- Si el winner ya tiene un seguimiento activo del mismo tipo, el del loser cae
-- por CASCADE al borrar. Si no, se reasigna al winner.

UPDATE seguimiento_lead sl
SET lead_id = d.winner_id
FROM _dupes d
WHERE sl.lead_id = d.loser_id
  AND NOT EXISTS (
    SELECT 1 FROM seguimiento_lead x
    WHERE x.lead_id = d.winner_id
      AND x.tipo   = sl.tipo
      AND x.estado = 'activo'
  );

-- ── 4. Migrar intentos de seguimiento ───────────────────────────────────────────

UPDATE seguimiento_intentos
SET lead_id = d.winner_id
FROM _dupes d
WHERE seguimiento_intentos.lead_id = d.loser_id;

-- ── 5. Migrar oportunidades_panel (UNIQUE lead_id) ───────────────────────────────
-- Si el winner ya tiene panel propio, el del loser cae por CASCADE.

UPDATE oportunidades_panel op
SET lead_id = d.winner_id
FROM _dupes d
WHERE op.lead_id = d.loser_id
  AND NOT EXISTS (
    SELECT 1 FROM oportunidades_panel x WHERE x.lead_id = d.winner_id
  );

-- ── 6. Migrar oportunidades_notas ────────────────────────────────────────────────
-- Re-apuntar al lead winner Y al panel del winner (que puede ser el recién migrado
-- o el que ya tenía el winner).

UPDATE oportunidades_notas n
SET
  lead_id        = d.winner_id,
  oportunidad_id = (
    SELECT id FROM oportunidades_panel
    WHERE lead_id = d.winner_id
    LIMIT 1
  )
FROM _dupes d
WHERE n.lead_id = d.loser_id
  AND EXISTS (SELECT 1 FROM oportunidades_panel WHERE lead_id = d.winner_id);

-- ── 7. Migrar pagos (RESTRICT — bloquearía el DELETE sin esto) ───────────────────

UPDATE pagos
SET lead_id = d.winner_id
FROM _dupes d
WHERE pagos.lead_id = d.loser_id;

-- ── 8. Liberar el teléfono real del loser cuando el winner tiene placeholder ──────
-- NULL no viola UNIQUE en PostgreSQL, por lo que es seguro como valor temporal.

UPDATE leads
SET telefono = NULL
FROM _dupes d
WHERE leads.id          = d.loser_id
  AND d.loser_tel  NOT LIKE 'ghl_%'
  AND d.winner_tel LIKE  'ghl_%';

-- ── 9. Enriquecer winner con datos del loser que le falten ───────────────────────

UPDATE leads w
SET
  telefono = CASE
    WHEN w.telefono LIKE 'ghl_%' AND d.loser_tel NOT LIKE 'ghl_%'
    THEN d.loser_tel
    ELSE w.telefono
  END,
  nombre = COALESCE(w.nombre, d.loser_nombre),
  email  = COALESCE(w.email,  d.loser_email)
FROM _dupes d
WHERE w.id = d.winner_id;

-- ── 10. Eliminar losers ──────────────────────────────────────────────────────────
-- Las tablas con ON DELETE CASCADE se limpian automáticamente.
-- Las tablas con ON DELETE SET NULL (log_sistema, log_agendamiento, kbi_senales)
-- quedan con lead_id = NULL — comportamiento correcto para registros históricos.

DELETE FROM leads
WHERE id IN (SELECT loser_id FROM _dupes);

DROP TABLE _dupes;

COMMIT;
