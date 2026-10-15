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
    PostgrestVersion: "14.17"
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
      analytics_events: {
        Row: {
          detail: Json
          id: number
          mission_id: string
          mission_version: number
          name: string
          occurred_at: string
          run_key: string | null
          screen_key: string | null
        }
        Insert: {
          detail?: Json
          id?: number
          mission_id: string
          mission_version: number
          name: string
          occurred_at?: string
          run_key?: string | null
          screen_key?: string | null
        }
        Update: {
          detail?: Json
          id?: number
          mission_id?: string
          mission_version?: number
          name?: string
          occurred_at?: string
          run_key?: string | null
          screen_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_run_key_fkey"
            columns: ["run_key"]
            isOneToOne: false
            referencedRelation: "mission_progress"
            referencedColumns: ["analytics_key"]
          },
        ]
      }
      app_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      board_contributions: {
        Row: {
          approach: string | null
          child_id: string
          created_at: string
          curated: boolean
          evidence_id: string
          id: string
          mission_id: string
          moderated_at: string | null
          permitted_at: string | null
          status: string
          text: string
        }
        Insert: {
          approach?: string | null
          child_id: string
          created_at?: string
          curated?: boolean
          evidence_id: string
          id?: string
          mission_id: string
          moderated_at?: string | null
          permitted_at?: string | null
          status?: string
          text: string
        }
        Update: {
          approach?: string | null
          child_id?: string
          created_at?: string
          curated?: boolean
          evidence_id?: string
          id?: string
          mission_id?: string
          moderated_at?: string | null
          permitted_at?: string | null
          status?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_contributions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_contributions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: true
            referencedRelation: "mission_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_contributions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_intents: {
        Row: {
          amount_minor: number
          child_id: string
          created_at: string
          currency: string
          id: string
          mission_id: string
          parent_id: string
          stripe_session_id: string
        }
        Insert: {
          amount_minor: number
          child_id: string
          created_at?: string
          currency: string
          id?: string
          mission_id: string
          parent_id: string
          stripe_session_id: string
        }
        Update: {
          amount_minor?: number
          child_id?: string
          created_at?: string
          currency?: string
          id?: string
          mission_id?: string
          parent_id?: string
          stripe_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_intents_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_intents_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_intents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_access_credentials: {
        Row: {
          child_id: string
          code_hash: string
          code_lookup: string
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          revoked_at: string | null
        }
        Insert: {
          child_id: string
          code_hash: string
          code_lookup: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
        }
        Update: {
          child_id?: string
          code_hash?: string
          code_lookup?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_access_credentials_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_auth_attempts: {
        Row: {
          id: number
          lookup_key: string
          occurred_at: string
          succeeded: boolean
        }
        Insert: {
          id?: number
          lookup_key: string
          occurred_at?: string
          succeeded: boolean
        }
        Update: {
          id?: number
          lookup_key?: string
          occurred_at?: string
          succeeded?: boolean
        }
        Relationships: []
      }
      child_profiles: {
        Row: {
          birth_year: number | null
          created_at: string
          display_name: string
          id: string
          parent_id: string
          updated_at: string
        }
        Insert: {
          birth_year?: number | null
          created_at?: string
          display_name: string
          id?: string
          parent_id: string
          updated_at?: string
        }
        Update: {
          birth_year?: number | null
          created_at?: string
          display_name?: string
          id?: string
          parent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_profiles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_sessions: {
        Row: {
          child_id: string
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          revoked_at: string | null
          token_lookup: string
        }
        Insert: {
          child_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          token_lookup: string
        }
        Update: {
          child_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          token_lookup?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_sessions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          admin_notes: string | null
          amount_note: string | null
          code: string
          created_at: string
          id: string
          mission_name: string
          mission_slug: string
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["gift_payment_status"]
          purchased_at: string | null
          purchaser_email: string
          purchaser_name: string
          purchaser_user_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          status: Database["public"]["Enums"]["gift_status"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          amount_note?: string | null
          code: string
          created_at?: string
          id?: string
          mission_name: string
          mission_slug: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["gift_payment_status"]
          purchased_at?: string | null
          purchaser_email: string
          purchaser_name: string
          purchaser_user_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: Database["public"]["Enums"]["gift_status"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          amount_note?: string | null
          code?: string
          created_at?: string
          id?: string
          mission_name?: string
          mission_slug?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["gift_payment_status"]
          purchased_at?: string | null
          purchaser_email?: string
          purchaser_name?: string
          purchaser_user_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: Database["public"]["Enums"]["gift_status"]
          updated_at?: string
        }
        Relationships: []
      }
      journal_articles: {
        Row: {
          body: string
          category_id: string | null
          cover_image: string | null
          created_at: string
          id: string
          published: boolean
          published_at: string | null
          slug: string
          standfirst: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category_id?: string | null
          cover_image?: string | null
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          slug: string
          standfirst?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category_id?: string | null
          cover_image?: string | null
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          slug?: string
          standfirst?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "journal_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          author: string
          body: string
          content_type: Database["public"]["Enums"]["journal_content_type"]
          created_at: string
          cta_label: string | null
          deck: string | null
          excerpt: string
          featured: boolean
          featured_order: number
          hero_image_alt: string | null
          hero_image_url: string | null
          id: string
          published_at: string | null
          pull_quote: string | null
          slug: string
          status: Database["public"]["Enums"]["journal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          body?: string
          content_type: Database["public"]["Enums"]["journal_content_type"]
          created_at?: string
          cta_label?: string | null
          deck?: string | null
          excerpt?: string
          featured?: boolean
          featured_order?: number
          hero_image_alt?: string | null
          hero_image_url?: string | null
          id?: string
          published_at?: string | null
          pull_quote?: string | null
          slug: string
          status?: Database["public"]["Enums"]["journal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          body?: string
          content_type?: Database["public"]["Enums"]["journal_content_type"]
          created_at?: string
          cta_label?: string | null
          deck?: string | null
          excerpt?: string
          featured?: boolean
          featured_order?: number
          hero_image_alt?: string | null
          hero_image_url?: string | null
          id?: string
          published_at?: string | null
          pull_quote?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["journal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_promotions: {
        Row: {
          approved: boolean
          copy: string
          created_at: string
          destination_url: string
          ends_at: string | null
          id: string
          image_alt: string | null
          image_url: string | null
          is_active: boolean
          partner_name: string | null
          placement: Database["public"]["Enums"]["journal_promo_placement"]
          promo_type: Database["public"]["Enums"]["journal_promo_type"]
          public_label: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          copy?: string
          created_at?: string
          destination_url: string
          ends_at?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          partner_name?: string | null
          placement: Database["public"]["Enums"]["journal_promo_placement"]
          promo_type: Database["public"]["Enums"]["journal_promo_type"]
          public_label: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          copy?: string
          created_at?: string
          destination_url?: string
          ends_at?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          partner_name?: string | null
          placement?: Database["public"]["Enums"]["journal_promo_placement"]
          promo_type?: Database["public"]["Enums"]["journal_promo_type"]
          public_label?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_sources: {
        Row: {
          author: string | null
          created_at: string
          entry_id: string
          id: string
          position: number
          publication: string | null
          published_on: string | null
          source_title: string
          source_type: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string
          entry_id: string
          id?: string
          position?: number
          publication?: string | null
          published_on?: string | null
          source_title: string
          source_type?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string
          entry_id?: string
          id?: string
          position?: number
          publication?: string | null
          published_on?: string | null
          source_title?: string
          source_type?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_sources_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_access: {
        Row: {
          created_at: string
          gift_id: string | null
          granted_at: string
          id: string
          mission_slug: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gift_id?: string | null
          granted_at?: string
          id?: string
          mission_slug: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gift_id?: string | null
          granted_at?: string
          id?: string
          mission_slug?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_access_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_assets: {
        Row: {
          alt_text: string | null
          captions_path: string | null
          created_at: string
          id: string
          key: string
          kind: string
          long_description: string | null
          mission_id: string
          storage_path: string
          transcript: string | null
          version: number
        }
        Insert: {
          alt_text?: string | null
          captions_path?: string | null
          created_at?: string
          id?: string
          key: string
          kind: string
          long_description?: string | null
          mission_id: string
          storage_path: string
          transcript?: string | null
          version: number
        }
        Update: {
          alt_text?: string | null
          captions_path?: string | null
          created_at?: string
          id?: string
          key?: string
          kind?: string
          long_description?: string | null
          mission_id?: string
          storage_path?: string
          transcript?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_assets_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_entitlements: {
        Row: {
          child_id: string
          created_at: string
          granted_at: string
          id: string
          mission_id: string
          source: Database["public"]["Enums"]["entitlement_source"]
          status: Database["public"]["Enums"]["entitlement_status"]
          stripe_payment_intent_id: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          granted_at?: string
          id?: string
          mission_id: string
          source: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["entitlement_status"]
          stripe_payment_intent_id?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          granted_at?: string
          id?: string
          mission_id?: string
          source?: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["entitlement_status"]
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_entitlements_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_entitlements_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_evidence: {
        Row: {
          child_id: string
          created_at: string
          description: string | null
          evidence_key: string | null
          id: string
          mission_id: string
          progress_id: string | null
          related_to: string | null
          relation: string | null
          screen_key: string | null
          source: string
          storage_path: string | null
          title: string
          type: Database["public"]["Enums"]["evidence_type"]
        }
        Insert: {
          child_id: string
          created_at?: string
          description?: string | null
          evidence_key?: string | null
          id?: string
          mission_id: string
          progress_id?: string | null
          related_to?: string | null
          relation?: string | null
          screen_key?: string | null
          source?: string
          storage_path?: string | null
          title: string
          type: Database["public"]["Enums"]["evidence_type"]
        }
        Update: {
          child_id?: string
          created_at?: string
          description?: string | null
          evidence_key?: string | null
          id?: string
          mission_id?: string
          progress_id?: string | null
          related_to?: string | null
          relation?: string | null
          screen_key?: string | null
          source?: string
          storage_path?: string | null
          title?: string
          type?: Database["public"]["Enums"]["evidence_type"]
        }
        Relationships: [
          {
            foreignKeyName: "mission_evidence_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_evidence_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_evidence_progress_id_fkey"
            columns: ["progress_id"]
            isOneToOne: false
            referencedRelation: "mission_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_evidence_related_to_fkey"
            columns: ["related_to"]
            isOneToOne: false
            referencedRelation: "mission_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_parent_notes: {
        Row: {
          content: string
          document_path: string | null
          id: string
          mission_id: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          document_path?: string | null
          id?: string
          mission_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          document_path?: string | null
          id?: string
          mission_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_parent_notes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_progress: {
        Row: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        Insert: {
          analytics_key?: string
          child_id: string
          completed_at?: string | null
          completion_rule?: Json | null
          created_at?: string
          current_screen_key?: string | null
          id?: string
          last_activity_at?: string
          mission_id: string
          mission_version?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          updated_at?: string
        }
        Update: {
          analytics_key?: string
          child_id?: string
          completed_at?: string | null
          completion_rule?: Json | null
          created_at?: string
          current_screen_key?: string | null
          id?: string
          last_activity_at?: string
          mission_id?: string
          mission_version?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_progress_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_resources: {
        Row: {
          can_download: boolean
          can_print: boolean
          can_view: boolean
          created_at: string
          description: string | null
          id: string
          mission_id: string
          sort_order: number
          storage_path: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
          version: number
        }
        Insert: {
          can_download?: boolean
          can_print?: boolean
          can_view?: boolean
          created_at?: string
          description?: string | null
          id?: string
          mission_id: string
          sort_order?: number
          storage_path: string
          title: string
          type?: Database["public"]["Enums"]["resource_type"]
          version?: number
        }
        Update: {
          can_download?: boolean
          can_print?: boolean
          can_view?: boolean
          created_at?: string
          description?: string | null
          id?: string
          mission_id?: string
          sort_order?: number
          storage_path?: string
          title?: string
          type?: Database["public"]["Enums"]["resource_type"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_resources_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_responses: {
        Row: {
          created_at: string
          id: string
          progress_id: string
          screen_key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          progress_id: string
          screen_key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          progress_id?: string
          screen_key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mission_responses_progress_id_fkey"
            columns: ["progress_id"]
            isOneToOne: false
            referencedRelation: "mission_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_screens: {
        Row: {
          body: string | null
          configuration: Json
          created_at: string
          id: string
          mission_id: string
          screen_key: string
          sequence: number
          title: string | null
          type: Database["public"]["Enums"]["screen_type"]
          updated_at: string
          version: number
        }
        Insert: {
          body?: string | null
          configuration?: Json
          created_at?: string
          id?: string
          mission_id: string
          screen_key: string
          sequence: number
          title?: string | null
          type: Database["public"]["Enums"]["screen_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string | null
          configuration?: Json
          created_at?: string
          id?: string
          mission_id?: string
          screen_key?: string
          sequence?: number
          title?: string | null
          type?: Database["public"]["Enums"]["screen_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_screens_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_state: {
        Row: {
          progress_id: string
          state_data: Json
          updated_at: string
        }
        Insert: {
          progress_id: string
          state_data?: Json
          updated_at?: string
        }
        Update: {
          progress_id?: string
          state_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_state_progress_id_fkey"
            columns: ["progress_id"]
            isOneToOne: true
            referencedRelation: "mission_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_state_private: {
        Row: {
          data: Json
          progress_id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          progress_id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          progress_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_state_private_progress_id_fkey"
            columns: ["progress_id"]
            isOneToOne: true
            referencedRelation: "mission_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_versions: {
        Row: {
          archived_at: string | null
          completion_rule: Json | null
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          mission_id: string
          notes: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["mission_version_status"]
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          completion_rule?: Json | null
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          mission_id: string
          notes?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["mission_version_status"]
          submitted_at?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          archived_at?: string | null
          completion_rule?: Json | null
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          mission_id?: string
          notes?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["mission_version_status"]
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_versions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          completion_rule: Json | null
          cover_image: string | null
          created_at: string
          currency: string
          delivery_type: Database["public"]["Enums"]["mission_delivery"]
          description: string | null
          duration: string | null
          id: string
          is_free: boolean
          lab: Database["public"]["Enums"]["wla_lab"]
          max_age: number
          min_age: number
          price_minor: number | null
          published: boolean
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          completion_rule?: Json | null
          cover_image?: string | null
          created_at?: string
          currency?: string
          delivery_type?: Database["public"]["Enums"]["mission_delivery"]
          description?: string | null
          duration?: string | null
          id?: string
          is_free?: boolean
          lab: Database["public"]["Enums"]["wla_lab"]
          max_age: number
          min_age: number
          price_minor?: number | null
          published?: boolean
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          completion_rule?: Json | null
          cover_image?: string | null
          created_at?: string
          currency?: string
          delivery_type?: Database["public"]["Enums"]["mission_delivery"]
          description?: string | null
          duration?: string | null
          id?: string
          is_free?: boolean
          lab?: Database["public"]["Enums"]["wla_lab"]
          max_age?: number
          min_age?: number
          price_minor?: number | null
          published?: boolean
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_admin: boolean
          name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_admin?: boolean
          name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          admin_notes: string | null
          attribution: Database["public"]["Enums"]["review_attribution"]
          body: string
          consent: boolean
          created_at: string
          display_name: string
          featured: boolean
          featured_order: number
          id: string
          mission_name: string | null
          mission_slug: string | null
          published_at: string | null
          rating: number
          reviewer_email: string | null
          reviewer_name: string | null
          status: Database["public"]["Enums"]["review_status"]
          submitted_at: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          admin_notes?: string | null
          attribution?: Database["public"]["Enums"]["review_attribution"]
          body: string
          consent?: boolean
          created_at?: string
          display_name?: string
          featured?: boolean
          featured_order?: number
          id?: string
          mission_name?: string | null
          mission_slug?: string | null
          published_at?: string | null
          rating: number
          reviewer_email?: string | null
          reviewer_name?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          submitted_at?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          admin_notes?: string | null
          attribution?: Database["public"]["Enums"]["review_attribution"]
          body?: string
          consent?: boolean
          created_at?: string
          display_name?: string
          featured?: boolean
          featured_order?: number
          id?: string
          mission_name?: string | null
          mission_slug?: string | null
          published_at?: string | null
          rating?: number
          reviewer_email?: string | null
          reviewer_name?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          submitted_at?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          processed_at?: string
          type?: string
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
      admin_activity: {
        Args: { p_limit?: number }
        Returns: {
          detail: string
          happened_at: string
          kind: string
          subject: string
        }[]
      }
      admin_analytics: {
        Args: never
        Returns: {
          completion_rate: number
          completions: number
          entitlements: number
          in_progress: number
          mission_id: string
          published_version: number
          quiet_14d: number
          slug: string
          starts: number
          title: string
        }[]
      }
      admin_board_moderate: {
        Args: {
          p_action: string
          p_approach: string
          p_curated: boolean
          p_id: string
          p_text: string
        }
        Returns: undefined
      }
      admin_board_queue: {
        Args: never
        Returns: {
          approach: string
          created_at: string
          curated: boolean
          id: string
          lab: Database["public"]["Enums"]["wla_lab"]
          mission_title: string
          moderated_at: string
          status: string
          text: string
        }[]
      }
      admin_children: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          access_code_status: string
          birth_year: number
          code_last_used_at: string
          complete: number
          display_name: string
          id: string
          in_progress: number
          last_activity_at: string
          missions: number
          parent_email: string
        }[]
      }
      admin_delete_asset: {
        Args: { p_key: string; p_mission_id: string; p_version: number }
        Returns: undefined
      }
      admin_delete_resource: {
        Args: { p_id: string; p_mission_id: string; p_version: number }
        Returns: undefined
      }
      admin_delete_screen: {
        Args: { p_mission_id: string; p_screen_key: string; p_version: number }
        Returns: undefined
      }
      admin_draft_assets: {
        Args: { p_mission_id: string; p_version: number }
        Returns: {
          alt_text: string | null
          captions_path: string | null
          created_at: string
          id: string
          key: string
          kind: string
          long_description: string | null
          mission_id: string
          storage_path: string
          transcript: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "mission_assets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_draft_definition: {
        Args: { p_mission_id: string; p_version: number }
        Returns: Json
      }
      admin_draft_parent_note: {
        Args: { p_mission_id: string; p_version: number }
        Returns: {
          content: string
          document_path: string
        }[]
      }
      admin_draft_resources: {
        Args: { p_mission_id: string; p_version: number }
        Returns: {
          can_download: boolean
          can_print: boolean
          can_view: boolean
          description: string
          id: string
          sort_order: number
          storage_path: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
        }[]
      }
      admin_draft_screens: {
        Args: { p_mission_id: string; p_version: number }
        Returns: {
          body: string
          configuration: Json
          id: string
          screen_key: string
          sequence: number
          title: string
          type: Database["public"]["Enums"]["screen_type"]
        }[]
      }
      admin_duplicate_mission: {
        Args: {
          p_from_version?: number
          p_slug: string
          p_source_id: string
          p_title: string
        }
        Returns: Json
      }
      admin_mission_insights: {
        Args: { p_mission_id: string; p_version?: number }
        Returns: Json
      }
      admin_mission_stats: {
        Args: { p_stale_days?: number }
        Returns: {
          completions: number
          currency: string
          dropped_off: number
          entitlements: number
          in_progress: number
          is_free: boolean
          mission_id: string
          price_minor: number
          published: boolean
          slug: string
          starts: number
          title: string
          version: number
        }[]
      }
      admin_mission_version_usage: {
        Args: { p_mission_id: string }
        Returns: {
          complete: number
          runs: number
          version: number
        }[]
      }
      admin_mission_versions: {
        Args: { p_mission_id: string }
        Returns: {
          complete: number
          completion_rule: Json
          created_at: string
          published_at: string
          runs: number
          screens: number
          status: Database["public"]["Enums"]["mission_version_status"]
          version: number
        }[]
      }
      admin_move_resource: {
        Args: {
          p_direction: string
          p_id: string
          p_mission_id: string
          p_version: number
        }
        Returns: undefined
      }
      admin_move_screen: {
        Args: {
          p_direction: string
          p_mission_id: string
          p_screen_key: string
          p_version: number
        }
        Returns: undefined
      }
      admin_orders: {
        Args: { p_limit?: number }
        Returns: {
          amount_minor: number
          child_name: string
          created_at: string
          currency: string
          id: string
          mission_title: string
          parent_email: string
          state: string
        }[]
      }
      admin_overview: {
        Args: never
        Returns: {
          active_learners: number
          children: number
          completions: number
          draft_missions: number
          orders: number
          parents: number
          published_missions: number
          starts: number
        }[]
      }
      admin_parents: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          children: number
          email: string
          entitlements: number
          id: string
          is_admin: boolean
          joined_at: string
          name: string
          orders: number
        }[]
      }
      admin_preview_screen: {
        Args: { p_mission_id: string; p_screen_key?: string; p_version: number }
        Returns: {
          body: string
          configuration: Json
          next_sequence_key: string
          screen_key: string
          sequence: number
          title: string
          type: Database["public"]["Enums"]["screen_type"]
        }[]
      }
      admin_save_parent_note: {
        Args: {
          p_content: string
          p_document_path: string
          p_mission_id: string
          p_version: number
        }
        Returns: undefined
      }
      admin_set_completion_rule: {
        Args: { p_mission_id: string; p_rule: Json; p_version: number }
        Returns: undefined
      }
      admin_set_definition: {
        Args: { p_definition: Json; p_mission_id: string; p_version: number }
        Returns: undefined
      }
      admin_upsert_asset: {
        Args: {
          p_alt_text: string
          p_captions_path: string
          p_key: string
          p_kind: string
          p_long_description: string
          p_mission_id: string
          p_storage_path: string
          p_transcript: string
          p_version: number
        }
        Returns: {
          alt_text: string | null
          captions_path: string | null
          created_at: string
          id: string
          key: string
          kind: string
          long_description: string | null
          mission_id: string
          storage_path: string
          transcript: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "mission_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_resource: {
        Args: {
          p_can_download: boolean
          p_can_print: boolean
          p_can_view: boolean
          p_description: string
          p_id: string
          p_mission_id: string
          p_sort_order: number
          p_storage_path: string
          p_title: string
          p_type: Database["public"]["Enums"]["resource_type"]
          p_version: number
        }
        Returns: {
          can_download: boolean
          can_print: boolean
          can_view: boolean
          created_at: string
          description: string | null
          id: string
          mission_id: string
          sort_order: number
          storage_path: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "mission_resources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_screen: {
        Args: {
          p_body: string
          p_configuration: Json
          p_mission_id: string
          p_screen_key: string
          p_sequence: number
          p_title: string
          p_type: Database["public"]["Enums"]["screen_type"]
          p_version: number
        }
        Returns: {
          body: string | null
          configuration: Json
          created_at: string
          id: string
          mission_id: string
          screen_key: string
          sequence: number
          title: string | null
          type: Database["public"]["Enums"]["screen_type"]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "mission_screens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_editable_version: {
        Args: { p_mission_id: string; p_version: number }
        Returns: undefined
      }
      assume_child_actor: { Args: { p_token: string }; Returns: string }
      board_family_contributions: {
        Args: never
        Returns: {
          child_id: string
          child_name: string
          created_at: string
          evidence_id: string
          id: string
          mission_title: string
          status: string
          text: string
        }[]
      }
      board_offer: {
        Args: { p_child_id: string; p_evidence_id: string }
        Returns: string
      }
      board_permit: {
        Args: { p_allow: boolean; p_id: string }
        Returns: undefined
      }
      board_published: {
        Args: { p_child_id: string }
        Returns: {
          approach: string
          curated: boolean
          lab: Database["public"]["Enums"]["wla_lab"]
          mission_slug: string
          mission_title: string
          published_at: string
          text: string
        }[]
      }
      board_withdraw: { Args: { p_id: string }; Returns: undefined }
      child_code_lookup: { Args: { p_code: string }; Returns: string }
      child_session_board: {
        Args: { p_token: string }
        Returns: {
          approach: string
          curated: boolean
          lab: Database["public"]["Enums"]["wla_lab"]
          mission_slug: string
          mission_title: string
          published_at: string
          text: string
        }[]
      }
      child_session_board_offer: {
        Args: { p_evidence_id: string; p_token: string }
        Returns: string
      }
      child_session_board_offers: {
        Args: { p_token: string }
        Returns: {
          evidence_id: string
          status: string
        }[]
      }
      child_session_complete_mission: {
        Args: {
          p_progress_id: string
          p_state: Json
          p_token: string
          p_trail?: Json
        }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      child_session_current_screen: {
        Args: { p_mission_id: string; p_token: string }
        Returns: {
          body: string
          configuration: Json
          next_sequence_key: string
          screen_key: string
          sequence: number
          title: string
          type: Database["public"]["Enums"]["screen_type"]
        }[]
      }
      child_session_kit: {
        Args: { p_mission_slug: string; p_token: string }
        Returns: {
          can_download: boolean
          can_print: boolean
          can_view: boolean
          description: string
          id: string
          sort_order: number
          storage_path: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
        }[]
      }
      child_session_mission: {
        Args: { p_mission_slug: string; p_token: string }
        Returns: {
          completion_rule: Json
          cover_image: string
          current_screen_key: string
          delivery_type: Database["public"]["Enums"]["mission_delivery"]
          description: string
          duration: string
          lab: Database["public"]["Enums"]["wla_lab"]
          max_age: number
          min_age: number
          mission_id: string
          mission_version: number
          progress_id: string
          slug: string
          status: Database["public"]["Enums"]["mission_status"]
          title: string
        }[]
      }
      child_session_missions: {
        Args: { p_token: string }
        Returns: {
          cover_image: string
          current_screen_key: string
          delivery_type: Database["public"]["Enums"]["mission_delivery"]
          description: string
          duration: string
          lab: Database["public"]["Enums"]["wla_lab"]
          last_activity_at: string
          max_age: number
          min_age: number
          mission_id: string
          mission_version: number
          slug: string
          status: Database["public"]["Enums"]["mission_status"]
          title: string
        }[]
      }
      child_session_persist_state: {
        Args: {
          p_progress_id: string
          p_response_key?: string
          p_response_value?: Json
          p_screen_key?: string
          p_state: Json
          p_token: string
        }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      child_session_record_event: {
        Args: { p_mission_id: string; p_name: string; p_token: string }
        Returns: undefined
      }
      child_session_resource_path: {
        Args: { p_resource_id: string; p_token: string }
        Returns: string
      }
      child_session_resources: {
        Args: { p_mission_slug: string; p_token: string }
        Returns: {
          can_download: boolean
          can_print: boolean
          can_view: boolean
          description: string
          id: string
          sort_order: number
          storage_path: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
        }[]
      }
      child_session_start_mission: {
        Args: { p_mission_id: string; p_token: string }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      child_session_state: {
        Args: { p_progress_id: string; p_token: string }
        Returns: Json
      }
      child_session_trail: {
        Args: { p_mission_slug: string; p_token: string }
        Returns: {
          created_at: string
          description: string
          evidence_key: string
          id: string
          related_to: string
          relation: string
          screen_key: string
          source: string
          title: string
          type: Database["public"]["Enums"]["evidence_type"]
        }[]
      }
      complete_mission: {
        Args: { p_progress_id: string; p_state: Json; p_trail?: Json }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_mission: {
        Args: {
          p_lab: Database["public"]["Enums"]["wla_lab"]
          p_max_age: number
          p_min_age: number
          p_slug: string
          p_title: string
        }
        Returns: {
          completion_rule: Json | null
          cover_image: string | null
          created_at: string
          currency: string
          delivery_type: Database["public"]["Enums"]["mission_delivery"]
          description: string | null
          duration: string | null
          id: string
          is_free: boolean
          lab: Database["public"]["Enums"]["wla_lab"]
          max_age: number
          min_age: number
          price_minor: number | null
          published: boolean
          slug: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "missions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_mission_version: {
        Args: { p_from_version?: number; p_mission_id: string }
        Returns: {
          archived_at: string | null
          completion_rule: Json | null
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          mission_id: string
          notes: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["mission_version_status"]
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "mission_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_mission_if_unused: {
        Args: { p_mission_id: string }
        Returns: boolean
      }
      effective_mission_version: {
        Args: { p_child_id: string; p_mission_id: string }
        Returns: number
      }
      engine_load_run: { Args: { p_progress_id: string }; Returns: Json }
      engine_record_events: {
        Args: { p_events: Json; p_progress_id: string }
        Returns: undefined
      }
      engine_save: {
        Args: {
          p_complete: boolean
          p_events: Json
          p_evidence: Json
          p_private: Json
          p_progress_id: string
          p_response_key: string
          p_response_value: Json
          p_screen_key: string
          p_state: Json
        }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gen_child_code: { Args: never; Returns: string }
      generate_child_access_code: {
        Args: { p_child_id: string }
        Returns: string
      }
      get_current_mission_screen: {
        Args: { p_child_id: string; p_mission_id: string }
        Returns: {
          body: string
          configuration: Json
          next_sequence_key: string
          screen_key: string
          sequence: number
          title: string
          type: Database["public"]["Enums"]["screen_type"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      mission_kit_for_child: {
        Args: { p_child_id: string; p_mission_id: string }
        Returns: {
          can_download: boolean
          can_print: boolean
          can_view: boolean
          description: string
          id: string
          sort_order: number
          storage_path: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
        }[]
      }
      normalize_child_code: { Args: { p_code: string }; Returns: string }
      owns_child: { Args: { target_child: string }; Returns: boolean }
      owns_progress: { Args: { target_progress: string }; Returns: boolean }
      persist_mission_state: {
        Args: {
          p_progress_id: string
          p_response_key?: string
          p_response_value?: Json
          p_screen_key?: string
          p_state: Json
        }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_mission_event: {
        Args: { p_child_id: string; p_mission_id: string; p_name: string }
        Returns: undefined
      }
      redeem_child_code: {
        Args: { p_code: string }
        Returns: {
          child_id: string
          display_name: string
          expires_at: string
          outcome: string
          token: string
        }[]
      }
      revoke_child_access_code: {
        Args: { p_child_id: string }
        Returns: undefined
      }
      revoke_child_session: { Args: { p_token: string }; Returns: undefined }
      set_mission_version_status: {
        Args: {
          p_mission_id: string
          p_status: Database["public"]["Enums"]["mission_version_status"]
          p_version: number
        }
        Returns: {
          archived_at: string | null
          completion_rule: Json | null
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          mission_id: string
          notes: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["mission_version_status"]
          submitted_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "mission_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_mission: {
        Args: { p_child_id: string; p_mission_id: string }
        Returns: {
          analytics_key: string
          child_id: string
          completed_at: string | null
          completion_rule: Json | null
          created_at: string
          current_screen_key: string | null
          id: string
          last_activity_at: string
          mission_id: string
          mission_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "mission_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_mission_version: {
        Args: { p_mission_id: string; p_version: number }
        Returns: {
          blocking: boolean
          code: string
          detail: string
          screen_key: string
        }[]
      }
      verify_child_session: {
        Args: { p_token: string }
        Returns: {
          birth_year: number
          child_id: string
          display_name: string
          expires_at: string
        }[]
      }
    }
    Enums: {
      app_role: "admin"
      entitlement_source: "free" | "purchase" | "gift" | "redeemed" | "admin"
      entitlement_status: "active" | "revoked"
      evidence_type: "physical" | "digital"
      gift_payment_status: "pending" | "paid" | "failed" | "refunded"
      gift_status: "unused" | "redeemed" | "cancelled" | "refunded"
      journal_content_type: "essay" | "reading_note" | "field_note"
      journal_promo_placement:
        | "in_article"
        | "below_article"
        | "between_sections"
      journal_promo_type: "from_wla" | "sponsored" | "recommended_resource"
      journal_status: "draft" | "published"
      mission_delivery: "physical" | "hybrid" | "digital"
      mission_status: "not_started" | "in_progress" | "complete"
      mission_version_status: "draft" | "in_review" | "published" | "archived"
      resource_type: "pdf" | "image" | "document" | "other"
      review_attribution: "anonymous" | "first_name" | "initials"
      review_status: "pending" | "published" | "declined"
      screen_type:
        | "content"
        | "choice"
        | "response"
        | "reveal"
        | "handoff"
        | "completion"
        | "prepare"
        | "multi_choice"
        | "tracker"
        | "sort_items"
        | "tracker_confirmation"
        | "reflection"
        | "numeric_entry"
        | "code_entry"
        | "token_sequence"
        | "arrange"
        | "matching"
        | "allocate"
        | "inventory"
        | "compare"
        | "hotspot"
        | "sketch"
        | "map"
        | "pattern_grid"
        | "simulation"
        | "workspace"
        | "device_input"
      wla_lab:
        | "challenge"
        | "decision"
        | "curiosity"
        | "wellbeing"
        | "navigation"
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
      app_role: ["admin"],
      entitlement_source: ["free", "purchase", "gift", "redeemed", "admin"],
      entitlement_status: ["active", "revoked"],
      evidence_type: ["physical", "digital"],
      gift_payment_status: ["pending", "paid", "failed", "refunded"],
      gift_status: ["unused", "redeemed", "cancelled", "refunded"],
      journal_content_type: ["essay", "reading_note", "field_note"],
      journal_promo_placement: [
        "in_article",
        "below_article",
        "between_sections",
      ],
      journal_promo_type: ["from_wla", "sponsored", "recommended_resource"],
      journal_status: ["draft", "published"],
      mission_delivery: ["physical", "hybrid", "digital"],
      mission_status: ["not_started", "in_progress", "complete"],
      mission_version_status: ["draft", "in_review", "published", "archived"],
      resource_type: ["pdf", "image", "document", "other"],
      review_attribution: ["anonymous", "first_name", "initials"],
      review_status: ["pending", "published", "declined"],
      screen_type: [
        "content",
        "choice",
        "response",
        "reveal",
        "handoff",
        "completion",
        "prepare",
        "multi_choice",
        "tracker",
        "sort_items",
        "tracker_confirmation",
        "reflection",
        "numeric_entry",
        "code_entry",
        "token_sequence",
        "arrange",
        "matching",
        "allocate",
        "inventory",
        "compare",
        "hotspot",
        "sketch",
        "map",
        "pattern_grid",
        "simulation",
        "workspace",
        "device_input",
      ],
      wla_lab: [
        "challenge",
        "decision",
        "curiosity",
        "wellbeing",
        "navigation",
      ],
    },
  },
} as const
