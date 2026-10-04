/**
 * Supabase schema types.
 *
 * Hand-written to mirror supabase/migrations/20260925220000_init.sql so the app types
 * compile before a Supabase project exists. Once one is provisioned, replace
 * this file wholesale with:
 *
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 *
 * Row types are declared standalone and the Database map is assembled from
 * them — a self-referential `Partial<Database[...]["Row"]>` inside the map
 * makes TypeScript resolve the whole table to `never`.
 */

export type MissionStatus = "not_started" | "in_progress" | "complete";
export type EntitlementSource =
  "free" | "purchase" | "gift" | "redeemed" | "admin";
export type EntitlementStatus = "active" | "revoked";
export type MissionDelivery = "physical" | "hybrid" | "digital";
export type WlaLab =
  "challenge" | "decision" | "curiosity" | "wellbeing" | "navigation";
export type ScreenTypeDb =
  | "content"
  | "choice"
  | "response"
  | "reveal"
  | "handoff"
  | "prepare"
  | "multi_choice"
  | "tracker"
  | "sort_items"
  | "tracker_confirmation"
  | "reflection"
  | "completion";
export type ResourceType = "pdf" | "image" | "document" | "other";
export type EvidenceType = "physical" | "digital";

export type Json =
  string | number | boolean | null | { [k: string]: Json } | Json[];

// ------------------------------------------------------------------ rows --

export type ProfileRow = {
  id: string;
  email: string;
  name: string | null;
  /**
   * CMS-01 gate. Set by hand in the dashboard; no interface writes it, and it
   * grants catalogue editing only — never access to a family's mission data.
   */
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type ChildProfileRow = {
  id: string;
  parent_id: string;
  display_name: string;
  birth_year: number | null;
  created_at: string;
  updated_at: string;
};

export type MissionRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  lab: WlaLab;
  min_age: number;
  max_age: number;
  duration: string | null;
  delivery_type: MissionDelivery;
  cover_image: string | null;
  /** Minor units (e.g. pence). Paired with `currency` — never assumed. */
  price_minor: number | null;
  currency: string;
  /** Tech Spec §31 — completion is configured, never hard-coded per mission. */
  completion_rule: Json | null;
  is_free: boolean;
  version: number;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type MissionScreenRow = {
  id: string;
  mission_id: string;
  screen_key: string;
  type: ScreenTypeDb;
  title: string | null;
  body: string | null;
  sequence: number;
  configuration: Json;
  /** D-17 — screens are versioned; a learner is served their pinned version. */
  version: number;
  created_at: string;
  updated_at: string;
};

export type MissionResourceRow = {
  version: number;
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  type: ResourceType;
  storage_path: string;
  can_view: boolean;
  can_print: boolean;
  can_download: boolean;
  sort_order: number;
  created_at: string;
};

export type MissionParentNoteRow = {
  version: number;
  id: string;
  mission_id: string;
  content: string;
  /**
   * Optional print-ready note in the private bucket, under the mission id.
   * Served only as a short-lived signed URL. NULL = text only.
   */
  document_path: string | null;
  updated_at: string;
};

export type MissionEntitlementRow = {
  id: string;
  child_id: string;
  mission_id: string;
  source: EntitlementSource;
  status: EntitlementStatus;
  stripe_payment_intent_id: string | null;
  granted_at: string;
  created_at: string;
};

export type MissionProgressRow = {
  id: string;
  child_id: string;
  mission_id: string;
  status: MissionStatus;
  current_screen_key: string | null;
  /** D-17 — pinned at first start, never re-pinned. */
  mission_version: number;
  /** D-17 — completion semantics as they stood when this run began. */
  completion_rule: Json | null;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  /** D-76 — random per-run key for analytics sequencing. Never a child id. */
  analytics_key?: string;
};

export type MissionStateRow = {
  progress_id: string;
  state_data: Json;
  updated_at: string;
};

export type MissionResponseRow = {
  id: string;
  progress_id: string;
  screen_key: string;
  value: Json;
  created_at: string;
  updated_at: string;
};

export type StripeEventRow = {
  id: string;
  type: string;
  processed_at: string;
};

export type CheckoutIntentRow = {
  id: string;
  stripe_session_id: string;
  parent_id: string;
  child_id: string;
  mission_id: string;
  amount_minor: number;
  currency: string;
  created_at: string;
};

export type MissionEvidenceRow = {
  id: string;
  child_id: string;
  mission_id: string;
  progress_id: string | null;
  type: EvidenceType;
  title: string;
  description: string | null;
  /** NULL for physical evidence — the Academy does not hold the artefact. */
  storage_path: string | null;
  created_at: string;
  /** Evidence v2 (F6). */
  evidence_key?: string | null;
  screen_key?: string | null;
  related_to?: string | null;
  relation?: "revision_of" | "changed_plan_of" | "result_of" | "later_judgement_of" | "after_of" | null;
  source?: "completion" | "mission";
};

// ------------------------------------------------- LMS additions (D-56–D-60) --

export type MissionVersionStatus =
  | "draft"
  | "in_review"
  | "published"
  | "archived";

export type MissionVersionRow = {
  id: string;
  mission_id: string;
  version: number;
  status: MissionVersionStatus;
  completion_rule: Json | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  published_at: string | null;
  archived_at: string | null;
};

/**
 * What a PARENT may read about a child's access code.
 *
 * `code_hash` and `code_lookup` are deliberately absent from this type as well
 * as from the column grants — the shape of the type and the shape of the grant
 * agree, so a query for a withheld column fails to compile rather than at
 * runtime.
 */
export type ChildAccessCredentialRow = {
  id: string;
  child_id: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type ChildSessionRow = {
  id: string;
  child_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

// -------------------------------------------------------------- database --

/** Generated columns a caller never supplies. */
type Generated = "id" | "created_at" | "updated_at";

type Table<Row, Required extends keyof Row, Extra extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> &
    Partial<Omit<Row, Required | Generated | Extra>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id" | "email"> &
          Partial<Pick<ProfileRow, "name">>;
        // `is_admin` is deliberately absent: it is not an editable field.
        Update: Partial<Pick<ProfileRow, "email" | "name">>;
        Relationships: [];
      };
      child_profiles: Table<ChildProfileRow, "parent_id" | "display_name">;
      missions: Table<
        MissionRow,
        "slug" | "title" | "lab" | "min_age" | "max_age"
      >;
      mission_screens: Table<
        MissionScreenRow,
        "mission_id" | "screen_key" | "type" | "sequence"
      >;
      mission_resources: Table<
        MissionResourceRow,
        "mission_id" | "title" | "storage_path"
      >;
      mission_parent_notes: Table<
        MissionParentNoteRow,
        "mission_id" | "content"
      >;
      mission_entitlements: Table<
        MissionEntitlementRow,
        "child_id" | "mission_id" | "source"
      >;
      mission_progress: Table<MissionProgressRow, "child_id" | "mission_id">;
      mission_state: Table<MissionStateRow, "progress_id">;
      mission_responses: Table<
        MissionResponseRow,
        "progress_id" | "screen_key" | "value"
      >;
      mission_evidence: Table<
        MissionEvidenceRow,
        "child_id" | "mission_id" | "type" | "title"
      >;
      stripe_events: {
        Row: StripeEventRow;
        Insert: Pick<StripeEventRow, "id" | "type">;
        Update: Partial<StripeEventRow>;
        Relationships: [];
      };
      checkout_intents: Table<
        CheckoutIntentRow,
        | "stripe_session_id"
        | "parent_id"
        | "child_id"
        | "mission_id"
        | "amount_minor"
        | "currency"
      >;
      mission_versions: {
        Row: MissionVersionRow;
        Insert: Pick<MissionVersionRow, "mission_id" | "version"> &
          Partial<Pick<MissionVersionRow, "status" | "completion_rule" | "notes">>;
        // Status moves through set_mission_version_status, never a direct write.
        Update: Partial<Pick<MissionVersionRow, "notes">>;
        Relationships: [];
      };
      child_access_credentials: {
        Row: ChildAccessCredentialRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      child_sessions: {
        Row: ChildSessionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    /**
     * Atomic persistence operations (the persistence migration). Each is one
     * transaction — see supabase/migrations/20260925220200_persistence.sql.
     */
    Functions: {
      start_mission: {
        Args: { p_child_id: string; p_mission_id: string };
        Returns: MissionProgressRow;
      };
      /** D-80 — service role only. The caller has authorised the run. */
      engine_load_run: {
        Args: { p_progress_id: string };
        Returns: Json;
      };
      engine_save: {
        Args: {
          p_progress_id: string;
          p_state: Json;
          p_private: Json;
          p_screen_key: string | null;
          p_response_key: string | null;
          p_response_value: Json;
          p_complete: boolean;
          p_evidence: Json;
          p_events: Json;
        };
        Returns: MissionProgressRow;
      };
      engine_record_events: {
        Args: { p_progress_id: string; p_events: Json };
        Returns: undefined;
      };
      admin_duplicate_mission: {
        Args: { p_source_id: string; p_slug: string; p_title: string; p_from_version?: number | null };
        Returns: Json;
      };
      admin_mission_insights: {
        Args: { p_mission_id: string; p_version?: number | null };
        Returns: Json;
      };
      admin_draft_definition: {
        Args: { p_mission_id: string; p_version: number };
        Returns: Json;
      };
      admin_set_definition: {
        Args: { p_mission_id: string; p_version: number; p_definition: Json };
        Returns: undefined;
      };
      persist_mission_state: {
        Args: {
          p_progress_id: string;
          p_state: Json;
          p_screen_key?: string | null;
          p_response_key?: string | null;
          p_response_value?: Json;
        };
        Returns: MissionProgressRow;
      };
      complete_mission: {
        Args: { p_progress_id: string; p_state: Json; p_trail?: Json };
        Returns: MissionProgressRow;
      };
      /**
       * The ONLY path to screen content. mission_screens has no client read
       * policy — see the screen_access migration.
       */
      /** ANALYTICS-01. Child id is an authorisation input, never stored. */
      record_mission_event: {
        Args: { p_child_id: string; p_mission_id: string; p_name: string };
        Returns: undefined;
      };
      /** CMS-01 admin dashboard. Refuses unless `is_admin()`. */
      admin_mission_stats: {
        Args: { p_stale_days?: number };
        Returns: {
          mission_id: string;
          slug: string;
          title: string;
          version: number;
          published: boolean;
          price_minor: number | null;
          currency: string;
          is_free: boolean;
          entitlements: number;
          starts: number;
          completions: number;
          in_progress: number;
          dropped_off: number;
        }[];
      };
      /** D-17 made visible in the editor. Refuses unless `is_admin()`. */
      admin_mission_version_usage: {
        Args: { p_mission_id: string };
        Returns: { version: number; runs: number; complete: number }[];
      };
      get_current_mission_screen: {
        Args: { p_child_id: string; p_mission_id: string };
        Returns: {
          screen_key: string;
          type: ScreenTypeDb;
          title: string | null;
          body: string | null;
          sequence: number;
          configuration: Json;
          next_sequence_key: string | null;
        }[];
      };

      // --- mission versioning (D-57) ---
      create_mission_version: {
        Args: { p_mission_id: string; p_from_version?: number | null };
        Returns: MissionVersionRow;
      };
      set_mission_version_status: {
        Args: {
          p_mission_id: string;
          p_version: number;
          p_status: MissionVersionStatus;
        };
        Returns: MissionVersionRow;
      };
      validate_mission_version: {
        Args: { p_mission_id: string; p_version: number };
        Returns: {
          code: string;
          blocking: boolean;
          screen_key: string | null;
          detail: string;
        }[];
      };
      admin_draft_screens: {
        Args: { p_mission_id: string; p_version: number };
        Returns: {
          id: string;
          screen_key: string;
          type: ScreenTypeDb;
          title: string | null;
          body: string | null;
          sequence: number;
          configuration: Json;
        }[];
      };
      admin_mission_versions: {
        Args: { p_mission_id: string };
        Returns: {
          version: number;
          status: MissionVersionStatus;
          completion_rule: Json | null;
          screens: number;
          runs: number;
          complete: number;
          created_at: string;
          published_at: string | null;
        }[];
      };

      // --- admin LMS surfaces (brief §18–§23) ---
      admin_overview: {
        Args: Record<string, never>;
        Returns: {
          parents: number; children: number; active_learners: number;
          starts: number; completions: number; published_missions: number;
          draft_missions: number; orders: number;
        }[];
      };
      admin_activity: {
        Args: { p_limit?: number };
        Returns: {
          kind: string; happened_at: string;
          subject: string | null; detail: string | null;
        }[];
      };
      admin_parents: {
        Args: { p_search?: string | null; p_limit?: number };
        Returns: {
          id: string; email: string; name: string | null; is_admin: boolean;
          joined_at: string; children: number; entitlements: number; orders: number;
        }[];
      };
      admin_children: {
        Args: { p_search?: string | null; p_limit?: number };
        Returns: {
          id: string; display_name: string; birth_year: number | null;
          parent_email: string; missions: number; in_progress: number;
          complete: number; last_activity_at: string | null;
          access_code_status: string; code_last_used_at: string | null;
        }[];
      };
      admin_orders: {
        Args: { p_limit?: number };
        Returns: {
          id: string; created_at: string; parent_email: string;
          child_name: string; mission_title: string;
          amount_minor: number; currency: string; state: string;
        }[];
      };
      admin_analytics: {
        Args: Record<string, never>;
        Returns: {
          mission_id: string; slug: string; title: string;
          published_version: number | null; entitlements: number;
          starts: number; completions: number; in_progress: number;
          quiet_14d: number; completion_rate: number;
        }[];
      };
      create_mission: {
        Args: {
          p_slug: string; p_title: string; p_lab: WlaLab;
          p_min_age: number; p_max_age: number;
        };
        Returns: MissionRow;
      };
      delete_mission_if_unused: {
        Args: { p_mission_id: string };
        Returns: boolean;
      };

      // --- mission authoring (D-56) ---
      admin_upsert_screen: {
        Args: {
          p_mission_id: string; p_version: number; p_screen_key: string;
          p_type: ScreenTypeDb; p_title: string | null; p_body: string | null;
          p_sequence: number; p_configuration: Json;
        };
        Returns: MissionScreenRow;
      };
      admin_delete_screen: {
        Args: { p_mission_id: string; p_version: number; p_screen_key: string };
        Returns: undefined;
      };
      admin_move_screen: {
        Args: {
          p_mission_id: string; p_version: number;
          p_screen_key: string; p_direction: "up" | "down";
        };
        Returns: undefined;
      };
      admin_set_completion_rule: {
        Args: { p_mission_id: string; p_version: number; p_rule: Json };
        Returns: undefined;
      };
      admin_preview_screen: {
        Args: { p_mission_id: string; p_version: number; p_screen_key?: string | null };
        Returns: {
          screen_key: string; type: ScreenTypeDb; title: string | null;
          body: string | null; sequence: number; configuration: Json;
          next_sequence_key: string | null;
        }[];
      };

      // --- Kit and Parent Note authoring (D-63) ---
      admin_draft_resources: {
        Args: { p_mission_id: string; p_version: number };
        Returns: {
          id: string; title: string; description: string | null;
          type: ResourceType; storage_path: string; can_view: boolean;
          can_print: boolean; can_download: boolean; sort_order: number;
        }[];
      };
      admin_upsert_resource: {
        Args: {
          p_mission_id: string; p_version: number; p_id: string | null;
          p_title: string; p_description: string | null; p_type: ResourceType;
          p_storage_path: string; p_can_view: boolean; p_can_print: boolean;
          p_can_download: boolean; p_sort_order: number;
        };
        Returns: MissionResourceRow;
      };
      admin_delete_resource: {
        Args: { p_mission_id: string; p_version: number; p_id: string };
        Returns: undefined;
      };
      admin_move_resource: {
        Args: {
          p_mission_id: string; p_version: number;
          p_id: string; p_direction: "up" | "down";
        };
        Returns: undefined;
      };
      admin_draft_parent_note: {
        Args: { p_mission_id: string; p_version: number };
        Returns: { content: string; document_path: string | null }[];
      };
      admin_save_parent_note: {
        Args: {
          p_mission_id: string; p_version: number;
          p_content: string; p_document_path: string | null;
        };
        Returns: undefined;
      };
      effective_mission_version: {
        Args: { p_child_id: string; p_mission_id: string };
        Returns: number;
      };
      mission_kit_for_child: {
        Args: { p_child_id: string; p_mission_id: string };
        Returns: {
          id: string; title: string; description: string | null;
          type: ResourceType; storage_path: string; can_view: boolean;
          can_print: boolean; can_download: boolean; sort_order: number;
        }[];
      };
      child_session_kit: {
        Args: { p_token: string; p_mission_slug: string };
        Returns: {
          id: string; title: string; description: string | null;
          type: ResourceType; storage_path: string; can_view: boolean;
          can_print: boolean; can_download: boolean; sort_order: number;
        }[];
      };
      child_session_resource_path: {
        Args: { p_token: string; p_resource_id: string };
        Returns: string | null;
      };

      // --- child access (D-58) ---
      generate_child_access_code: { Args: { p_child_id: string }; Returns: string };
      revoke_child_access_code: { Args: { p_child_id: string }; Returns: undefined };
      redeem_child_code: {
        Args: { p_code: string };
        Returns: {
          outcome: "ok" | "invalid_code" | "rate_limited";
          token: string | null;
          child_id: string | null;
          display_name: string | null;
          expires_at: string | null;
        }[];
      };
      verify_child_session: {
        Args: { p_token: string };
        Returns: {
          child_id: string;
          display_name: string;
          birth_year: number | null;
          expires_at: string;
        }[];
      };
      revoke_child_session: { Args: { p_token: string }; Returns: undefined };

      // --- child-session mission access (D-59) ---
      child_session_missions: {
        Args: { p_token: string };
        Returns: {
          mission_id: string;
          slug: string;
          title: string;
          description: string | null;
          lab: WlaLab;
          min_age: number;
          max_age: number;
          duration: string | null;
          delivery_type: MissionDelivery;
          cover_image: string | null;
          status: MissionStatus;
          current_screen_key: string | null;
          last_activity_at: string | null;
          mission_version: number | null;
        }[];
      };
      child_session_mission: {
        Args: { p_token: string; p_mission_slug: string };
        Returns: {
          mission_id: string;
          slug: string;
          title: string;
          description: string | null;
          lab: WlaLab;
          min_age: number;
          max_age: number;
          duration: string | null;
          delivery_type: MissionDelivery;
          cover_image: string | null;
          status: MissionStatus;
          mission_version: number | null;
          progress_id: string | null;
          current_screen_key: string | null;
          completion_rule: Json | null;
        }[];
      };
      child_session_start_mission: {
        Args: { p_token: string; p_mission_id: string };
        Returns: MissionProgressRow;
      };
      child_session_current_screen: {
        Args: { p_token: string; p_mission_id: string };
        Returns: {
          screen_key: string;
          type: ScreenTypeDb;
          title: string | null;
          body: string | null;
          sequence: number;
          configuration: Json;
          next_sequence_key: string | null;
        }[];
      };
      child_session_persist_state: {
        Args: {
          p_token: string;
          p_progress_id: string;
          p_state: Json;
          p_screen_key?: string | null;
          p_response_key?: string | null;
          p_response_value?: Json;
        };
        Returns: MissionProgressRow;
      };
      child_session_complete_mission: {
        Args: {
          p_token: string;
          p_progress_id: string;
          p_state: Json;
          p_trail?: Json;
        };
        Returns: MissionProgressRow;
      };
      child_session_record_event: {
        Args: { p_token: string; p_mission_id: string; p_name: string };
        Returns: undefined;
      };
      child_session_state: {
        Args: { p_token: string; p_progress_id: string };
        Returns: Json;
      };
      child_session_trail: {
        Args: { p_token: string; p_mission_slug: string };
        Returns: {
          id: string;
          type: EvidenceType;
          title: string;
          description: string | null;
          created_at: string;
        }[];
      };
      child_session_resources: {
        Args: { p_token: string; p_mission_slug: string };
        Returns: {
          id: string;
          title: string;
          description: string | null;
          type: ResourceType;
          storage_path: string;
          can_view: boolean;
          can_print: boolean;
          can_download: boolean;
          sort_order: number;
        }[];
      };
    };
    Enums: {
      mission_version_status: MissionVersionStatus;
      mission_status: MissionStatus;
      entitlement_source: EntitlementSource;
      entitlement_status: EntitlementStatus;
      mission_delivery: MissionDelivery;
      wla_lab: WlaLab;
      screen_type: ScreenTypeDb;
      resource_type: ResourceType;
      evidence_type: EvidenceType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
