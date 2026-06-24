-- Sprint modo_venta: estrategia de cierre por servicio + estado de revelación de producto en conversación

-- Modo de venta por servicio
ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS modo_venta TEXT NOT NULL DEFAULT 'meet'
    CHECK (modo_venta IN ('directo', 'meet')),
  ADD COLUMN IF NOT EXISTS precio_apartado_centavos INTEGER;

-- Estado de revelación del producto (máquina de estados unidireccional por lead)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS modo_revelacion TEXT NOT NULL DEFAULT 'oculto'
    CHECK (modo_revelacion IN ('oculto', 'preguntando', 'revelado'));

COMMENT ON COLUMN servicios.modo_venta IS 'directo: la IA puede cerrar la venta por mensaje. meet: la IA siempre agenda videollamada.';
COMMENT ON COLUMN servicios.precio_apartado_centavos IS 'Monto mínimo para reservar un lugar. NULL = no se permite apartado.';
COMMENT ON COLUMN leads.modo_revelacion IS 'Controla cuándo la IA puede revelar el nombre/precio del servicio: oculto → preguntando → revelado.';
