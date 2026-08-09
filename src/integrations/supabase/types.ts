export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      doc_chunks: {
        Row: {
          chunk_index: number
          content: string
          doc_name: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index: number
          content: string
          doc_name: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          doc_name?: string
          embedding?: string | null
          id?: string
        }
        Relationships: []
      }
      music_moods: {
        Row: {
          ativo: boolean
          descricao: string
          id: string
          key: string
          nome: string
          ordem: number
          spotify_playlist_uri: string
        }
        Insert: {
          ativo?: boolean
          descricao?: string
          id?: string
          key: string
          nome: string
          ordem?: number
          spotify_playlist_uri?: string
        }
        Update: {
          ativo?: boolean
          descricao?: string
          id?: string
          key?: string
          nome?: string
          ordem?: number
          spotify_playlist_uri?: string
        }
        Relationships: []
      }
      sfx_packs: {
        Row: {
          ativo: boolean
          built_in: boolean
          efeitos: string[]
          id: string
          key: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          built_in?: boolean
          efeitos?: string[]
          id?: string
          key: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          built_in?: boolean
          efeitos?: string[]
          id?: string
          key?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      scene_configs: {
        Row: {
          cor: string
          icone: string
          id: string
          key: string
          nome: string
          ordem: number
          sfx_sugeridos: string[]
          spotify_playlist_uri: string | null
        }
        Insert: {
          cor: string
          icone: string
          id?: string
          key: string
          nome: string
          ordem: number
          sfx_sugeridos?: string[]
          spotify_playlist_uri?: string | null
        }
        Update: {
          cor?: string
          icone?: string
          id?: string
          key?: string
          nome?: string
          ordem?: number
          sfx_sugeridos?: string[]
          spotify_playlist_uri?: string | null
        }
        Relationships: []
      }
      scene_events: {
        Row: {
          cena: string
          confianca: number | null
          id: string
          origem: string
          session_id: string | null
          ts: string
        }
        Insert: {
          cena: string
          confianca?: number | null
          id?: string
          origem?: string
          session_id?: string | null
          ts?: string
        }
        Update: {
          cena?: string
          confianca?: number | null
          id?: string
          origem?: string
          session_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          ended_at: string | null
          id: string
          nome: string | null
          resumo: string | null
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          nome?: string | null
          resumo?: string | null
          started_at?: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          nome?: string | null
          resumo?: string | null
          started_at?: string
        }
        Relationships: []
      }
      transcript_lines: {
        Row: {
          id: string
          session_id: string | null
          texto: string
          ts: string
        }
        Insert: {
          id?: string
          session_id?: string | null
          texto: string
          ts?: string
        }
        Update: {
          id?: string
          session_id?: string | null
          texto?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          nome: string
          ordem: number
          public_url: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          nome: string
          ordem?: number
          public_url: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          nome?: string
          ordem?: number
          public_url?: string
          storage_path?: string
        }
        Relationships: []
      }
      visual_presentation: {
        Row: {
          active_asset_id: string | null
          fade_ms: number
          id: string
          overlay_asset_id: string | null
          updated_at: string
        }
        Insert: {
          active_asset_id?: string | null
          fade_ms?: number
          id?: string
          overlay_asset_id?: string | null
          updated_at?: string
        }
        Update: {
          active_asset_id?: string | null
          fade_ms?: number
          id?: string
          overlay_asset_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_presentation_active_asset_id_fkey"
            columns: ["active_asset_id"]
            isOneToOne: false
            referencedRelation: "visual_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_presentation_overlay_asset_id_fkey"
            columns: ["overlay_asset_id"]
            isOneToOne: false
            referencedRelation: "visual_assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_documents: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          doc_name: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
