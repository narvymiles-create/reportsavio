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
      academic_years: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          school_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          school_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          school_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_marks: {
        Row: {
          assessment_key: string
          created_at: string
          id: string
          learner_id: string
          mark: number | null
          school_id: string
          subject_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          assessment_key: string
          created_at?: string
          id?: string
          learner_id: string
          mark?: number | null
          school_id: string
          subject_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          assessment_key?: string
          created_at?: string
          id?: string
          learner_id?: string
          mark?: number | null
          school_id?: string
          subject_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_marks_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_marks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_marks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_activation_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          key_hash: string
          key_hint: string
          package: Json
          payment_id: string
          product: string
          revoked_at: string | null
          revoked_by: string | null
          school_id: string
          status: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          key_hash: string
          key_hint: string
          package?: Json
          payment_id: string
          product: string
          revoked_at?: string | null
          revoked_by?: string | null
          school_id: string
          status?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          key_hash?: string
          key_hint?: string
          package?: Json
          payment_id?: string
          product?: string
          revoked_at?: string | null
          revoked_by?: string | null
          school_id?: string
          status?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_activation_keys_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_activation_keys_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          id: string
          key_id: string | null
          payment_id: string | null
          school_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          key_id?: string | null
          payment_id?: string | null
          school_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          key_id?: string | null
          payment_id?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_calendar: {
        Row: {
          academic_year: number
          closes_on: string
          created_at: string
          id: string
          opens_on: string
          renewal_due_on: string | null
          term_number: number
          updated_at: string
        }
        Insert: {
          academic_year: number
          closes_on: string
          created_at?: string
          id?: string
          opens_on: string
          renewal_due_on?: string | null
          term_number: number
          updated_at?: string
        }
        Update: {
          academic_year?: number
          closes_on?: string
          created_at?: string
          id?: string
          opens_on?: string
          renewal_due_on?: string | null
          term_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      billing_notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          read_at: string | null
          school_id: string
          severity: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          read_at?: string | null
          school_id: string
          severity?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          read_at?: string | null
          school_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payments: {
        Row: {
          amount: number
          channel: string | null
          checkout_session_id: string | null
          checkout_url: string | null
          client_request_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          details: Json
          failure_message: string | null
          fulfilled_at: string | null
          gateway_reference: string | null
          id: string
          last_checked_at: string | null
          mode: string | null
          msisdn: string | null
          payer_phone: string | null
          payer_reference: string | null
          product: string
          proof_path: string | null
          proof_submitted_at: string | null
          provider: string | null
          receipt_no: string | null
          reference: string
          refunded_amount: number
          review_note: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          channel?: string | null
          checkout_session_id?: string | null
          checkout_url?: string | null
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          details?: Json
          failure_message?: string | null
          fulfilled_at?: string | null
          gateway_reference?: string | null
          id?: string
          last_checked_at?: string | null
          mode?: string | null
          msisdn?: string | null
          payer_phone?: string | null
          payer_reference?: string | null
          product: string
          proof_path?: string | null
          proof_submitted_at?: string | null
          provider?: string | null
          receipt_no?: string | null
          reference: string
          refunded_amount?: number
          review_note?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          channel?: string | null
          checkout_session_id?: string | null
          checkout_url?: string | null
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          details?: Json
          failure_message?: string | null
          fulfilled_at?: string | null
          gateway_reference?: string | null
          id?: string
          last_checked_at?: string | null
          mode?: string | null
          msisdn?: string | null
          payer_phone?: string | null
          payer_reference?: string | null
          product?: string
          proof_path?: string | null
          proof_submitted_at?: string | null
          provider?: string | null
          receipt_no?: string | null
          reference?: string
          refunded_amount?: number
          review_note?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_quotes: {
        Row: {
          academic_year: number | null
          admin_note: string | null
          amount: number | null
          created_at: string
          created_by: string | null
          edition: string
          grace_limit: number | null
          id: string
          learner_capacity: number | null
          payment_id: string | null
          product: string
          quantity: number | null
          request_note: string | null
          school_id: string
          status: string
          term_number: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          academic_year?: number | null
          admin_note?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          edition: string
          grace_limit?: number | null
          id?: string
          learner_capacity?: number | null
          payment_id?: string | null
          product: string
          quantity?: number | null
          request_note?: string | null
          school_id: string
          status?: string
          term_number?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          academic_year?: number | null
          admin_note?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          edition?: string
          grace_limit?: number | null
          id?: string
          learner_capacity?: number | null
          payment_id?: string | null
          product?: string
          quantity?: number | null
          request_note?: string | null
          school_id?: string
          status?: string
          term_number?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_quotes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_quotes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          capacity_grace_days: number
          capacity_grace_percent: number
          default_max_devices: number
          enforcement_enabled: boolean
          grace_reminder_days: number[]
          id: number
          low_credit_threshold: number
          payment_mode: string
          reminder_days: number[]
          subscription_grace_days: number
          updated_at: string
        }
        Insert: {
          capacity_grace_days?: number
          capacity_grace_percent?: number
          default_max_devices?: number
          enforcement_enabled?: boolean
          grace_reminder_days?: number[]
          id?: number
          low_credit_threshold?: number
          payment_mode?: string
          reminder_days?: number[]
          subscription_grace_days?: number
          updated_at?: string
        }
        Update: {
          capacity_grace_days?: number
          capacity_grace_percent?: number
          default_max_devices?: number
          enforcement_enabled?: boolean
          grace_reminder_days?: number[]
          id?: number
          low_credit_threshold?: number
          payment_mode?: string
          reminder_days?: number[]
          subscription_grace_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      billing_upgrades: {
        Row: {
          amount: number
          created_at: string
          details: Json
          edition: string
          from_capacity: number | null
          from_tier: string | null
          id: string
          licence_id: string | null
          payment_id: string | null
          school_id: string
          subscription_id: string | null
          to_capacity: number
          to_tier: string
        }
        Insert: {
          amount: number
          created_at?: string
          details?: Json
          edition: string
          from_capacity?: number | null
          from_tier?: string | null
          id?: string
          licence_id?: string | null
          payment_id?: string | null
          school_id: string
          subscription_id?: string | null
          to_capacity: number
          to_tier: string
        }
        Update: {
          amount?: number
          created_at?: string
          details?: Json
          edition?: string
          from_capacity?: number | null
          from_tier?: string | null
          id?: string
          licence_id?: string | null
          payment_id?: string | null
          school_id?: string
          subscription_id?: string | null
          to_capacity?: number
          to_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_upgrades_licence_id_fkey"
            columns: ["licence_id"]
            isOneToOne: false
            referencedRelation: "desktop_licences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_upgrades_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_upgrades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_upgrades_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "school_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          delivery_id: string
          event_type: string | null
          id: string
          payload: Json | null
          payment_id: string | null
          payment_reference: string | null
          processed_at: string | null
          received_at: string
          result: string | null
          signature_valid: boolean
        }
        Insert: {
          delivery_id: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          payment_id?: string | null
          payment_reference?: string | null
          processed_at?: string | null
          received_at?: string
          result?: string | null
          signature_valid?: boolean
        }
        Update: {
          delivery_id?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          payment_id?: string | null
          payment_reference?: string | null
          processed_at?: string | null
          received_at?: string
          result?: string | null
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "billing_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          class_signature_path: string | null
          class_teacher_id: string | null
          created_at: string
          id: string
          level: string | null
          name: string
          school_id: string
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
          school_id: string
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
          school_id?: string
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
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
          text: string
          updated_at: string
        }
        Insert: {
          audience: Database["public"]["Enums"]["comment_audience"]
          created_at?: string
          id?: string
          max_average: number
          min_average: number
          school_id: string
          text: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["comment_audience"]
          created_at?: string
          id?: string
          max_average?: number
          min_average?: number
          school_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          field_id: string
          id: string
          learner_id: string | null
          school_id: string
          term_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          field_id: string
          id?: string
          learner_id?: string | null
          school_id: string
          term_id?: string | null
          updated_at?: string
          value?: string
        }
        Update: {
          field_id?: string
          id?: string
          learner_id?: string | null
          school_id?: string
          term_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "template_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_licence_devices: {
        Row: {
          activated_at: string
          certificate: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          device_fingerprint: string
          device_name: string | null
          id: string
          last_seen_at: string
          licence_id: string
          school_id: string
        }
        Insert: {
          activated_at?: string
          certificate?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          device_fingerprint: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          licence_id: string
          school_id: string
        }
        Update: {
          activated_at?: string
          certificate?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          licence_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desktop_licence_devices_licence_id_fkey"
            columns: ["licence_id"]
            isOneToOne: false
            referencedRelation: "desktop_licences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desktop_licence_devices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_licences: {
        Row: {
          capacity: number
          certificate: string | null
          certificate_version: number | null
          grace_limit: number
          id: string
          issued_at: string
          licence_key: string
          maintenance_until: string | null
          max_devices: number
          payment_id: string | null
          school_id: string
          status: string
          tier: string
          updated_at: string
          version: number
        }
        Insert: {
          capacity: number
          certificate?: string | null
          certificate_version?: number | null
          grace_limit: number
          id?: string
          issued_at?: string
          licence_key: string
          maintenance_until?: string | null
          max_devices?: number
          payment_id?: string | null
          school_id: string
          status?: string
          tier: string
          updated_at?: string
          version?: number
        }
        Update: {
          capacity?: number
          certificate?: string | null
          certificate_version?: number | null
          grace_limit?: number
          id?: string
          issued_at?: string
          licence_key?: string
          maintenance_until?: string | null
          max_devices?: number
          payment_id?: string | null
          school_id?: string
          status?: string
          tier?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "desktop_licences_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desktop_licences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      division_rules: {
        Row: {
          created_at: string
          description: string | null
          division: string
          id: string
          max_aggregate: number
          min_aggregate: number
          school_id: string
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
          school_id: string
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
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id: string
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
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "houses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      learners: {
        Row: {
          active_reg_type: string | null
          active_reg_types: string[]
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
          school_id: string
          section: string | null
          sex: string | null
          status: string
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          active_reg_type?: string | null
          active_reg_types?: string[]
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
          school_id: string
          section?: string | null
          sex?: string | null
          status?: string
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          active_reg_type?: string | null
          active_reg_types?: string[]
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
          school_id?: string
          section?: string | null
          sex?: string | null
          status?: string
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
            foreignKeyName: "learners_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
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
          school_id: string
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
          school_id?: string
          subject_id?: string
          teacher_initials?: string | null
          term_id?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_assessments: {
        Row: {
          comment: string | null
          created_at: string
          grade: string | null
          id: string
          learner_id: string
          learning_area_id: string
          school_id: string
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
          school_id: string
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
          school_id?: string
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
            foreignKeyName: "nursery_assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          class_signature_path: string | null
          class_teacher_id: string | null
          created_at: string
          id: string
          level: string | null
          name: string
          school_id: string
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
          school_id: string
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
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_grade_colors: {
        Row: {
          color: string
          created_at: string
          grade: string
          id: string
          label: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          grade: string
          id?: string
          label: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          grade?: string
          id?: string
          label?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_grade_colors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
          sex: string | null
          status: string
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
          school_id: string
          sex?: string | null
          status?: string
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
          school_id?: string
          sex?: string | null
          status?: string
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
            foreignKeyName: "nursery_learners_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          name: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          name?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_learning_areas_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_report_cards: {
        Row: {
          class_teacher_comment: string | null
          created_at: string
          generated_at: string | null
          head_teacher_comment: string | null
          id: string
          learner_id: string
          school_id: string
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
          school_id: string
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
          school_id?: string
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
            foreignKeyName: "nursery_report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_streams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "nursery_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_streams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_features: {
        Row: {
          category: string
          description: string
          enabled: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          description?: string
          enabled?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          description?: string
          enabled?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      report_card_issues: {
        Row: {
          academic_year: number
          id: string
          issued_at: string
          issued_by: string | null
          learner_id: string
          level: string
          method: string
          released_at: string | null
          school_id: string
          subscription_id: string | null
          term_id: string | null
          term_number: number
        }
        Insert: {
          academic_year: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          learner_id: string
          level: string
          method: string
          released_at?: string | null
          school_id: string
          subscription_id?: string | null
          term_id?: string | null
          term_number: number
        }
        Update: {
          academic_year?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          learner_id?: string
          level?: string
          method?: string
          released_at?: string | null
          school_id?: string
          subscription_id?: string | null
          term_id?: string | null
          term_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_card_issues_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_issues_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "school_subscriptions"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id: string
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
          school_id?: string
          term_id?: string
          total_marks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_credit_accounts: {
        Row: {
          adjusted: number
          balance: number | null
          purchased: number
          school_id: string
          updated_at: string
          used: number
        }
        Insert: {
          adjusted?: number
          balance?: number | null
          purchased?: number
          school_id: string
          updated_at?: string
          used?: number
        }
        Update: {
          adjusted?: number
          balance?: number | null
          purchased?: number
          school_id?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_credit_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_credit_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          issue_id: string | null
          kind: string
          note: string | null
          payment_id: string | null
          school_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          issue_id?: string | null
          kind: string
          note?: string | null
          payment_id?: string | null
          school_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          issue_id?: string | null
          kind?: string
          note?: string | null
          payment_id?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_credit_ledger_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "report_card_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_credit_ledger_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_credit_ledger_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_field_associations: {
        Row: {
          align: string
          definition_id: string | null
          font_size: number
          height: number
          id: string
          level: string
          page: number
          pdf_field: string | null
          school_id: string
          source_key: string | null
          template_id: string
          width: number
          x: number
          y: number
        }
        Insert: {
          align?: string
          definition_id?: string | null
          font_size?: number
          height?: number
          id?: string
          level: string
          page?: number
          pdf_field?: string | null
          school_id: string
          source_key?: string | null
          template_id: string
          width?: number
          x?: number
          y?: number
        }
        Update: {
          align?: string
          definition_id?: string | null
          font_size?: number
          height?: number
          id?: string
          level?: string
          page?: number
          pdf_field?: string | null
          school_id?: string
          source_key?: string | null
          template_id?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_field_associations_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "report_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_field_associations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_field_associations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_field_definitions: {
        Row: {
          archived: boolean
          created_at: string
          field_type: string
          id: string
          label: string
          level: string
          school_id: string
          scope: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          field_type?: string
          id?: string
          label: string
          level: string
          school_id: string
          scope?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          field_type?: string
          id?: string
          label?: string
          level?: string
          school_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_field_definitions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_field_values: {
        Row: {
          academic_year: number | null
          definition_id: string
          id: string
          learner_id: string | null
          level: string
          school_id: string
          term_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          academic_year?: number | null
          definition_id: string
          id?: string
          learner_id?: string | null
          level: string
          school_id: string
          term_id?: string | null
          updated_at?: string
          value?: string
        }
        Update: {
          academic_year?: number | null
          definition_id?: string
          id?: string
          learner_id?: string | null
          level?: string
          school_id?: string
          term_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_field_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "report_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_field_values_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_field_values_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string
          field_names: Json
          file_path: string
          id: string
          is_active: boolean
          level: string
          name: string
          page_count: number
          page_height: number
          page_width: number
          school_id: string
          section_map: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_names?: Json
          file_path: string
          id?: string
          is_active?: boolean
          level: string
          name: string
          page_count?: number
          page_height?: number
          page_width?: number
          school_id: string
          section_map?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_names?: Json
          file_path?: string
          id?: string
          is_active?: boolean
          level?: string
          name?: string
          page_count?: number
          page_height?: number
          page_width?: number
          school_id?: string
          section_map?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_billing_profiles: {
        Row: {
          created_at: string
          custom_capacity: number | null
          custom_grace_limit: number | null
          default_method: string | null
          edition: string
          notes: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_capacity?: number | null
          custom_grace_limit?: number | null
          default_method?: string | null
          edition?: string
          notes?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_capacity?: number | null
          custom_grace_limit?: number | null
          default_method?: string | null
          edition?: string
          notes?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_billing_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_capacity_status: {
        Row: {
          active_learners: number
          edition: string
          grace_ends_at: string | null
          grace_limit: number
          licensed: number
          over_since: string | null
          school_id: string
          state: string
          updated_at: string
        }
        Insert: {
          active_learners: number
          edition: string
          grace_ends_at?: string | null
          grace_limit: number
          licensed: number
          over_since?: string | null
          school_id: string
          state: string
          updated_at?: string
        }
        Update: {
          active_learners?: number
          edition?: string
          grace_ends_at?: string | null
          grace_limit?: number
          licensed?: number
          over_since?: string | null
          school_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_capacity_status_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_feature_overrides: {
        Row: {
          enabled: boolean
          feature_key: string
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled: boolean
          feature_key: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_feature_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "school_feature_overrides_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id: string
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
          school_id?: string
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
        Relationships: [
          {
            foreignKeyName: "school_info_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_members: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          role: Database["public"]["Enums"]["school_role"]
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: Database["public"]["Enums"]["school_role"]
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: Database["public"]["Enums"]["school_role"]
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_members_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_subscriptions: {
        Row: {
          academic_year: number
          amount: number
          capacity: number
          created_at: string
          expires_on: string
          grace_limit: number
          id: string
          payment_id: string | null
          plan: string
          school_id: string
          starts_on: string
          status: string
          term_number: number | null
          tier: string
          updated_at: string
        }
        Insert: {
          academic_year: number
          amount?: number
          capacity: number
          created_at?: string
          expires_on: string
          grace_limit: number
          id?: string
          payment_id?: string | null
          plan: string
          school_id: string
          starts_on: string
          status?: string
          term_number?: number | null
          tier: string
          updated_at?: string
        }
        Update: {
          academic_year?: number
          amount?: number
          capacity?: number
          created_at?: string
          expires_on?: string
          grace_limit?: number
          id?: string
          payment_id?: string | null
          plan?: string
          school_id?: string
          starts_on?: string
          status?: string
          term_number?: number | null
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subscriptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_term_billing: {
        Row: {
          academic_year: number
          chosen_by: string | null
          created_at: string
          method: string
          school_id: string
          subscription_id: string | null
          term_number: number
          updated_at: string
        }
        Insert: {
          academic_year: number
          chosen_by?: string | null
          created_at?: string
          method: string
          school_id: string
          subscription_id?: string | null
          term_number: number
          updated_at?: string
        }
        Update: {
          academic_year?: number
          chosen_by?: string | null
          created_at?: string
          method?: string
          school_id?: string
          subscription_id?: string | null
          term_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_term_billing_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_term_billing_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "school_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          phone: string | null
          stamp_path: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          phone?: string | null
          stamp_path?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          phone?: string | null
          stamp_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      streams: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
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
          school_id: string
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
          school_id?: string
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
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          school_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          school_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id: string
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
          school_id?: string
          section?: string
          signature_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      template_custom_fields: {
        Row: {
          created_at: string
          description: string | null
          field_type: string
          id: string
          label: string
          school_id: string
          scope: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          field_type?: string
          id?: string
          label: string
          school_id: string
          scope?: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          field_type?: string
          id?: string
          label?: string
          school_id?: string
          scope?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_custom_fields_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_custom_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field_mappings: {
        Row: {
          align: string
          created_at: string
          field_key: string
          font_size: number
          height: number
          id: string
          page: number
          school_id: string
          template_id: string
          width: number
          x: number
          y: number
        }
        Insert: {
          align?: string
          created_at?: string
          field_key: string
          font_size?: number
          height?: number
          id?: string
          page?: number
          school_id: string
          template_id: string
          width?: number
          x: number
          y: number
        }
        Update: {
          align?: string
          created_at?: string
          field_key?: string
          font_size?: number
          height?: number
          id?: string
          page?: number
          school_id?: string
          template_id?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_field_mappings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field_rules: {
        Row: {
          field_key: string
          required: boolean
          template_id: string
        }
        Insert: {
          field_key: string
          required?: boolean
          template_id: string
        }
        Update: {
          field_key?: string
          required?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_field_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_verifications: {
        Row: {
          academic_year: number
          configuration_hash: string
          learner_id: string
          level: string
          results: Json
          school_id: string
          template_id: string
          term_id: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          academic_year: number
          configuration_hash: string
          learner_id: string
          level: string
          results: Json
          school_id: string
          template_id: string
          term_id: string
          verified_at?: string
          verified_by: string
        }
        Update: {
          academic_year?: number
          configuration_hash?: string
          learner_id?: string
          level?: string
          results?: Json
          school_id?: string
          template_id?: string
          term_id?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_verifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_verifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_verifications_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id: string
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
          school_id?: string
          start_date?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      billing__audit: {
        Args: {
          _action: string
          _details?: Json
          _key: string
          _payment: string
          _school: string
        }
        Returns: undefined
      }
      billing__caller_school_for_term: {
        Args: { _term_id: string }
        Returns: string
      }
      billing__capacity_row: {
        Args: {
          _count: number
          _edition: string
          _grace: number
          _licensed: number
          _school: string
        }
        Returns: undefined
      }
      billing__issue: {
        Args: {
          _actor: string
          _allow_charge: boolean
          _dry_run: boolean
          _learners: string[]
          _level: string
          _school: string
          _term_id: string
        }
        Returns: Json
      }
      billing__new_key: {
        Args: { _days?: number; _payment_id: string }
        Returns: Json
      }
      billing_activate_key: { Args: { _key: string }; Returns: Json }
      billing_active_learner_count: {
        Args: { _school: string }
        Returns: number
      }
      billing_admin_reissue_key: {
        Args: { _payment_id: string }
        Returns: Json
      }
      billing_admin_review_payment: {
        Args: { _approve: boolean; _note?: string; _payment_id: string }
        Returns: Json
      }
      billing_admin_revoke_key: {
        Args: { _key_id: string; _note?: string }
        Returns: Json
      }
      billing_daily_maintenance: { Args: never; Returns: Json }
      billing_fulfil_payment: {
        Args: {
          _amount: number
          _currency: string
          _failure: string
          _gateway_reference: string
          _mode: string
          _payment_id: string
          _provider: string
          _status: string
        }
        Returns: Json
      }
      billing_issue_report_cards: {
        Args: {
          _allow_charge?: boolean
          _learner_ids: string[]
          _level: string
          _term_id: string
        }
        Returns: Json
      }
      billing_manual_submit_proof: {
        Args: {
          _payer_phone: string
          _payer_reference: string
          _payment_id: string
          _proof_path: string
        }
        Returns: Json
      }
      billing_my_entitlement: { Args: never; Returns: Json }
      billing_record_refund: {
        Args: { _payment_id: string; _refunded: number; _status: string }
        Returns: undefined
      }
      billing_refresh_capacity: {
        Args: { _school: string }
        Returns: undefined
      }
      billing_refresh_my_capacity: { Args: never; Returns: undefined }
      billing_release_report_cards: {
        Args: { _learner_ids: string[]; _level: string; _term_id: string }
        Returns: number
      }
      billing_report_card_quote: {
        Args: { _learner_ids: string[]; _level: string; _term_id: string }
        Returns: Json
      }
      billing_request_quote: {
        Args: {
          _capacity: number
          _edition: string
          _note: string
          _product: string
        }
        Returns: string
      }
      billing_school_entitlement: { Args: { _school: string }; Returns: Json }
      billing_set_default_method: {
        Args: { _method: string }
        Returns: undefined
      }
      billing_set_term_method: {
        Args: { _academic_year: number; _method: string; _term_number: number }
        Returns: undefined
      }
      billing_subscription_state: {
        Args: { _expires: string; _starts: string; _status: string }
        Returns: string
      }
      billing_term_number: { Args: { _name: string }; Returns: number }
      billing_term_subscription: {
        Args: { _school: string; _term: number; _year: number }
        Returns: string
      }
      billing_today: { Args: never; Returns: string }
      billing_unlock_report_output: {
        Args: {
          _action: string
          _learner_ids: string[]
          _level: string
          _term_id: string
        }
        Returns: Json
      }
      create_school_for_current_user: {
        Args: {
          _address: string
          _email: string
          _name: string
          _phone: string
        }
        Returns: string
      }
      current_user_school_id: { Args: never; Returns: string }
      feature__raise: { Args: { _key: string }; Returns: undefined }
      feature_enabled: {
        Args: { _key: string; _school: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_school_billing_admin: { Args: { _school: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      my_school_features: { Args: never; Returns: Json }
      record_template_verification: {
        Args: {
          _academic_year: number
          _learner_id: string
          _results: Json
          _template_id: string
          _term_id: string
        }
        Returns: undefined
      }
      report_colour_luminance: { Args: { c: string }; Returns: number }
      select_report_template: {
        Args: { _level: string; _template_id?: string }
        Returns: undefined
      }
      set_current_academic_year: { Args: { _id: string }; Returns: undefined }
      template_auto_source: {
        Args: { lvl: string; n: string }
        Returns: string
      }
      template_configuration_hash: { Args: { tid: string }; Returns: string }
      template_system_source: {
        Args: { k: string; lvl: string }
        Returns: boolean
      }
      upload_report_template: {
        Args: {
          _expected_level: string
          _field_names: Json
          _file_path: string
          _name: string
          _page_count: number
          _page_height: number
          _page_width: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "super_admin"
      comment_audience: "class_teacher" | "head_teacher"
      school_role: "school_admin" | "member"
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
  public: {
    Enums: {
      app_role: ["admin", "teacher", "super_admin"],
      comment_audience: ["class_teacher", "head_teacher"],
      school_role: ["school_admin", "member"],
      subject_code: ["ENG", "MTC", "SCI", "SST", "RE", "ICT", "OTHER"],
      teacher_role: ["class_teacher", "head_teacher", "subject_teacher"],
    },
  },
} as const
