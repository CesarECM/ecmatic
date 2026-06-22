// Tipos manuales — se reemplazan por `supabase gen types` cuando el proyecto esté conectado

export type Rol = "admin" | "vendedor" | "admin_financiero";
export type Canal = "whatsapp" | "email" | "meet" | "interno";
export type Direccion = "entrante" | "saliente";
export type PipelineRuta = "tripwire" | "premium";
export type Temperamento = "D" | "I" | "S" | "C";
export type TipoAvatar = "B2C" | "B2B";
export type TipoRecurso =
  | "faq"
  | "objecion"
  | "servicio"
  | "template_wa"
  | "template_email"
  | "practica_venta";
export type OrigenRecurso = "interno" | "ia_sugerido" | "externo";
export type MovidoPor = "ia" | "admin" | "vendedor" | "webhook";
export type CanalNurturing = "whatsapp" | "email";
export type EstadoEnvioNurturing = "pendiente" | "enviado" | "fallido" | "omitido";
export type IntencionClasificada =
  | "compra_inmediata"
  | "compra_consideracion"
  | "duda_tecnica"
  | "objecion_precio"
  | "objecion_confianza"
  | "abandono_inminente"
  | "quiere_agendar"
  | "confirmando_slot"
  | "fuera_de_contexto"
  | "compra"       // legacy
  | "otro";        // legacy

export type OrigenMatriz = "manual" | "ia_sugerido" | "automatico";
export type TipoGatillo = "escasez_cupo" | "escasez_evaluadores" | "urgencia_fecha" | "precio_vigente" | "evento_proximo" | "otro";
export type AudienciaGatillo = "all" | "tripwire" | "premium";
export type EstadoCita = "pendiente" | "confirmada" | "show" | "noshow" | "cancelada";
export type MetodoPago = "stripe" | "manual";
export type EstadoPago = "pendiente" | "completado" | "reembolsado";
export type EstadoComision = "pendiente" | "pagada";
export type ResultadoCita = "show" | "noshow" | "seguimiento";
export type TemperaturaCierre = "fria" | "tibia" | "caliente";
export type ActorPromesa = "vendedor" | "lead" | "ia";
export type TipoTarea = "limpieza" | "informacion" | "nutricion" | "seguimiento" | "cierre";
export type TipoLeadmagnet = "pre-creado" | "generable-ia" | "requiere-humano";
export type TipoPagoServicio = "landing" | "pasarela";

// S23.1 — Entrada del historial versionado del Contexto del lead
export interface EntradaContexto {
  id: string;
  contenido: string;
  origen: "ia" | "humano";
  autor?: string;   // para entradas manuales humanas
  accion?: string;  // para entradas IA: evento que disparó la actualización
  timestamp: string;
}

export interface DimensionesMatriz {
  temperamento?: "D" | "I" | "S" | "C";
  objecion?: string;
  servicio?: string;
  tipo_cliente?: "B2C" | "B2B";
  canal_origen?: string;
  etapa_atasco?: string;
  temperatura?: "fria" | "tibia" | "caliente";
  fase_cagc?: number; // S13.3 — 8ª dimensión: fase del comprador (0-16)
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          nombre: string | null;
          rol: Rol;
          activo: boolean;
          whatsapp_personal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          nombre?: string | null;
          rol?: Rol;
          activo?: boolean;
          whatsapp_personal?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["profiles"]["Insert"], "id">>;
        Relationships: Relationship[];
      };
      avatares: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          tipo: TipoAvatar;
          descripcion: string | null;
          caracteristicas: Record<string, unknown>;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          codigo: string;
          nombre: string;
          tipo: TipoAvatar;
          descripcion?: string | null;
          caracteristicas?: Record<string, unknown>;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["avatares"]["Insert"]>;
        Relationships: Relationship[];
      };
      vendedores: {
        Row: {
          id: string;
          profile_id: string;
          nombre: string;
          email: string;
          telefono: string | null;
          activo: boolean;
          peso: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          nombre: string;
          email: string;
          telefono?: string | null;
          activo?: boolean;
          peso?: number;
        };
        Update: Partial<Database["public"]["Tables"]["vendedores"]["Insert"]>;
        Relationships: Relationship[];
      };
      leads: {
        Row: {
          id: string;
          nombre: string | null;
          telefono: string | null;
          email: string | null;
          canal_origen: string;
          pipeline_stage: string;
          pipeline_ruta: PipelineRuta;
          temperamento_inferido: Temperamento | null;
          temperamento_confianza: number;
          avatar_id: string | null;
          vendedor_id: string | null;
          score_salud: number;
          compra_previa: boolean;
          activo: boolean;
          metadata: Record<string, unknown>;
          privacidad_aceptada: boolean;
          privacidad_fecha: string | null;
          archivado: boolean;
          archivado_razon: string | null;
          contexto: string | null;
          contexto_historial: EntradaContexto[];
          contexto_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre?: string | null;
          telefono?: string | null;
          email?: string | null;
          canal_origen?: string;
          pipeline_stage?: string;
          pipeline_ruta?: PipelineRuta;
          temperamento_inferido?: Temperamento | null;
          temperamento_confianza?: number;
          avatar_id?: string | null;
          vendedor_id?: string | null;
          score_salud?: number;
          compra_previa?: boolean;
          activo?: boolean;
          metadata?: Record<string, unknown>;
          privacidad_aceptada?: boolean;
          privacidad_fecha?: string | null;
          archivado?: boolean;
          archivado_razon?: string | null;
          contexto?: string | null;
          contexto_historial?: EntradaContexto[];
          contexto_updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: Relationship[];
      };
      mensajes: {
        Row: {
          id: string;
          lead_id: string;
          canal: Canal;
          direccion: Direccion;
          contenido: string;
          intencion_clasificada: IntencionClasificada | null;
          procesado_por_ia: boolean;
          wa_message_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          canal: Canal;
          direccion: Direccion;
          contenido: string;
          intencion_clasificada?: IntencionClasificada | null;
          procesado_por_ia?: boolean;
          wa_message_id?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["mensajes"]["Insert"]>;
        Relationships: Relationship[];
      };
      pipeline_etapas: {
        Row: {
          id: string;
          nombre: string;
          orden: number;
          ruta: PipelineRuta;
          activo: boolean;
          fases_cagc: number[];
          es_tronco: boolean;
          etapas_siguientes: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          orden: number;
          ruta: PipelineRuta;
          activo?: boolean;
          fases_cagc?: number[];
          es_tronco?: boolean;
          etapas_siguientes?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["pipeline_etapas"]["Insert"]>;
        Relationships: Relationship[];
      };
      mensajes_buffer: {
        Row: {
          id: string;
          telefono: string;
          contenido: string;
          wa_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          telefono: string;
          contenido: string;
          wa_message_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["mensajes_buffer"]["Insert"]>;
        Relationships: Relationship[];
      };
      tickets: {
        Row: {
          id: string;
          lead_id: string;
          motivo: string;
          estado: "abierto" | "en_atencion" | "cerrado";
          vendedor_id: string | null;
          resolucion: string | null;
          sugerencia_kb: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          motivo: string;
          estado?: "abierto" | "en_atencion" | "cerrado";
          vendedor_id?: string | null;
          resolucion?: string | null;
          sugerencia_kb?: unknown | null;
        };
        Update: Partial<Database["public"]["Tables"]["tickets"]["Insert"]>;
        Relationships: Relationship[];
      };
      pipeline_movimientos: {
        Row: {
          id: string;
          lead_id: string;
          etapa_anterior: string | null;
          etapa_nueva: string;
          motivo: string | null;
          movido_por: MovidoPor;
          ruta: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          etapa_anterior?: string | null;
          etapa_nueva: string;
          motivo?: string | null;
          movido_por?: MovidoPor;
          ruta?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pipeline_movimientos"]["Insert"]>;
        Relationships: Relationship[];
      };
      lead_pipelines: {
        Row: {
          id: string;
          lead_id: string;
          ruta: string;
          etapa_actual: string;
          activo: boolean;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          ruta: string;
          etapa_actual?: string;
          activo?: boolean;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["lead_pipelines"]["Insert"]>;
        Relationships: Relationship[];
      };
      recursos_conocimiento: {
        Row: {
          id: string;
          tipo: TipoRecurso;
          titulo: string;
          contenido: string;
          embedding: number[] | null;
          score_confianza: number;
          score_uso: number;
          score_cierre: number;
          usos: number;
          score_efectividad: number;
          score_vigencia: number;
          score_consenso: number;
          score_cobertura: number;
          metadata: Record<string, unknown>;
          activo: boolean;
          aprobado: boolean;
          origen: OrigenRecurso;
          versiones_previas: unknown[];
          fecha_ultima_actualizacion: string;
          precio_centavos: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tipo: TipoRecurso;
          titulo: string;
          contenido: string;
          embedding?: number[] | null;
          score_confianza?: number;
          score_uso?: number;
          score_cierre?: number;
          usos?: number;
          score_efectividad?: number;
          score_vigencia?: number;
          score_consenso?: number;
          score_cobertura?: number;
          metadata?: Record<string, unknown>;
          activo?: boolean;
          aprobado?: boolean;
          origen?: OrigenRecurso;
          versiones_previas?: unknown[];
          precio_centavos?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["recursos_conocimiento"]["Insert"]>;
        Relationships: Relationship[];
      };
      nurturing_secuencias: {
        Row: {
          id: string;
          nombre: string;
          canal: CanalNurturing;
          etapa_pipeline: string | null;
          ruta: PipelineRuta | null;
          fase_cagc_min: number | null;
          fase_cagc_max: number | null;
          dias_sin_respuesta: number;
          plantilla_id: string | null;
          mensaje_fallback: string | null;
          orden: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          canal: CanalNurturing;
          etapa_pipeline?: string | null;
          ruta?: PipelineRuta | null;
          fase_cagc_min?: number | null;
          fase_cagc_max?: number | null;
          dias_sin_respuesta?: number;
          plantilla_id?: string | null;
          mensaje_fallback?: string | null;
          orden?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["nurturing_secuencias"]["Insert"]>;
        Relationships: Relationship[];
      };
      utm_sources: {
        Row: {
          id: string; lead_id: string | null; utm_source: string | null;
          utm_medium: string | null; utm_campaign: string | null;
          utm_content: string | null; utm_term: string | null;
          referrer: string | null; ip_address: string | null; created_at: string;
        };
        Insert: {
          id?: string; lead_id?: string | null; utm_source?: string | null;
          utm_medium?: string | null; utm_campaign?: string | null;
          utm_content?: string | null; utm_term?: string | null;
          referrer?: string | null; ip_address?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["utm_sources"]["Insert"]>;
        Relationships: Relationship[];
      };
      mensajes_cola: {
        Row: {
          id: string; telefono: string; contenido: string;
          intentos: number; estado: "pendiente" | "enviado" | "fallido";
          error_detalle: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; telefono: string; contenido: string;
          intentos?: number; estado?: "pendiente" | "enviado" | "fallido";
          error_detalle?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["mensajes_cola"]["Insert"]>;
        Relationships: Relationship[];
      };
      calidad_conversacional: {
        Row: {
          id: string; lead_id: string; vendedor_id: string | null;
          score_total: number; coherencia: number; velocidad: number;
          cobertura_objeciones: number; personalizacion: number;
          ganada: boolean; analisis_ia: string | null; created_at: string;
        };
        Insert: {
          id?: string; lead_id: string; vendedor_id?: string | null;
          score_total?: number; coherencia?: number; velocidad?: number;
          cobertura_objeciones?: number; personalizacion?: number;
          ganada?: boolean; analisis_ia?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["calidad_conversacional"]["Insert"]>;
        Relationships: Relationship[];
      };
      experimentos_precios: {
        Row: {
          id: string; nombre: string; descripcion: string | null;
          precio_a_centavos: number; precio_b_centavos: number;
          segmento_a: string; segmento_b: string; activo: boolean;
          ganador: "a" | "b" | null; conversiones_a: number; conversiones_b: number;
          asignaciones_a: number; asignaciones_b: number;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; nombre: string; descripcion?: string | null;
          precio_a_centavos: number; precio_b_centavos: number;
          segmento_a?: string; segmento_b?: string; activo?: boolean;
          ganador?: "a" | "b" | null;
        };
        Update: Partial<Database["public"]["Tables"]["experimentos_precios"]["Insert"] & {
          conversiones_a?: number; conversiones_b?: number;
          asignaciones_a?: number; asignaciones_b?: number;
        }>;
        Relationships: Relationship[];
      };
      log_ia: {
        Row: {
          id: string; tipo_accion: string; lead_id: string | null;
          recurso_kb_id: string | null; resultado: string | null;
          metadata: Record<string, unknown>; created_at: string;
        };
        Insert: {
          id?: string; tipo_accion: string; lead_id?: string | null;
          recurso_kb_id?: string | null; resultado?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["log_ia"]["Insert"]>;
        Relationships: Relationship[];
      };
      sugerencias_ia: {
        Row: {
          id: string; tipo: "pipeline" | "flujo" | "avatar" | "gatillo" | "kb_calidad" | "general";
          titulo: string; descripcion: string;
          prioridad: "urgente" | "importante" | "puede_esperar";
          aprobado: boolean | null; metadata: Record<string, unknown>;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; tipo: "pipeline" | "flujo" | "avatar" | "gatillo" | "kb_calidad" | "general";
          titulo: string; descripcion: string;
          prioridad?: "urgente" | "importante" | "puede_esperar";
          aprobado?: boolean | null; metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["sugerencias_ia"]["Insert"]>;
        Relationships: Relationship[];
      };
      smartbuilder_accesos: {
        Row: {
          id: string; lead_id: string; candidato_id: string | null;
          estandares: string[]; estado: "pendiente" | "activo" | "completado";
          alta_confirmada: boolean; ultimo_avance: number; alerta_enviada: boolean;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; lead_id: string; candidato_id?: string | null;
          estandares?: string[]; estado?: "pendiente" | "activo" | "completado";
          alta_confirmada?: boolean; ultimo_avance?: number; alerta_enviada?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["smartbuilder_accesos"]["Insert"]>;
        Relationships: Relationship[];
      };
      smartbuilder_progreso: {
        Row: {
          id: string; lead_id: string; porcentaje: number;
          datos_raw: unknown | null; fecha: string; created_at: string;
        };
        Insert: {
          id?: string; lead_id: string; porcentaje?: number;
          datos_raw?: unknown | null; fecha?: string;
        };
        Update: Partial<Database["public"]["Tables"]["smartbuilder_progreso"]["Insert"]>;
        Relationships: Relationship[];
      };
      encuestas: {
        Row: {
          id: string; lead_id: string; preguntas: string[];
          respuestas: unknown | null; estado: "pendiente" | "enviada" | "respondida";
          procesada_ia: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; lead_id: string; preguntas?: string[];
          respuestas?: unknown | null; estado?: "pendiente" | "enviada" | "respondida";
          procesada_ia?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["encuestas"]["Insert"]>;
        Relationships: Relationship[];
      };
      referidos: {
        Row: {
          id: string; lead_id: string; codigo: string;
          lead_referido_id: string | null; convertido: boolean; created_at: string;
        };
        Insert: {
          id?: string; lead_id: string; codigo: string;
          lead_referido_id?: string | null; convertido?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["referidos"]["Insert"]>;
        Relationships: Relationship[];
      };
      pagos: {
        Row: {
          id: string; lead_id: string; vendedor_id: string | null;
          monto: number; moneda: string; metodo: MetodoPago;
          stripe_payment_intent_id: string | null; stripe_session_id: string | null;
          comprobante_url: string | null; estado: EstadoPago; notas: string | null;
          created_at: string;
        };
        Insert: {
          id?: string; lead_id: string; vendedor_id?: string | null;
          monto: number; moneda?: string; metodo: MetodoPago;
          stripe_payment_intent_id?: string | null; stripe_session_id?: string | null;
          comprobante_url?: string | null; estado?: EstadoPago; notas?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pagos"]["Insert"]>;
        Relationships: Relationship[];
      };
      comisiones: {
        Row: {
          id: string; pago_id: string; vendedor_id: string;
          monto_comision: number; porcentaje: number; estado: EstadoComision;
          fecha_pago: string | null; metodo_pago: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; pago_id: string; vendedor_id: string;
          monto_comision: number; porcentaje?: number; estado?: EstadoComision;
          fecha_pago?: string | null; metodo_pago?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["comisiones"]["Insert"]>;
        Relationships: Relationship[];
      };
      uso_ia: {
        Row: {
          id: string; proveedor: "anthropic" | "openai";
          tokens_entrada: number; tokens_salida: number;
          costo_estimado: number; fecha: string; created_at: string;
        };
        Insert: {
          id?: string; proveedor: "anthropic" | "openai";
          tokens_entrada?: number; tokens_salida?: number;
          costo_estimado?: number; fecha?: string;
        };
        Update: Partial<Database["public"]["Tables"]["uso_ia"]["Insert"]>;
        Relationships: Relationship[];
      };
      citas: {
        Row: {
          id: string; lead_id: string; vendedor_id: string | null;
          fecha_inicio: string; fecha_fin: string; estado: EstadoCita;
          google_event_id: string | null; google_meet_link: string | null;
          notas_previas: string | null; notas_vendedor: string | null;
          resultado: ResultadoCita | null; compromisos: string | null;
          recordatorio_24h: boolean; recordatorio_2h: boolean; recordatorio_vendedor_30m: boolean;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; lead_id: string; vendedor_id?: string | null;
          fecha_inicio: string; fecha_fin: string; estado?: EstadoCita;
          google_event_id?: string | null; google_meet_link?: string | null;
          notas_previas?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["citas"]["Insert"] & {
          notas_vendedor?: string | null; resultado?: ResultadoCita | null;
          compromisos?: string | null; recordatorio_24h?: boolean;
          recordatorio_2h?: boolean; recordatorio_vendedor_30m?: boolean;
        }>;
        Relationships: Relationship[];
      };
      vendedor_tokens: {
        Row: {
          id: string; vendedor_id: string; access_token: string;
          refresh_token: string | null; expires_at: string | null;
          scope: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; vendedor_id: string; access_token: string;
          refresh_token?: string | null; expires_at?: string | null; scope?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["vendedor_tokens"]["Insert"]>;
        Relationships: Relationship[];
      };
      transcriptos_meet: {
        Row: {
          id: string; cita_id: string | null; lead_id: string; contenido: string;
          objeciones_detectadas: unknown[]; compromisos_detectados: unknown[];
          temperatura_cierre: TemperaturaCierre | null; analisis_completo: unknown | null;
          procesado_por_ia: boolean; created_at: string;
        };
        Insert: {
          id?: string; cita_id?: string | null; lead_id: string; contenido: string;
          objeciones_detectadas?: unknown[]; compromisos_detectados?: unknown[];
          temperatura_cierre?: TemperaturaCierre | null;
        };
        Update: Partial<Database["public"]["Tables"]["transcriptos_meet"]["Insert"] & {
          analisis_completo?: unknown; procesado_por_ia?: boolean;
        }>;
        Relationships: Relationship[];
      };
      gatillos: {
        Row: {
          id: string;
          tipo: TipoGatillo;
          nombre: string;
          valor_actual: string;
          activo: boolean;
          fecha_expiracion: string | null;
          audiencia_objetivo: AudienciaGatillo;
          alerta_enviada: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tipo: TipoGatillo;
          nombre: string;
          valor_actual?: string;
          activo?: boolean;
          fecha_expiracion?: string | null;
          audiencia_objetivo?: AudienciaGatillo;
          alerta_enviada?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["gatillos"]["Insert"]>;
        Relationships: Relationship[];
      };
      matriz_nd: {
        Row: {
          id: string;
          dimensiones: DimensionesMatriz;
          respuesta_sugerida: string;
          score_efectividad: number;
          usos: number;
          cierres: number;
          aprobado: boolean;
          origen: OrigenMatriz;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dimensiones: DimensionesMatriz;
          respuesta_sugerida: string;
          score_efectividad?: number;
          usos?: number;
          cierres?: number;
          aprobado?: boolean;
          origen?: OrigenMatriz;
        };
        Update: Partial<Database["public"]["Tables"]["matriz_nd"]["Insert"]>;
        Relationships: Relationship[];
      };
      competidores: {
        Row: {
          id: string;
          nombre: string;
          menciones: number;
          ultima_mencion: string | null;
          notas: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          menciones?: number;
          ultima_mencion?: string | null;
          notas?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["competidores"]["Insert"]>;
        Relationships: Relationship[];
      };
      momentos_cierre: {
        Row: {
          id: string;
          lead_id: string;
          mensaje_id: string | null;
          objecion_tipo: string | null;
          descripcion: string;
          se_cerro: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          mensaje_id?: string | null;
          objecion_tipo?: string | null;
          descripcion: string;
          se_cerro?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["momentos_cierre"]["Insert"]>;
        Relationships: Relationship[];
      };
      promesas_conversacion: {
        Row: {
          id: string;
          lead_id: string;
          mensaje_id: string | null;
          actor: ActorPromesa;
          promesa: string;
          fecha_prometida: string | null;
          cumplida: boolean | null;
          alerta_enviada: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          mensaje_id?: string | null;
          actor: ActorPromesa;
          promesa: string;
          fecha_prometida?: string | null;
          cumplida?: boolean | null;
          alerta_enviada?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["promesas_conversacion"]["Insert"]>;
        Relationships: Relationship[];
      };
      nurturing_envios: {
        Row: {
          id: string;
          lead_id: string;
          secuencia_id: string;
          canal: CanalNurturing;
          estado: EstadoEnvioNurturing;
          error_detalle: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          secuencia_id: string;
          canal: CanalNurturing;
          estado?: EstadoEnvioNurturing;
          error_detalle?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["nurturing_envios"]["Insert"]>;
        Relationships: Relationship[];
      };
      // ── Sprint 15 · Limpieza ──────────────────────────────
      blacklist: {
        Row: { id: string; telefono: string | null; email: string | null; motivo: string; creado_por: string; created_at: string };
        Insert: { id?: string; telefono?: string | null; email?: string | null; motivo?: string; creado_por?: string };
        Update: Partial<Database["public"]["Tables"]["blacklist"]["Insert"]>;
        Relationships: Relationship[];
      };
      categorias_suciedad_kb: {
        Row: { id: string; nombre: string; descripcion: string; regla_deteccion: string; origen: "manual" | "ia_sugerido"; estado: "activa" | "pendiente_revision" | "archivada"; created_at: string; updated_at: string };
        Insert: { id?: string; nombre: string; descripcion: string; regla_deteccion: string; origen?: "manual" | "ia_sugerido"; estado?: "activa" | "pendiente_revision" | "archivada" };
        Update: Partial<Database["public"]["Tables"]["categorias_suciedad_kb"]["Insert"]>;
        Relationships: Relationship[];
      };
      // ── Sprint 14 · Etiquetas ─────────────────────────────
      etiqueta_categorias: {
        Row: { id: string; nombre: string; descripcion: string | null; color: string; created_at: string };
        Insert: { id?: string; nombre: string; descripcion?: string | null; color?: string };
        Update: Partial<Database["public"]["Tables"]["etiqueta_categorias"]["Insert"]>;
        Relationships: Relationship[];
      };
      etiquetas: {
        Row: {
          id: string; categoria_id: string; nombre: string; descripcion: string | null;
          origen: "manual" | "ia_sugerido" | "automatico";
          estado: "activa" | "pendiente_revision" | "archivada";
          metadata: Record<string, unknown>; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; categoria_id: string; nombre: string; descripcion?: string | null;
          origen?: "manual" | "ia_sugerido" | "automatico";
          estado?: "activa" | "pendiente_revision" | "archivada";
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["etiquetas"]["Insert"]>;
        Relationships: Relationship[];
      };
      lead_etiquetas: {
        Row: { id: string; lead_id: string; etiqueta_id: string; asignada_por: "manual" | "ia" | "automatico"; created_at: string };
        Insert: { id?: string; lead_id: string; etiqueta_id: string; asignada_por?: "manual" | "ia" | "automatico" };
        Update: Partial<Database["public"]["Tables"]["lead_etiquetas"]["Insert"]>;
        Relationships: Relationship[];
      };
      // ── Sprint 13 · CAGC ──────────────────────────────────
      cagc_fases: {
        Row: {
          id: string;
          numero: number;
          nombre: string;
          nombre_tecnico: string;
          descripcion: string;
          senales_deteccion: string[];
          acciones_empresa: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          numero: number;
          nombre: string;
          nombre_tecnico: string;
          descripcion: string;
          senales_deteccion?: string[];
          acciones_empresa?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["cagc_fases"]["Insert"]>;
        Relationships: Relationship[];
      };
      lead_cagc_estado: {
        Row: {
          id: string;
          lead_id: string;
          fase_numero: number;
          confianza: number;
          historial: import("@/services/cagc").TransicionCAGC[];
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          fase_numero?: number;
          confianza?: number;
          historial?: import("@/services/cagc").TransicionCAGC[];
        };
        Update: Partial<Database["public"]["Tables"]["lead_cagc_estado"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "lead_cagc_estado_lead_id_fkey"; columns: ["lead_id"]; referencedRelation: "leads"; referencedColumns: ["id"] },
        ];
      };
      votos_respuesta: {
        Row: {
          id: string;
          mensaje_id: string;
          voto: "bueno" | "malo";
          comentario: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          mensaje_id: string;
          voto: "bueno" | "malo";
          comentario?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["votos_respuesta"]["Insert"]>;
        Relationships: Relationship[];
      };
      leadmagnets: {
        Row: {
          id: string;
          titulo: string;
          descripcion: string;
          tipo: TipoLeadmagnet;
          fases_cagc_objetivo: number[];
          contenido: string | null;
          score_efectividad: number;
          activo: boolean;
          veces_ofrecido: number;
          veces_aceptado: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          titulo: string;
          descripcion?: string;
          tipo: TipoLeadmagnet;
          fases_cagc_objetivo?: number[];
          contenido?: string | null;
          score_efectividad?: number;
          activo?: boolean;
          veces_ofrecido?: number;
          veces_aceptado?: number;
        };
        Update: Partial<Database["public"]["Tables"]["leadmagnets"]["Insert"]>;
        Relationships: Relationship[];
      };
      servicio_pagos: {
        Row: {
          id: string;
          recurso_id: string;
          tipo: TipoPagoServicio;
          url: string;
          descripcion: string | null;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recurso_id: string;
          tipo: TipoPagoServicio;
          url: string;
          descripcion?: string | null;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["servicio_pagos"]["Insert"]>;
        Relationships: Relationship[];
      };
      brochures: {
        Row: {
          id: string;
          titulo: string;
          descripcion: string;
          recurso_id: string | null;
          url: string;
          fases_cagc_objetivo: number[];
          score_efectividad: number;
          activo: boolean;
          veces_ofrecido: number;
          veces_aceptado: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          titulo: string;
          descripcion?: string;
          recurso_id?: string | null;
          url: string;
          fases_cagc_objetivo?: number[];
          score_efectividad?: number;
          activo?: boolean;
          veces_ofrecido?: number;
          veces_aceptado?: number;
        };
        Update: Partial<Database["public"]["Tables"]["brochures"]["Insert"]>;
        Relationships: Relationship[];
      };
      cuentas_bancarias: {
        Row: {
          id: string;
          banco: string;
          titular: string;
          clabe: string | null;
          cuenta: string | null;
          activa: boolean;
          orden: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          banco: string;
          titular: string;
          clabe?: string | null;
          cuenta?: string | null;
          activa?: boolean;
          orden?: number;
        };
        Update: Partial<Database["public"]["Tables"]["cuentas_bancarias"]["Insert"]>;
        Relationships: Relationship[];
      };
      // ── Sprint 17 · Sistema ──────────────────────────────────────
      configuracion_sistema: {
        Row: {
          id: string;
          modo_operacion: "pruebas" | "seguro" | "seguro_automatico" | "automatico";
          umbral_confianza: number;
          metadata: Record<string, unknown>;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          modo_operacion?: "pruebas" | "seguro" | "seguro_automatico" | "automatico";
          umbral_confianza?: number;
          metadata?: Record<string, unknown>;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["configuracion_sistema"]["Insert"]>;
        Relationships: Relationship[];
      };
      // ── Sprint 30 · Modelos Matemáticos ──────────────────────────
      pipeline_ab_contextos: {
        Row: {
          id: string; test_id: string; context_key: string;
          asignaciones_a: number; conversiones_a: number;
          asignaciones_b: number; conversiones_b: number;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; test_id: string; context_key: string;
          asignaciones_a?: number; conversiones_a?: number;
          asignaciones_b?: number; conversiones_b?: number;
        };
        Update: Partial<Database["public"]["Tables"]["pipeline_ab_contextos"]["Insert"]>;
        Relationships: Relationship[];
      };
      // ── Sprint 28 · Protocolos, Canales, Contenido y Llamadas ────
      etapa_protocolo: {
        Row: {
          id: string; etapa_id: string;
          tipo: "ia-propuesto" | "manual";
          regla_avance: string | null; regla_retroceso: string | null; regla_espera: string | null;
          historial: Record<string, unknown>[]; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; etapa_id: string; tipo?: "ia-propuesto" | "manual";
          regla_avance?: string | null; regla_retroceso?: string | null; regla_espera?: string | null;
          historial?: Record<string, unknown>[];
        };
        Update: Partial<Database["public"]["Tables"]["etapa_protocolo"]["Insert"]>;
        Relationships: Relationship[];
      };
      etapa_canales: {
        Row: {
          id: string; etapa_id: string;
          canal: "whatsapp" | "email" | "llamada" | "meet";
          activo: boolean; created_at: string;
        };
        Insert: {
          id?: string; etapa_id: string;
          canal: "whatsapp" | "email" | "llamada" | "meet";
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["etapa_canales"]["Insert"]>;
        Relationships: Relationship[];
      };
      etapa_contenido: {
        Row: {
          id: string; etapa_id: string;
          recurso_tipo: "leadmagnet" | "brochure"; recurso_id: string;
          es_puente: boolean; etapa_origen_id: string | null;
          orden: number; activo: boolean; created_at: string;
        };
        Insert: {
          id?: string; etapa_id: string;
          recurso_tipo: "leadmagnet" | "brochure"; recurso_id: string;
          es_puente?: boolean; etapa_origen_id?: string | null;
          orden?: number; activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["etapa_contenido"]["Insert"]>;
        Relationships: Relationship[];
      };
      llamadas_vendedor: {
        Row: {
          id: string; lead_id: string; vendedor_id: string;
          objetivo: "cierre" | "avance";
          resultado: "exitoso" | "no-contesta" | "seguimiento" | "perdido" | null;
          notas: string | null; duracion_min: number | null; created_at: string;
        };
        Insert: {
          id?: string; lead_id: string; vendedor_id: string;
          objetivo: "cierre" | "avance";
          resultado?: "exitoso" | "no-contesta" | "seguimiento" | "perdido" | null;
          notas?: string | null; duracion_min?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["llamadas_vendedor"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "llamadas_vendedor_lead_id_fkey"; columns: ["lead_id"]; referencedRelation: "leads"; referencedColumns: ["id"] },
          { foreignKeyName: "llamadas_vendedor_vendedor_id_fkey"; columns: ["vendedor_id"]; referencedRelation: "vendedores"; referencedColumns: ["id"] },
        ];
      };
    };  // end Tables
    Views: Record<string, never>;
    Functions: {
      buscar_recursos: {
        Args: {
          query_embedding: number[];
          tipo_filtro?: string | null;
          limite?: number;
          umbral?: number;
        };
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          contenido: string;
          similitud: number;
        }[];
      };
      buscar_duplicados_kb: {
        Args: { umbral?: number };
        Returns: { id_a: string; id_b: string; similitud: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
