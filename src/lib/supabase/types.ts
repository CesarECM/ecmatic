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
  | "compra"
  | "duda_tecnica"
  | "objecion_precio"
  | "abandono_inminente"
  | "otro";

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
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          orden: number;
          ruta: PipelineRuta;
          activo?: boolean;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          etapa_anterior?: string | null;
          etapa_nueva: string;
          motivo?: string | null;
          movido_por?: MovidoPor;
        };
        Update: Partial<Database["public"]["Tables"]["pipeline_movimientos"]["Insert"]>;
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
          activo: boolean;
          aprobado: boolean;
          origen: OrigenRecurso;
          versiones_previas: unknown[];
          fecha_ultima_actualizacion: string;
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
          activo?: boolean;
          aprobado?: boolean;
          origen?: OrigenRecurso;
          versiones_previas?: unknown[];
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
          dias_sin_respuesta?: number;
          plantilla_id?: string | null;
          mensaje_fallback?: string | null;
          orden?: number;
          activo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["nurturing_secuencias"]["Insert"]>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
