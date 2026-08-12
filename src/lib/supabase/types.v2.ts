// Tipos manuales para ECMatic v2 — separados de types.ts (v1.7)

export type V2EstadoLead       = 'activo' | 'GANADO' | 'PERDIDO' | 'INACTIVO' | 'LISTA_NEGRA'
export type V2OrigenLead       = 'whatsapp' | 'ghl' | 'manual'
export type V2FaseCagc         = 'conciencia' | 'atencion' | 'generacion' | 'cierre'
export type V2EstadoOportunidad = 'activa' | 'GANADA' | 'PERDIDA' | 'INACTIVA' | 'LISTA_NEGRA'
export type V2TipoContactPoint  = 'whatsapp' | 'email' | 'llamada' | 'videollamada'
export type V2EstadoContactPoint =
  | 'pendiente_generacion'
  | 'generado'
  | 'aprobado'
  | 'rechazado'
  | 'editado'
  | 'enviado_automatico'
  | 'enviado_manual'
  | 'enviado'
export type V2TipoKbItem   = 'FAQ' | 'IC'
export type V2EstadoKbItem = 'propuesto' | 'aprobado' | 'rechazado'
export type V2AccionKbx    = 'eliminar' | 'unir' | 'separar' | 'marcar_obsoleto'
export type V2EstadoKbx    = 'pendiente' | 'aprobado' | 'rechazado'

export interface V2Lead {
  id:              string
  ghl_contact_id:  string
  nombre:          string | null
  telefono:        string | null
  email:           string | null
  origen:          V2OrigenLead
  estado:          V2EstadoLead
  metadata:        Record<string, unknown>
  created_at:      string
  updated_at:      string
}

export interface V2Opportunity {
  id:                  string
  lead_id:             string
  producto_servicio:   string | null
  fase_cagc:           V2FaseCagc
  estado:              V2EstadoOportunidad
  score_probabilidad:  number
  score_urgencia:      number
  score_combinado:     number
  fecha_reactivacion:  string | null
  metadata:            Record<string, unknown>
  created_at:          string
  updated_at:          string
}

export interface V2OpportunityNote {
  id:             string
  opportunity_id: string
  contenido:      string
  autor:          string | null
  created_at:     string
}

export interface V2ContactPoint {
  id:                  string
  lead_id:             string
  opportunity_ids:     string[]
  tipo:                V2TipoContactPoint
  estado:              V2EstadoContactPoint
  contenido_propuesto: string | null
  contenido_final:     string | null
  confianza:           number
  es_fusionado:        boolean
  metadata:            Record<string, unknown>
  created_at:          string
  updated_at:          string
}

export interface V2FollowUpNote {
  id:                        string
  contact_point_id:          string
  resultado:                 'hecho' | 'no_hecho'
  observaciones:             string | null
  retroalimentacion_edicion: string | null
  autor:                     string | null
  created_at:                string
}

export interface V2KbItem {
  id:                string
  tipo:              V2TipoKbItem
  contenido:         string
  estado:            V2EstadoKbItem
  score_confianza:   number
  ultima_validacion: string
  version:           number
  metadata:          Record<string, unknown>
  created_at:        string
  updated_at:        string
}

export interface V2ConversationRule {
  id:         string
  contenido:  string
  activa:     boolean
  orden:      number
  created_at: string
  updated_at: string
}

export interface V2KbxReviewItem {
  id:              string
  kb_item_ids:     string[]
  accion_sugerida: V2AccionKbx
  razon:           string | null
  estado:          V2EstadoKbx
  created_at:      string
  updated_at:      string
}

// V2KbxReviewItem enriquecido con el contenido de los KB items afectados
export interface V2KbxQueueRow extends V2KbxReviewItem {
  kb_items: Pick<V2KbItem, 'id' | 'tipo' | 'contenido' | 'score_confianza'>[];
}

// Fila de auto-enviados para el feed en TareasPane
export interface V2AutoEnviadoRow {
  id:              string
  confianza:       number
  contenido_final: string | null
  updated_at:      string
  lead: Pick<V2Lead, 'id' | 'nombre' | 'telefono'>
}

// Vista combinada para las listas del workspace
export interface V2OpportunityRow extends V2Opportunity {
  lead: Pick<V2Lead, 'id' | 'nombre' | 'telefono' | 'email' | 'ghl_contact_id' | 'origen'>
  pending_contact_points: number
}

// Resultado de búsqueda de leads (S151.3)
export interface V2BusquedaResultado {
  id:       string
  nombre:   string | null
  telefono: string | null
  email:    string | null
  estado:   V2EstadoLead
  oportunidades: {
    id:               string
    producto_servicio: string | null
    fase_cagc:        V2FaseCagc
    score_combinado:  number
  }[]
}

export interface V2TaskRow extends V2ContactPoint {
  lead: Pick<V2Lead, 'id' | 'nombre' | 'telefono' | 'ghl_contact_id'>
  opportunity: Pick<V2Opportunity, 'id' | 'producto_servicio' | 'fase_cagc'> | null
}
