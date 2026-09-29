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
    };
    Enums: {
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
