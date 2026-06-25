-- 052: Seed — Protocolo 5 Toques en 7 Días · Centro ECM
-- Datos extraídos del documento Protocolo_5Toques_CentroECM.docx
-- Aplicar DESPUÉS de 051_protocolos_seguimiento.sql
-- ================================================================

DO $$
DECLARE
  proto_id UUID := gen_random_uuid();
BEGIN

-- ── 1. PROTOCOLO ────────────────────────────────────────────────────────────
-- etapa_id = NULL; asignar manualmente desde /admin/protocolos después de aplicar el seed
INSERT INTO protocolos_seguimiento (
  id, nombre, descripcion, activo, etapa_id,
  link_agendado, dias_duracion, notas_internas
) VALUES (
  proto_id,
  '5 Toques en 7 Días — Centro ECM',
  'Protocolo estándar de seguimiento para leads asignados que no confirmaron su sesión de ventas. Objetivo: maximizar la tasa de agendado sin comprometer la percepción de marca.',
  true,
  NULL,
  'https://calendar.google.com/calendar/appointments',   -- actualizar con link real
  7,
  'Revisar distribución de etiquetas cada semana. Si >60% son "Sin respuesta" → problema de proceso. Si >60% son "No le interesa" → problema de calidad del lead.'
);

-- ── 2. TOQUES ───────────────────────────────────────────────────────────────

-- Toque 1 — Día 1 — WhatsApp — Presentación
INSERT INTO protocolo_toques (
  protocolo_id, orden, nombre, canal, dia_offset,
  objetivo, guion_principal, guion_alternativo,
  nota_interna, ventana_hora_inicio, ventana_hora_fin
) VALUES (
  proto_id, 1,
  'Toque 1 — Presentación',
  'whatsapp', 0,
  'Crear apertura y entregar el link de agendado con contexto de valor',
  E'Hola [Nombre], soy [Vendedor] del equipo de Centro ECM.\n\nVi que te registraste para conocer cómo convertir tu certificación en un negocio de capacitación — me da gusto que estés explorando esto.\n\nTe comparto el link para que elijas el horario que mejor te acomode para tu sesión: [LINK]\n\nLa sesión dura 30 minutos y al final vas a tener claro si esto tiene sentido para tu situación específica.',
  NULL,
  'Enviar entre 9–11 am o 4–6 pm. Evitar lunes antes de las 10 am y viernes después de las 3 pm.',
  '09:00', '11:00'
);

-- Toque 2 — Día 2 — Llamada — Calificación en 3 minutos
INSERT INTO protocolo_toques (
  protocolo_id, orden, nombre, canal, dia_offset,
  objetivo, guion_principal, guion_alternativo,
  nota_interna, ventana_hora_inicio, ventana_hora_fin
) VALUES (
  proto_id, 2,
  'Toque 2 — Calificación en 3 minutos',
  'llamada', 1,
  'Calificar al lead, resolver la objeción más común y confirmar interés',
  E'Si contesta:\n\n"Hola [Nombre], te habla [Vendedor] de Centro ECM. Ayer te mandé un mensaje por WhatsApp — ¿lo viste?"\n\n[Escuchar]. Perfecto. Solo quería saber si tienes 2 minutos — tengo una pregunta rápida para ti.\n\n"¿Actualmente estás dando capacitación o estás buscando empezar a hacerlo?"\n\n[Escuchar y calificar]. Excelente — con base en lo que me dices, creo que la sesión puede ser muy útil para ti. ¿Cuándo tienes 30 minutos esta semana?',
  E'Si no contesta:\n\n"Hola [Nombre], te llamo de Centro ECM. Intento contactarte para agendar tu sesión de orientación — te mando WhatsApp en un momento."\n\n(Colgar y enviar mensaje de WhatsApp inmediatamente: "Te llamé hace un momento. Quedo pendiente por aquí — cuando tengas un minuto me avisas y agendamos tu sesión: [LINK]")',
  'Si el lead menciona no tener dinero o tiempo ahora, no insistir. Preguntar: "¿Cuándo sería un buen momento para retomar esto?" y registrar la fecha en el sistema.',
  '10:00', '18:00'
);

-- Toque 3 — Día 3 — WhatsApp — Prueba social + ángulo diferente
INSERT INTO protocolo_toques (
  protocolo_id, orden, nombre, canal, dia_offset,
  objetivo, guion_principal, guion_alternativo,
  nota_interna, ventana_hora_inicio, ventana_hora_fin
) VALUES (
  proto_id, 3,
  'Toque 3 — Prueba social',
  'whatsapp', 2,
  'Reducir la percepción de riesgo mostrando que otros ya lo lograron',
  E'[Nombre], quería compartirte algo rápido.\n\nUno de nuestros participantes recientes — también con certificación EC0217 — cerró su primer contrato de capacitación empresarial en menos de 30 días después de terminar el programa.\n\nNo porque sea suerte, sino porque tiene el respaldo legal, el sistema de ventas y la plataforma ya instalada.\n\nEso es exactamente lo que vemos en la sesión. ¿Te parece si la agendamos hoy? [LINK]',
  NULL,
  'Si no tienes un caso real documentado, usa lenguaje general: "hemos visto participantes que..." — nunca inventar datos específicos.',
  '09:00', '18:00'
);

-- Toque 4 — Día 5 — WhatsApp — Urgencia real
INSERT INTO protocolo_toques (
  protocolo_id, orden, nombre, canal, dia_offset,
  objetivo, guion_principal, guion_alternativo,
  nota_interna, ventana_hora_inicio, ventana_hora_fin
) VALUES (
  proto_id, 4,
  'Toque 4 — Urgencia real',
  'whatsapp', 4,
  'Crear urgencia genuina sin presión artificial',
  E'[Nombre], buen día.\n\nSolo quiero avisarte que los lugares para la sesión de orientación esta semana están casi completos — tenemos espacio para 2 personas más.\n\nSi te interesa, este es el link para elegir tu horario antes de que se llenen: [LINK]\n\nSi esta semana no es buen momento, dime y te busco para la siguiente.',
  NULL,
  'La escasez debe ser real. Si efectivamente tienes cupo limitado en tu calendario de sesiones, úsalo. Si no, omite esa línea y enfócate en la pregunta final.',
  '09:00', '11:00'
);

-- Toque 5 — Día 7 — WhatsApp — Cierre con puerta abierta
INSERT INTO protocolo_toques (
  protocolo_id, orden, nombre, canal, dia_offset,
  objetivo, guion_principal, guion_alternativo,
  nota_interna, ventana_hora_inicio, ventana_hora_fin
) VALUES (
  proto_id, 5,
  'Toque 5 — Cierre con puerta abierta',
  'whatsapp', 6,
  'Cerrar el ciclo con dignidad y dejar la puerta abierta sin desgaste',
  E'[Nombre], te escribo por última vez para no ser invasivo.\n\nEntiendo que a veces el timing no es el correcto, y está bien.\n\nSi en algún momento quieres saber cómo otros profesionales como tú están construyendo un negocio de capacitación legal y automatizado, aquí estoy.\n\nTe mando un abrazo y mucho éxito en lo que estás trabajando.',
  NULL,
  'Este mensaje tiene dos funciones: cierra el ciclo limpiamente y genera buena voluntad. Algunos leads responden días después de este mensaje — es normal. Etiquetar como "Nurturing 30 días".',
  '09:00', '18:00'
);

-- ── 3. CRITERIOS DE DESCARTE ─────────────────────────────────────────────────

INSERT INTO protocolo_criterios_descarte (protocolo_id, orden, senal, diagnostico, accion, etiqueta_resultado) VALUES
  (proto_id, 1,
   'Sin respuesta tras 5 toques',
   'Lead sin proceso / timing incorrecto',
   'Mover a secuencia de nurturing largo plazo. Recontactar en 30 días.',
   'Sin respuesta'),

  (proto_id, 2,
   '"No me interesa" explícito',
   'Lead no calificado o mal segmentado',
   'Etiquetar como descartado. Revisar fuente del lead.',
   'No le interesa'),

  (proto_id, 3,
   '"No tengo dinero ahora"',
   'Lead con interés pero sin BANT hoy',
   'Mover a lista de nurturing. Recontactar en 15–21 días.',
   'Sin BANT'),

  (proto_id, 4,
   '"Estoy ocupado, llámame después"',
   'Lead tibio con intención real',
   'Agendar fecha concreta en ese mismo mensaje. No dejar abierto.',
   'Agendó después'),

  (proto_id, 5,
   'Bloqueó o no contesta después del día 3',
   'Señal de calidad baja o contacto equivocado',
   'Etiquetar y cerrar. No insistir más.',
   'Sin respuesta');

-- ── 4. ETIQUETAS DE DIAGNÓSTICO ──────────────────────────────────────────────

INSERT INTO protocolo_etiquetas_diagnostico (protocolo_id, etiqueta, que_significa, que_indica) VALUES
  (proto_id,
   'Sin respuesta',
   'Nunca contestó por ningún canal',
   'Problema de proceso — más intentos o revisión del mensaje inicial'),

  (proto_id,
   'No le interesa',
   'Contestó y rechazó explícitamente',
   'Problema de calidad del lead o segmentación del anuncio'),

  (proto_id,
   'Sin BANT',
   'Interesado pero sin dinero/tiempo ahora',
   'Nutrir a 15–30 días, no descartar definitivamente'),

  (proto_id,
   'Agendó después',
   'Necesitó más de un toque para agendar',
   'Confirma que el seguimiento funciona — el protocolo es efectivo');

END $$;
