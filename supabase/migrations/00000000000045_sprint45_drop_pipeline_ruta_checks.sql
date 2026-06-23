-- ============================================================
-- ECMatic · Migración 45 · Eliminar CHECKs hardcodeados de pipeline_ruta
-- Permite que leads y nurturing_secuencias referencien cualquier
-- ruta de pipeline, no solo 'tripwire' y 'premium'.
-- ============================================================

-- 1. leads.pipeline_ruta — quitar CHECK y NOT NULL; default vacío
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_pipeline_ruta_check;

ALTER TABLE public.leads
  ALTER COLUMN pipeline_ruta DROP NOT NULL,
  ALTER COLUMN pipeline_ruta SET DEFAULT NULL;

-- Limpiar el valor 'tripwire' huérfano en leads existentes
UPDATE public.leads SET pipeline_ruta = NULL WHERE pipeline_ruta = 'tripwire';

-- 2. nurturing_secuencias.ruta — quitar CHECK
ALTER TABLE public.nurturing_secuencias
  DROP CONSTRAINT IF EXISTS nurturing_secuencias_ruta_check;
