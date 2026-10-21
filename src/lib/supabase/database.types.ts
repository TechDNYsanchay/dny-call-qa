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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      call_metrics: {
        Row: {
          agent_share_first_half: number
          agent_talk_sec: number
          call_id: string
          client_share: number
          client_talk_sec: number
          computed_at: string
          credentials_sec: number
          longest_silence_sec: number
          noise_dbfs: number | null
          service_share_of_agent: number
          silences_over_8s: number
        }
        Insert: {
          agent_share_first_half: number
          agent_talk_sec: number
          call_id: string
          client_share: number
          client_talk_sec: number
          computed_at?: string
          credentials_sec?: number
          longest_silence_sec: number
          noise_dbfs?: number | null
          service_share_of_agent?: number
          silences_over_8s: number
        }
        Update: {
          agent_share_first_half?: number
          agent_talk_sec?: number
          call_id?: string
          client_share?: number
          client_talk_sec?: number
          computed_at?: string
          credentials_sec?: number
          longest_silence_sec?: number
          noise_dbfs?: number | null
          service_share_of_agent?: number
          silences_over_8s?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_metrics_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_scores: {
        Row: {
          band: Database["public"]["Enums"]["score_band"]
          call_id: string
          hard_fails: string[]
          levels: Json
          overridden_by: string | null
          override_reason: string | null
          overrides: string[]
          reference_version_ids: string[]
          result: Json
          rubric_version: string
          score: number
          scored_at: string
        }
        Insert: {
          band: Database["public"]["Enums"]["score_band"]
          call_id: string
          hard_fails?: string[]
          levels: Json
          overridden_by?: string | null
          override_reason?: string | null
          overrides?: string[]
          reference_version_ids?: string[]
          result: Json
          rubric_version: string
          score: number
          scored_at?: string
        }
        Update: {
          band?: Database["public"]["Enums"]["score_band"]
          call_id?: string
          hard_fails?: string[]
          levels?: Json
          overridden_by?: string | null
          override_reason?: string | null
          overrides?: string[]
          reference_version_ids?: string[]
          result?: Json
          rubric_version?: string
          score?: number
          scored_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_scores_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_scores_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_phone: string | null
          call_direction: string | null
          client_email: string | null
          client_phone: string | null
          created_at: string
          delete_media_after: string | null
          duration_sec: number
          id: string
          lead_id: string | null
          not_scored_reason: string | null
          person_id: string | null
          recording_path: string | null
          recording_source_url: string | null
          recording_status: Database["public"]["Enums"]["recording_status"]
          scoring_status: Database["public"]["Enums"]["scoring_status"]
          source: Database["public"]["Enums"]["call_source"]
          source_id: string
          started_at: string
          stream: Database["public"]["Enums"]["call_stream"]
          transcript_status: Database["public"]["Enums"]["transcript_status"]
        }
        Insert: {
          agent_phone?: string | null
          call_direction?: string | null
          client_email?: string | null
          client_phone?: string | null
          created_at?: string
          delete_media_after?: string | null
          duration_sec: number
          id?: string
          lead_id?: string | null
          not_scored_reason?: string | null
          person_id?: string | null
          recording_path?: string | null
          recording_source_url?: string | null
          recording_status?: Database["public"]["Enums"]["recording_status"]
          scoring_status?: Database["public"]["Enums"]["scoring_status"]
          source: Database["public"]["Enums"]["call_source"]
          source_id: string
          started_at: string
          stream: Database["public"]["Enums"]["call_stream"]
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
        }
        Update: {
          agent_phone?: string | null
          call_direction?: string | null
          client_email?: string | null
          client_phone?: string | null
          created_at?: string
          delete_media_after?: string | null
          duration_sec?: number
          id?: string
          lead_id?: string | null
          not_scored_reason?: string | null
          person_id?: string | null
          recording_path?: string | null
          recording_source_url?: string | null
          recording_status?: Database["public"]["Enums"]["recording_status"]
          scoring_status?: Database["public"]["Enums"]["scoring_status"]
          source?: Database["public"]["Enums"]["call_source"]
          source_id?: string
          started_at?: string
          stream?: Database["public"]["Enums"]["call_stream"]
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
        }
        Relationships: [
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          id: string
          person_id: string
          report_date: string
          sent_at: string | null
          summary: Json
        }
        Insert: {
          id?: string
          person_id: string
          report_date: string
          sent_at?: string | null
          summary: Json
        }
        Update: {
          id?: string
          person_id?: string
          report_date?: string
          sent_at?: string | null
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          first_call_capture: Json | null
          id: string
          name: string | null
          owner_id: string | null
          phone: string | null
          stage: number | null
          status: string
          updated_at: string
          value_inr: number | null
          vision_call_capture: Json | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          first_call_capture?: Json | null
          id?: string
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          stage?: number | null
          status?: string
          updated_at?: string
          value_inr?: number | null
          vision_call_capture?: Json | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          first_call_capture?: Json | null
          id?: string
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          stage?: number | null
          status?: string
          updated_at?: string
          value_inr?: number | null
          vision_call_capture?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          active: boolean
          auth_user_id: string | null
          callyzer_phone: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["person_role"]
          tldv_email: string | null
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          callyzer_phone?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          role: Database["public"]["Enums"]["person_role"]
          tldv_email?: string | null
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          callyzer_phone?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["person_role"]
          tldv_email?: string | null
        }
        Relationships: []
      }
      reference_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["reference_kind"]
          label: string
          notes: string | null
          storage_path: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["reference_kind"]
          label: string
          notes?: string | null
          storage_path?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["reference_kind"]
          label?: string
          notes?: string | null
          storage_path?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reference_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          call_id: string
          end_sec: number
          id: number
          idx: number
          role: string
          speaker_label: string
          start_sec: number
          text: string
          topic: string | null
        }
        Insert: {
          call_id: string
          end_sec: number
          id?: never
          idx: number
          role?: string
          speaker_label: string
          start_sec: number
          text: string
          topic?: string | null
        }
        Update: {
          call_id?: string
          end_sec?: number
          id?: never
          idx?: number
          role?: string
          speaker_label?: string
          start_sec?: number
          text?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_see_all: { Args: never; Returns: boolean }
      current_person_id: { Args: never; Returns: string }
      mark_scoring_failed: {
        Args: { p_call_id: string; p_reason: string }
        Returns: undefined
      }
      record_call_score: {
        Args: {
          p_band: Database["public"]["Enums"]["score_band"]
          p_call_id: string
          p_hard_fails: string[]
          p_levels: Json
          p_overrides: string[]
          p_reference_version_ids: string[]
          p_result: Json
          p_rubric_version: string
          p_score: number
        }
        Returns: undefined
      }
      record_lead_capture: {
        Args: {
          p_capture: Json
          p_lead_id: string
          p_stream: Database["public"]["Enums"]["call_stream"]
        }
        Returns: undefined
      }
    }
    Enums: {
      call_source: "callyzer" | "tldv" | "upload"
      call_stream: "first_call" | "vision_call"
      person_role: "founder" | "manager" | "executive" | "consultant" | "admin"
      recording_status:
        | "pending"
        | "available"
        | "missing"
        | "declined"
        | "deleted"
      reference_kind:
        | "first_call_sheet"
        | "vision_call_sheet"
        | "service_master"
        | "case_studies"
        | "brief"
      score_band: "green" | "amber" | "red"
      scoring_status: "not_eligible" | "waiting" | "ready" | "scored" | "failed"
      transcript_status:
        | "not_needed"
        | "pending"
        | "processing"
        | "done"
        | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      call_source: ["callyzer", "tldv", "upload"],
      call_stream: ["first_call", "vision_call"],
      person_role: ["founder", "manager", "executive", "consultant", "admin"],
      recording_status: [
        "pending",
        "available",
        "missing",
        "declined",
        "deleted",
      ],
      reference_kind: [
        "first_call_sheet",
        "vision_call_sheet",
        "service_master",
        "case_studies",
        "brief",
      ],
      score_band: ["green", "amber", "red"],
      scoring_status: ["not_eligible", "waiting", "ready", "scored", "failed"],
      transcript_status: [
        "not_needed",
        "pending",
        "processing",
        "done",
        "failed",
      ],
    },
  },
} as const
