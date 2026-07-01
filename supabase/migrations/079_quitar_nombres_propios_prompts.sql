-- 079 — Eliminar nombres propios de los datos que se inyectan en prompts de IA.
-- Reemplaza "Tomás" (y variantes "de Tomás" / "con Tomás" / "(Tomás)") por términos
-- genéricos en las tablas que alimentan los system prompts de Claude.

-- 1. pipelines.descripcion (no llega a prompts actualmente, pero limpieza preventiva)
UPDATE pipelines
SET descripcion = replace(descripcion, 'con Tomás', 'con el asesor')
WHERE descripcion LIKE '%Tomás%';

-- 2. pipeline_etapas.criterios_salida  → se inyecta en system prompt vía contexto-pipeline.ts
UPDATE pipeline_etapas
SET criterios_salida = replace(
      replace(criterios_salida, 'con Tomás', 'con el asesor'),
      'de Tomás', 'del asesor')
WHERE criterios_salida LIKE '%Tomás%';

-- 3. pipeline_etapas.criterios_entrada → se inyecta solo en RLS interno, pero limpieza consistente
UPDATE pipeline_etapas
SET criterios_entrada = replace(
      replace(criterios_entrada, 'con Tomás', 'con el asesor'),
      'de Tomás', 'del asesor')
WHERE criterios_entrada LIKE '%Tomás%';

-- 4. pipeline_etapas.tareas_obligatorias (JSONB)
--    Orden de reemplazos: primero " (Tomás)" para quitar el paréntesis, luego "de Tomás"
--    (→ "del asesor") y finalmente "con Tomás" (→ "con el asesor").
UPDATE pipeline_etapas
SET tareas_obligatorias = replace(
      replace(
        replace(tareas_obligatorias::text, ' (Tomás)', ''),
        'de Tomás', 'del asesor'),
      'con Tomás', 'con el asesor')::jsonb
WHERE tareas_obligatorias::text LIKE '%Tomás%';

-- 5. servicios.contenido → va a la KB y Claude lo recibe en los recursos de conocimiento
UPDATE servicios
SET contenido = replace(contenido, 'con Tomás', 'con nuestro asesor')
WHERE contenido LIKE '%Tomás%';

-- 6. recursos_conocimiento.contenido (por si el servicio también existe ahí como copia)
UPDATE recursos_conocimiento
SET contenido = replace(contenido, 'con Tomás', 'con nuestro asesor')
WHERE contenido LIKE '%Tomás%';
