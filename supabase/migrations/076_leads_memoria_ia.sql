-- MPS-16 S63 — Memoria comprimida por lead: resumen IA de conversaciones previas.
-- Haiku resume en 3-5 frases qué funcionó, resistencias, tono preferido y estado.
-- Se genera al marcar Comprado o Perdido; se inyecta en el prompt si existe.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS memoria_ia TEXT;
