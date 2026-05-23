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
      analytics_document_access: {
        Row: {
          accessed_at: string | null
          document_id: string
          id: string
          query_id: string | null
          relevance_score: number | null
          user_id: string
        }
        Insert: {
          accessed_at?: string | null
          document_id: string
          id?: string
          query_id?: string | null
          relevance_score?: number | null
          user_id: string
        }
        Update: {
          accessed_at?: string | null
          document_id?: string
          id?: string
          query_id?: string | null
          relevance_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_document_access_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_document_access_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "analytics_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_queries: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          documents_referenced: number | null
          execution_time_ms: number | null
          id: string
          query_text: string
          response_length: number | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          documents_referenced?: number | null
          execution_time_ms?: number | null
          id?: string
          query_text: string
          response_length?: number | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          documents_referenced?: number | null
          execution_time_ms?: number | null
          id?: string
          query_text?: string
          response_length?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_queries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      application_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          ip_address: string | null
          level: string
          message: string
          session_id: string | null
          source: string
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          level: string
          message: string
          session_id?: string | null
          source: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          level?: string
          message?: string
          session_id?: string | null
          source?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          sources: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          sources?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content_text: string
          created_at: string
          document_id: string
          end_page: number
          id: string
          page_map: Json
          start_page: number
        }
        Insert: {
          chunk_index: number
          content_text: string
          created_at?: string
          document_id: string
          end_page: number
          id?: string
          page_map: Json
          start_page: number
        }
        Update: {
          chunk_index?: number
          content_text?: string
          created_at?: string
          document_id?: string
          end_page?: number
          id?: string
          page_map?: Json
          start_page?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_embeddings: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          page_number: number | null
          updated_at: string | null
        }
        Insert: {
          chunk_index: number
          chunk_text: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          updated_at?: string | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_enriched_metadata: {
        Row: {
          confidence_score: number | null
          creation_date: string | null
          detected_entities: Json | null
          document_id: string
          document_type: string | null
          extracted_at: string
          file_size_bytes: number | null
          file_type: string | null
          id: string
          keywords: string[] | null
          last_modified_date: string | null
          page_count: number | null
          priority_indicator: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          creation_date?: string | null
          detected_entities?: Json | null
          document_id: string
          document_type?: string | null
          extracted_at?: string
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          keywords?: string[] | null
          last_modified_date?: string | null
          page_count?: number | null
          priority_indicator?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          creation_date?: string | null
          detected_entities?: Json | null
          document_id?: string
          document_type?: string | null
          extracted_at?: string
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          keywords?: string[] | null
          last_modified_date?: string | null
          page_count?: number | null
          priority_indicator?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_enriched_metadata_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_markdown: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          id: string
          ocr_markdown: string | null
          ocr_model: string | null
          target_language: string | null
          translated_markdown: string | null
          translation_model: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          id?: string
          ocr_markdown?: string | null
          ocr_model?: string | null
          target_language?: string | null
          translated_markdown?: string | null
          translation_model?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          ocr_markdown?: string | null
          ocr_model?: string | null
          target_language?: string | null
          translated_markdown?: string | null
          translation_model?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_markdown_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_metadata: {
        Row: {
          created_at: string
          document_id: string
          field_id: string
          id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          document_id: string
          field_id: string
          id?: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          document_id?: string
          field_id?: string
          id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_metadata_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_metadata_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "metadata_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          error_message: string | null
          id: string
          max_retries: number
          metadata: Json | null
          priority: number
          retry_count: number
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_message?: string | null
          id?: string
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_message?: string | null
          id?: string
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signers: {
        Row: {
          created_at: string
          declined_reason: string | null
          id: string
          order_index: number
          signature_request_id: string
          signed_at: string | null
          signer_email: string
          signer_user_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          declined_reason?: string | null
          id?: string
          order_index?: number
          signature_request_id: string
          signed_at?: string | null
          signer_email: string
          signer_user_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          declined_reason?: string | null
          id?: string
          order_index?: number
          signature_request_id?: string
          signed_at?: string | null
          signer_email?: string
          signer_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signers_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      document_tags: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      document_taxonomies: {
        Row: {
          created_at: string
          document_id: string
          id: string
          taxonomy_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          taxonomy_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          taxonomy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_taxonomies_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_taxonomies_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string
          content: string | null
          created_at: string | null
          created_by: string
          description: string | null
          fields: Json | null
          id: string
          is_public: boolean | null
          name: string
          template_type: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category: string
          content?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          fields?: Json | null
          id?: string
          is_public?: boolean | null
          name: string
          template_type: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          fields?: Json | null
          id?: string
          is_public?: boolean | null
          name?: string
          template_type?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          change_description: string | null
          content_text: string | null
          created_at: string
          created_by: string
          document_id: string
          id: string
          mime_type: string | null
          original_filename: string
          sensitivity: string
          status: string
          storage_path: string
          summary: string | null
          title: string
          version_number: number
        }
        Insert: {
          change_description?: string | null
          content_text?: string | null
          created_at?: string
          created_by: string
          document_id: string
          id?: string
          mime_type?: string | null
          original_filename: string
          sensitivity?: string
          status?: string
          storage_path: string
          summary?: string | null
          title: string
          version_number: number
        }
        Update: {
          change_description?: string | null
          content_text?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          mime_type?: string | null
          original_filename?: string
          sensitivity?: string
          status?: string
          storage_path?: string
          summary?: string | null
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_text: string | null
          created_at: string | null
          created_by: string
          folder_id: string | null
          id: string
          is_editable: boolean | null
          mime_type: string | null
          original_filename: string
          page_map: Json | null
          sensitivity: string | null
          status: string | null
          storage_path: string
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content_text?: string | null
          created_at?: string | null
          created_by: string
          folder_id?: string | null
          id?: string
          is_editable?: boolean | null
          mime_type?: string | null
          original_filename: string
          page_map?: Json | null
          sensitivity?: string | null
          status?: string | null
          storage_path: string
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content_text?: string | null
          created_at?: string | null
          created_by?: string
          folder_id?: string | null
          id?: string
          is_editable?: boolean | null
          mime_type?: string | null
          original_filename?: string
          page_map?: Json | null
          sensitivity?: string | null
          status?: string | null
          storage_path?: string
          summary?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_access: {
        Row: {
          access_level: Database["public"]["Enums"]["folder_access_level"]
          created_at: string
          folder_id: string
          granted_by: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["folder_access_level"]
          created_at?: string
          folder_id: string
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["folder_access_level"]
          created_at?: string
          folder_id?: string
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_access_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          level: number | null
          name: string
          parent_id: string | null
          path: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          level?: number | null
          name: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          level?: number | null
          name?: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "user_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_field_definitions: {
        Row: {
          created_at: string
          created_by: string
          default_value: string | null
          display_order: number | null
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          label: string
          name: string
          options: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_value?: string | null
          display_order?: number | null
          field_type: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label: string
          name: string
          options?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_value?: string | null
          display_order?: number | null
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label?: string
          name?: string
          options?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      metadata_template_fields: {
        Row: {
          created_at: string
          display_order: number | null
          field_id: string
          id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          field_id: string
          id?: string
          template_id: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          field_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metadata_template_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "metadata_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metadata_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "metadata_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_audit: {
        Row: {
          action: string
          document_id: string
          from_folder_id: string | null
          id: string
          is_automatic: boolean
          metadata_snapshot: Json | null
          performed_at: string
          performed_by: string | null
          reason: string | null
          rule_id: string | null
          to_folder_id: string | null
        }
        Insert: {
          action: string
          document_id: string
          from_folder_id?: string | null
          id?: string
          is_automatic?: boolean
          metadata_snapshot?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          rule_id?: string | null
          to_folder_id?: string | null
        }
        Update: {
          action?: string
          document_id?: string
          from_folder_id?: string | null
          id?: string
          is_automatic?: boolean
          metadata_snapshot?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          rule_id?: string | null
          to_folder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_audit_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_from_folder_id_fkey"
            columns: ["from_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "organization_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_to_folder_id_fkey"
            columns: ["to_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_rules: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          target_folder_id: string | null
          updated_at: string
        }
        Insert: {
          conditions: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          target_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          target_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_rules_target_folder_id_fkey"
            columns: ["target_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_conversions: {
        Row: {
          completed_at: string | null
          converted_file_path: string | null
          created_at: string
          error_message: string | null
          id: string
          original_file_path: string
          original_filename: string
          page_count: number | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          converted_file_path?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          original_file_path: string
          original_filename: string
          page_count?: number | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          converted_file_path?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          original_file_path?: string
          original_filename?: string
          page_count?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signature_requests: {
        Row: {
          created_at: string
          document_id: string
          due_date: string | null
          id: string
          message: string | null
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          due_date?: string | null
          id?: string
          message?: string | null
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          due_date?: string | null
          id?: string
          message?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          created_at: string
          document_signer_id: string
          id: string
          ip_address: string | null
          signature_data: string
          signature_type: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          document_signer_id: string
          id?: string
          ip_address?: string | null
          signature_data: string
          signature_type: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          document_signer_id?: string
          id?: string
          ip_address?: string | null
          signature_data?: string
          signature_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_document_signer_id_fkey"
            columns: ["document_signer_id"]
            isOneToOne: false
            referencedRelation: "document_signers"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      taxonomies: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          level: number | null
          name: string
          parent_id: string | null
          path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          name: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          name?: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_history: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          original_filename: string
          original_storage_path: string
          skipped_cells: number
          source_language: string
          target_language: string
          total_cells: number
          translated_cells: number
          translated_filename: string
          translated_storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          original_filename: string
          original_storage_path: string
          skipped_cells?: number
          source_language: string
          target_language: string
          total_cells?: number
          translated_cells?: number
          translated_filename: string
          translated_storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          original_filename?: string
          original_storage_path?: string
          skipped_cells?: number
          source_language?: string
          target_language?: string
          total_cells?: number
          translated_cells?: number
          translated_filename?: string
          translated_storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_messages: {
        Row: {
          content: string
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_read: boolean
          receiver_id: string
          replied_to_message_id: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          receiver_id: string
          replied_to_message_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          receiver_id?: string
          replied_to_message_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_messages_replied_to_message_id_fkey"
            columns: ["replied_to_message_id"]
            isOneToOne: false
            referencedRelation: "user_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
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
      can_access_signature_request: {
        Args: { _signature_request_id: string; _user_id: string }
        Returns: boolean
      }
      cleanup_old_logs: { Args: never; Returns: undefined }
      get_document_access_stats: {
        Args: { filter_user_id?: string; limit_count?: number }
        Returns: {
          access_count: number
          avg_relevance: number
          document_id: string
          document_title: string
          last_accessed: string
        }[]
      }
      get_folder_stats: {
        Args: { folder_id: string }
        Returns: {
          document_count: number
          total_size_bytes: number
        }[]
      }
      get_folder_tree: {
        Args: {
          filter_category?: string
          root_folder_id?: string
          user_id?: string
        }
        Returns: {
          category: string
          color: string
          created_at: string
          description: string
          document_count: number
          id: string
          level: number
          name: string
          parent_id: string
          path: string
          updated_at: string
        }[]
      }
      get_popular_queries: {
        Args: { filter_user_id?: string; limit_count?: number }
        Returns: {
          avg_documents_referenced: number
          avg_response_length: number
          query_count: number
          query_text: string
        }[]
      }
      has_folder_access: {
        Args: {
          _folder_id: string
          _required_level?: Database["public"]["Enums"]["folder_access_level"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_signer_for_request: {
        Args: {
          _signature_request_id: string
          _user_email: string
          _user_id: string
        }
        Returns: boolean
      }
      search_documents_by_embedding: {
        Args: {
          filter_user_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_text: string
          document_id: string
          document_title: string
          page_number: number
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      folder_access_level: "view" | "edit" | "manage"
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
      app_role: ["admin", "moderator", "user"],
      folder_access_level: ["view", "edit", "manage"],
    },
  },
} as const
