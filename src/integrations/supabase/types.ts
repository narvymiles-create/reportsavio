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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      classes: {
        Row: {
          class_signature_path: string | null
          class_teacher_id: string | null
          created_at: string
          id: string
          level: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          class_signature_path?: string | null
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          class_signature_path?: string | null
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_templates: {
        Row: {
          audience: Database["public"]["Enums"]["comment_audience"]
          created_at: string
          id: string
          max_average: number
          min_average: number
          text: string
          updated_at: string
        }
        Insert: {
          audience: Database["public"]["Enums"]["comment_audience"]
          created_at?: string
          id?: string
          max_average: number
          min_average: number
          text: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["comment_audience"]
          created_at?: string
          id?: string
          max_average?: number
          min_average?: number
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      division_rules: {
        Row: {
          created_at: string
          description: string | null
          division: string
          id: string
          max_aggregate: number
          min_aggregate: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          division: string
          id?: string
          max_aggregate: number
          min_aggregate: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          division?: string
          id?: string
          max_aggregate?: number
          min_aggregate?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      grading_scales: {
        Row: {
          created_at: string
          grade: string
          id: string
          max_mark: number
          min_mark: number
          points: number
          remark: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade: string
          id?: string
          max_mark: number
          min_mark: number
          points: number
          remark?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: string
          id?: string
          max_mark?: number
          min_mark?: number
          points?: number
          remark?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      houses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      learners: {
        Row: {
          active_reg_type: string | null
          age: number | null
          class_id: string | null
          co_curricular: string | null
          conduct: string | null
          created_at: string
          dob: string | null
          full_name: string
          house: string | null
          id: string
          index_no: string | null
          lin_no: string | null
          pay_code: string | null
          photo_path: string | null
          reg_no: string | null
          section: string | null
          sex: string | null
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          active_reg_type?: string | null
          age?: number | null
          class_id?: string | null
          co_curricular?: string | null
          conduct?: string | null
          created_at?: string
          dob?: string | null
          full_name: string
          house?: string | null
          id?: string
          index_no?: string | null
          lin_no?: string | null
          pay_code?: string | null
          photo_path?: string | null
          reg_no?: string | null
          section?: string | null
          sex?: string | null
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          active_reg_type?: string | null
          age?: number | null
          class_id?: string | null
          co_curricular?: string | null
          conduct?: string | null
          created_at?: string
          dob?: string | null
          full_name?: string
          house?: string | null
          id?: string
          index_no?: string | null
          lin_no?: string | null
          pay_code?: string | null
          photo_path?: string | null
          reg_no?: string | null
          section?: string | null
          sex?: string | null
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learners_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learners_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      marks: {
        Row: {
          bot: number | null
          created_at: string
          eot: number | null
          grade: string | null
          id: string
          learner_id: string
          mid: number | null
          points: number | null
          remark: string | null
          subject_id: string
          teacher_initials: string | null
          term_id: string
          total: number | null
          updated_at: string
        }
        Insert: {
          bot?: number | null
          created_at?: string
          eot?: number | null
          grade?: string | null
          id?: string
          learner_id: string
          mid?: number | null
          points?: number | null
          remark?: string | null
          subject_id: string
          teacher_initials?: string | null
          term_id: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          bot?: number | null
          created_at?: string
          eot?: number | null
          grade?: string | null
          id?: string
          learner_id?: string
          mid?: number | null
          points?: number | null
          remark?: string | null
          subject_id?: string
          teacher_initials?: string | null
          term_id?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      nursery_assessments: {
        Row: {
          comment: string | null
          created_at: string
          grade: string | null
          id: string
          learner_id: string
          learning_area_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          learner_id: string
          learning_area_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          learner_id?: string
          learning_area_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_assessments_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "nursery_learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_assessments_learning_area_id_fkey"
            columns: ["learning_area_id"]
            isOneToOne: false
            referencedRelation: "nursery_learning_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_classes: {
        Row: {
          class_teacher_id: string | null
          created_at: string
          id: string
          level: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          level?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      nursery_grade_colors: {
        Row: {
          color: string
          created_at: string
          grade: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          grade: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          grade?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      nursery_learners: {
        Row: {
          age: number | null
          class_id: string | null
          created_at: string
          dob: string | null
          full_name: string
          id: string
          photo_path: string | null
          sex: string | null
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          class_id?: string | null
          created_at?: string
          dob?: string | null
          full_name: string
          id?: string
          photo_path?: string | null
          sex?: string | null
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          class_id?: string | null
          created_at?: string
          dob?: string | null
          full_name?: string
          id?: string
          photo_path?: string | null
          sex?: string | null
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_learners_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "nursery_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_learners_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "nursery_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_learning_areas: {
        Row: {
          created_at: string
          id: string
          image_path: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      nursery_report_cards: {
        Row: {
          class_teacher_comment: string | null
          created_at: string
          generated_at: string | null
          head_teacher_comment: string | null
          id: string
          learner_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          class_teacher_comment?: string | null
          created_at?: string
          generated_at?: string | null
          head_teacher_comment?: string | null
          id?: string
          learner_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          class_teacher_comment?: string | null
          created_at?: string
          generated_at?: string | null
          head_teacher_comment?: string | null
          id?: string
          learner_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_report_cards_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "nursery_learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_report_cards_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_streams: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_streams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "nursery_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          aggregate: number | null
          average: number | null
          class_id: string | null
          class_size: number | null
          class_teacher_comment: string | null
          created_at: string
          division: string | null
          generated_at: string
          head_teacher_comment: string | null
          id: string
          learner_id: string
          position: number | null
          term_id: string
          total_marks: number | null
          updated_at: string
        }
        Insert: {
          aggregate?: number | null
          average?: number | null
          class_id?: string | null
          class_size?: number | null
          class_teacher_comment?: string | null
          created_at?: string
          division?: string | null
          generated_at?: string
          head_teacher_comment?: string | null
          id?: string
          learner_id: string
          position?: number | null
          term_id: string
          total_marks?: number | null
          updated_at?: string
        }
        Update: {
          aggregate?: number | null
          average?: number | null
          class_id?: string | null
          class_size?: number | null
          class_teacher_comment?: string | null
          created_at?: string
          division?: string | null
          generated_at?: string
          head_teacher_comment?: string | null
          id?: string
          learner_id?: string
          position?: number | null
          term_id?: string
          total_marks?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      school_info: {
        Row: {
          created_at: string
          email: string | null
          head_teacher_name: string | null
          head_teacher_signature_path: string | null
          id: string
          is_active: boolean
          location: string
          logo_path: string | null
          motto: string | null
          name: string
          nursery_head_teacher_name: string | null
          nursery_head_teacher_signature_path: string | null
          po_box: string | null
          stamp_opacity: number
          stamp_path: string | null
          stamp_position_type: string | null
          stamp_size: number
          stamp_x: number
          stamp_y: number
          tel: string
          updated_at: string
          watermark_enabled: boolean
          watermark_mode: string
          watermark_opacity: number
          watermark_path: string | null
          watermark_scale: number
          watermark_x: number
          watermark_y: number
          website: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          head_teacher_name?: string | null
          head_teacher_signature_path?: string | null
          id?: string
          is_active?: boolean
          location: string
          logo_path?: string | null
          motto?: string | null
          name: string
          nursery_head_teacher_name?: string | null
          nursery_head_teacher_signature_path?: string | null
          po_box?: string | null
          stamp_opacity?: number
          stamp_path?: string | null
          stamp_position_type?: string | null
          stamp_size?: number
          stamp_x?: number
          stamp_y?: number
          tel: string
          updated_at?: string
          watermark_enabled?: boolean
          watermark_mode?: string
          watermark_opacity?: number
          watermark_path?: string | null
          watermark_scale?: number
          watermark_x?: number
          watermark_y?: number
          website?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          head_teacher_name?: string | null
          head_teacher_signature_path?: string | null
          id?: string
          is_active?: boolean
          location?: string
          logo_path?: string | null
          motto?: string | null
          name?: string
          nursery_head_teacher_name?: string | null
          nursery_head_teacher_signature_path?: string | null
          po_box?: string | null
          stamp_opacity?: number
          stamp_path?: string | null
          stamp_position_type?: string | null
          stamp_size?: number
          stamp_x?: number
          stamp_y?: number
          tel?: string
          updated_at?: string
          watermark_enabled?: boolean
          watermark_mode?: string
          watermark_opacity?: number
          watermark_path?: string | null
          watermark_scale?: number
          watermark_x?: number
          watermark_y?: number
          website?: string | null
        }
        Relationships: []
      }
      streams: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          class_id: string
          code: Database["public"]["Enums"]["subject_code"]
          code_label: string | null
          created_at: string
          id: string
          is_core: boolean
          max_marks: number
          name: string
          sort_order: number
          subject_teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          code: Database["public"]["Enums"]["subject_code"]
          code_label?: string | null
          created_at?: string
          id?: string
          is_core?: boolean
          max_marks?: number
          name: string
          sort_order?: number
          subject_teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          code?: Database["public"]["Enums"]["subject_code"]
          code_label?: string | null
          created_at?: string
          id?: string
          is_core?: boolean
          max_marks?: number
          name?: string
          sort_order?: number
          subject_teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_subject_teacher_id_fkey"
            columns: ["subject_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      teachers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          initials: string | null
          phone: string | null
          role: Database["public"]["Enums"]["teacher_role"]
          section: string
          signature_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          initials?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["teacher_role"]
          section?: string
          signature_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          initials?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["teacher_role"]
          section?: string
          signature_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          created_at: string
          end_date: string | null
          ends_on: string | null
          id: string
          is_current: boolean
          name: string
          next_begins_on: string | null
          start_date: string | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name: string
          next_begins_on?: string | null
          start_date?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          end_date?: string | null
          ends_on?: string | null
          id?: string
          is_current?: boolean
          name?: string
          next_begins_on?: string | null
          start_date?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher"
      comment_audience: "class_teacher" | "head_teacher"
      subject_code: "ENG" | "MTC" | "SCI" | "SST" | "RE" | "ICT" | "OTHER"
      teacher_role: "class_teacher" | "head_teacher" | "subject_teacher"
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
    Enums: {
      app_role: ["admin", "teacher"],
      comment_audience: ["class_teacher", "head_teacher"],
      subject_code: ["ENG", "MTC", "SCI", "SST", "RE", "ICT", "OTHER"],
      teacher_role: ["class_teacher", "head_teacher", "subject_teacher"],
    },
  },
} as const
