type Table<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type Procedure<Args extends Record<string, unknown>, Returns> = { Args: Args; Returns: Returns };
type Scoped = { clinic_id: string };
type Encrypted = { iv: string; data: string; tag: string };
type Settings = { timezone?: string; rules?: string };
type Slot = {
  professional_id: string;
  professional_name: string;
  specialty: string;
  start_time: string;
  end_time: string;
};

export type Database = {
  public: {
    Tables: {
      clinics: Table<{ id: string; name: string; settings: Settings }>;
      clinic_members: Table<Scoped & { user_id: string; role: string }>;
      professionals: Table<Scoped & { id: string; specialty: string; active: boolean }>;
      appointment_tags: Table<Scoped & { id: string; name: string; default_price: number }>;
      patients: Table<Scoped & { id: string; phone: string; full_name: string; email: string | null }>;
      appointments: Table<Scoped & { id: string; patient_id: string; start_time: string; status: string }>;
      conversations: Table<
        Scoped & {
          id: string;
          phone: string | null;
          remote_jid: string;
          patient_id: string | null;
          is_bot_paused: boolean;
          updated_at: string;
        }
      >;
      messages: Table<
        Scoped & {
          id: string;
          conversation_id: string;
          created_at: string;
          handled_at: string | null;
          external_id: string | null;
          sender: string;
          body: string;
          delivery: string;
          send_attempts: number;
          next_attempt: string;
        }
      >;
      whatsapp_sessions: Table<
        Scoped & {
          status: string;
          updated_at: string;
          phone_number: string | null;
          enabled: boolean;
          maria_enabled: boolean;
        }
      >;
      whatsapp_qr: Table<Scoped & { qr_code: string | null }>;
      whatsapp_credentials: Table<Scoped & { session_data: Encrypted }>;
      gmail_integrations: Table<
        Scoped & {
          email_address: string;
          active: boolean;
          daily_summary: boolean;
          last_summary_day: string | null;
        }
      >;
      gmail_credentials: Table<Scoped & { token_data: Encrypted }>;
      confirmation_jobs: Table<
        Scoped & { appointment_id: string; sent_at: string | null; attempts: number; next_attempt: string }
      >;
      agent_events: Table<Scoped & { action_type: string; description: string }>;
      maria_bookings: Table<Scoped & { request_id: string; appointment_id: string }>;
      maria_offers: Table<
        Scoped & {
          offer_id: string;
          position: number;
          request_id: string;
          conversation_id: string;
          professional_id: string;
          start_time: string;
          created_at: string;
        }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      claim_worker: Procedure<{ p_owner: string }, boolean>;
      configure_gmail: Procedure<
        { p_clinic: string; p_email: string; p_tokens: Encrypted | null; p_summary: boolean },
        undefined
      >;
      clinic_daily_totals: Procedure<
        { p_clinic: string; p_day: string },
        { completed: number; scheduled: number; missed: number; realized: number }[]
      >;
      clinic_slots: Procedure<{ p_clinic: string; p_day: string; p_specialty: string }, Slot[]>;
      finish_maria_turn: Procedure<
        {
          p_clinic: string;
          p_conversation: string;
          p_messages: string[];
          p_reply: string | null;
          p_handoff: boolean;
          p_triage: boolean;
        },
        undefined
      >;
      maria_book: Procedure<
        {
          p_clinic: string;
          p_conversation: string;
          p_request: string;
          p_name: string;
          p_insurance: string;
          p_professional: string;
          p_tag: string;
          p_start: string;
          p_email: string | null;
        },
        string
      >;
    };
  };
};
