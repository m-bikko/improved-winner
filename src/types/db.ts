export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_members: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checkin_asks: {
        Row: {
          created_at: string
          date: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          kind?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      checkin_notices: {
        Row: {
          date: string
          notified_at: string
          user_id: string
        }
        Insert: {
          date: string
          notified_at?: string
          user_id: string
        }
        Update: {
          date?: string
          notified_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checkin_restores: {
        Row: {
          created_at: string
          date: string
          month: string
          slot: number
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          month?: string
          slot: number
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          month?: string
          slot?: number
          user_id?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          created_at: string
          date: string
          note: string | null
          states: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          note?: string | null
          states?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          note?: string | null
          states?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cycle_days: {
        Row: {
          created_at: string
          date: string
          flow: string | null
          mood: string | null
          note: string | null
          pain: number | null
          symptoms: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          flow?: string | null
          mood?: string | null
          note?: string | null
          pain?: number | null
          symptoms?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          flow?: string | null
          mood?: string | null
          note?: string | null
          pain?: number | null
          symptoms?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cycle_notices: {
        Row: {
          created_at: string
          date: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      cycle_settings: {
        Row: {
          luteal_days: number
          share_with_partner: boolean
          tracking_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          luteal_days?: number
          share_with_partner?: boolean
          tracking_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          luteal_days?: number
          share_with_partner?: boolean
          tracking_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_goals: {
        Row: {
          carbs: number
          created_at: string
          date: string
          fat: number
          goal_direction: string
          kcal: number
          protein: number
          updated_at: string
          user_id: string
        }
        Insert: {
          carbs: number
          created_at?: string
          date: string
          fat: number
          goal_direction: string
          kcal: number
          protein: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          carbs?: number
          created_at?: string
          date?: string
          fat?: number
          goal_direction?: string
          kcal?: number
          protein?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diary_entries: {
        Row: {
          brand_snapshot: string | null
          carbs: number | null
          carbs_100: number
          created_at: string
          date: string
          fat: number | null
          fat_100: number
          food_id: string | null
          grams: number
          id: string
          kcal: number | null
          kcal_100: number
          meal: string
          name_snapshot: string
          protein: number | null
          protein_100: number
          serving_label_snapshot: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_snapshot?: string | null
          carbs?: number | null
          carbs_100: number
          created_at?: string
          date: string
          fat?: number | null
          fat_100: number
          food_id?: string | null
          grams: number
          id: string
          kcal?: number | null
          kcal_100: number
          meal: string
          name_snapshot: string
          protein?: number | null
          protein_100: number
          serving_label_snapshot?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          brand_snapshot?: string | null
          carbs?: number | null
          carbs_100?: number
          created_at?: string
          date?: string
          fat?: number | null
          fat_100?: number
          food_id?: string | null
          grams?: number
          id?: string
          kcal?: number | null
          kcal_100?: number
          meal?: string
          name_snapshot?: string
          protein?: number | null
          protein_100?: number
          serving_label_snapshot?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods_v"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_items: {
        Row: {
          created_at: string
          dish_id: string
          dish_kind: string
          food_id: string
          grams: number
          id: string
          item_kind: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          dish_id: string
          dish_kind?: string
          food_id: string
          grams: number
          id?: string
          item_kind?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          dish_id?: string
          dish_kind?: string
          food_id?: string
          grams?: number
          id?: string
          item_kind?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "dish_items_dish_fk"
            columns: ["dish_id", "dish_kind"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "dish_items_dish_fk"
            columns: ["dish_id", "dish_kind"]
            isOneToOne: false
            referencedRelation: "foods_v"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "dish_items_food_fk"
            columns: ["food_id", "item_kind"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "dish_items_food_fk"
            columns: ["food_id", "item_kind"]
            isOneToOne: false
            referencedRelation: "foods_v"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      food_servings: {
        Row: {
          created_at: string
          food_id: string
          grams: number
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          food_id: string
          grams: number
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          food_id?: string
          grams?: number
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_servings_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_servings_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods_v"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          archived_at: string | null
          brand: string | null
          carbs_100: number
          created_at: string
          created_by: string | null
          fat_100: number
          id: string
          image_path: string | null
          kcal_100: number
          kind: string
          name: string
          name_norm: string | null
          protein_100: number
          source_url: string | null
          updated_at: string
          yield_grams: number | null
        }
        Insert: {
          archived_at?: string | null
          brand?: string | null
          carbs_100?: number
          created_at?: string
          created_by?: string | null
          fat_100?: number
          id?: string
          image_path?: string | null
          kcal_100?: number
          kind: string
          name: string
          name_norm?: string | null
          protein_100?: number
          source_url?: string | null
          updated_at?: string
          yield_grams?: number | null
        }
        Update: {
          archived_at?: string | null
          brand?: string | null
          carbs_100?: number
          created_at?: string
          created_by?: string | null
          fat_100?: number
          id?: string
          image_path?: string | null
          kcal_100?: number
          kind?: string
          name?: string
          name_norm?: string | null
          protein_100?: number
          source_url?: string | null
          updated_at?: string
          yield_grams?: number | null
        }
        Relationships: []
      }
      letter_deliveries: {
        Row: {
          created_at: string
          letter_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          letter_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          letter_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_deliveries_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "letters"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          audience: string
          author_id: string
          body: string
          created_at: string
          deliver_on: string
          delivered_at: string | null
          id: string
          image_path: string | null
          updated_at: string
        }
        Insert: {
          audience?: string
          author_id?: string
          body: string
          created_at?: string
          deliver_on: string
          delivered_at?: string | null
          id?: string
          image_path?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string
          author_id?: string
          body?: string
          created_at?: string
          deliver_on?: string
          delivered_at?: string | null
          id?: string
          image_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      love_notes: {
        Row: {
          message: string
          on_date: string
        }
        Insert: {
          message: string
          on_date: string
        }
        Update: {
          message?: string
          on_date?: string
        }
        Relationships: []
      }
      love_notes_sent: {
        Row: {
          created_at: string
          on_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          on_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          on_date?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_reminders: {
        Row: {
          date: string
          meal: string
          sent_at: string
          user_id: string
        }
        Insert: {
          date: string
          meal: string
          sent_at?: string
          user_id: string
        }
        Update: {
          date?: string
          meal?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          kind: string
          push: boolean
          telegram: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          kind: string
          push?: boolean
          telegram?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          kind?: string
          push?: boolean
          telegram?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      occasion_notices: {
        Row: {
          created_at: string
          lead: number
          occasion_id: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          lead: number
          occasion_id: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          lead?: number
          occasion_id?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "occasion_notices_occasion_id_fkey"
            columns: ["occasion_id"]
            isOneToOne: false
            referencedRelation: "occasions"
            referencedColumns: ["id"]
          },
        ]
      }
      occasions: {
        Row: {
          created_at: string
          created_by: string
          date: string
          id: string
          kind: string
          note: string | null
          title: string
          updated_at: string
          yearly: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string
          date: string
          id?: string
          kind?: string
          note?: string | null
          title: string
          updated_at?: string
          yearly?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          kind?: string
          note?: string | null
          title?: string
          updated_at?: string
          yearly?: boolean
        }
        Relationships: []
      }
      periods: {
        Row: {
          created_at: string
          ended_on: string | null
          id: string
          note: string | null
          started_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_on?: string | null
          id?: string
          note?: string | null
          started_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          ended_on?: string | null
          id?: string
          note?: string | null
          started_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string
          birth_year: number | null
          created_at: string
          goal_carbs: number | null
          goal_direction: string
          goal_fat: number | null
          goal_kcal: number | null
          goal_protein: number | null
          goals_mode: string
          height_cm: number | null
          nickname: string
          quiet_from: number | null
          quiet_to: number | null
          sex: string | null
          telegram_chat_id: string | null
          timezone: string
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string
          birth_year?: number | null
          created_at?: string
          goal_carbs?: number | null
          goal_direction?: string
          goal_fat?: number | null
          goal_kcal?: number | null
          goal_protein?: number | null
          goals_mode?: string
          height_cm?: number | null
          nickname: string
          quiet_from?: number | null
          quiet_to?: number | null
          sex?: string | null
          telegram_chat_id?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string
          birth_year?: number | null
          created_at?: string
          goal_carbs?: number | null
          goal_direction?: string
          goal_fat?: number | null
          goal_kcal?: number | null
          goal_protein?: number | null
          goals_mode?: string
          height_cm?: number | null
          nickname?: string
          quiet_from?: number | null
          quiet_to?: number | null
          sex?: string | null
          telegram_chat_id?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          last_seen_at: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          last_seen_at?: string
          p256dh: string
          user_id?: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          last_seen_at?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          done_at: string | null
          done_by: string | null
          due_at: string | null
          excluded_at: string[]
          id: string
          notes: string | null
          recurrence: Json | null
          recurrence_until: string | null
          reminded_offsets: number[]
          reminders: number[]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          excluded_at?: string[]
          id?: string
          notes?: string | null
          recurrence?: Json | null
          recurrence_until?: string | null
          reminded_offsets?: number[]
          reminders?: number[]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          excluded_at?: string[]
          id?: string
          notes?: string | null
          recurrence?: Json | null
          recurrence_until?: string | null
          reminded_offsets?: number[]
          reminders?: number[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      topic_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          topic_id: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          topic_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_comments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          body: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          id: string
          resolution: string | null
          search_tsv: unknown
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          resolution?: string | null
          search_tsv?: unknown
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          resolution?: string | null
          search_tsv?: unknown
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      weight_log: {
        Row: {
          created_at: string
          date: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          date: string
          user_id?: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          date?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          category: string
          created_at: string
          created_by: string
          details: string | null
          id: string
          image_path: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string
          details?: string | null
          id?: string
          image_path?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          details?: string | null
          id?: string
          image_path?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          created_at: string
          date: string
          id: string
          kcal: number
          kind: string
          minutes: number
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          kcal: number
          kind: string
          minutes: number
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          kcal?: number
          kind?: string
          minutes?: number
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      foods_v: {
        Row: {
          archived_at: string | null
          brand: string | null
          carbs_100: number | null
          created_at: string | null
          created_by: string | null
          fat_100: number | null
          id: string | null
          image_path: string | null
          ingredients_count: number | null
          ingredients_grams: number | null
          kcal_100: number | null
          kind: string | null
          name: string | null
          name_norm: string | null
          protein_100: number | null
          updated_at: string | null
          yield_grams: number | null
        }
        Relationships: []
      }
      periods_v: {
        Row: {
          cycle_days: number | null
          ended_on: string | null
          id: string | null
          note: string | null
          period_days: number | null
          started_on: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ask_checkins: { Args: never; Returns: number }
      ask_checkins_evening: { Args: never; Returns: number }
      attention_count: { Args: { target: string }; Returns: number }
      by_sex: {
        Args: { female: string; male: string; neutral: string; person: string }
        Returns: string
      }
      checkin_cycle_patterns: {
        Args: { months?: number; owner: string; today: string }
        Returns: {
          days_in_phase: number
          hits: number
          observed_days: number
          other_rate: number
          phase: string
          rate: number
          ratio: number
          state: string
        }[]
      }
      checkin_restorable: {
        Args: { today: string }
        Returns: {
          date: string
          month_left: number
        }[]
      }
      checkin_streak: {
        Args: { person: string; today: string }
        Returns: number
      }
      checkin_streaks: {
        Args: { today: string }
        Returns: {
          streak: number
          user_id: string
        }[]
      }
      cycle_shared_with_me: { Args: { owner: string }; Returns: boolean }
      cycle_state: {
        Args: { on_date: string; owner: string }
        Returns: {
          cycle_length: number
          day: number
          last_start: string
          next_start: string
          ovulation: string
          period_length: number
          phase: string
        }[]
      }
      cycle_tip: { Args: { day: number; phase: string }; Returns: string }
      deliver_letters: { Args: never; Returns: number }
      diary_month: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: {
          day: string
          goal_kcal: number
          goal_protein: number
          kcal: number
          protein: number
        }[]
      }
      in_quiet_hours: { Args: { target: string }; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      letter_delivered_to_me: { Args: { letter: string }; Returns: boolean }
      letter_recipients: { Args: { letter: string }; Returns: string[] }
      letters_in_flight: { Args: never; Returns: number }
      month_summary: { Args: { month: number; year: number }; Returns: Json }
      next_occurrence: {
        Args: { from_ts: string; rule: Json }
        Returns: string
      }
      next_occurrence_allowed: {
        Args: { excluded: string[]; from_ts: string; rule: Json }
        Returns: string
      }
      notify_allowed: {
        Args: { channel: string; kind: string; target: string }
        Returns: boolean
      }
      notify_due_tasks: { Args: never; Returns: number }
      notify_occasions: { Args: never; Returns: number }
      occasion_next: {
        Args: { source: string; today: string; yearly: boolean }
        Returns: string
      }
      occasions_upcoming: {
        Args: { today: string }
        Returns: {
          created_by: string
          date: string
          days: number
          id: string
          kind: string
          next_on: string
          note: string
          title: string
          yearly: boolean
          years: number
        }[]
      }
      partner_of: { Args: { author_id: string }; Returns: string }
      push_notify: {
        Args: {
          body: string
          kind: string
          target_id: string
          title: string
          url?: string
        }
        Returns: undefined
      }
      reorder_diary: { Args: { p_items: Json }; Returns: undefined }
      reorder_wishlists: { Args: { ids: string[] }; Returns: undefined }
      restore_checkin_day: {
        Args: { target_date: string; today: string }
        Returns: undefined
      }
      search_topics: {
        Args: { q: string }
        Returns: {
          body: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          id: string
          resolution: string | null
          search_tsv: unknown
          status: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "topics"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      send_cycle_notices: { Args: never; Returns: number }
      send_love_notes: { Args: never; Returns: number }
      send_meal_reminders: { Args: never; Returns: number }
      tg_escape: { Args: { input: string }; Returns: string }
      tg_notify_both: {
        Args: { kind: string; message: string }
        Returns: undefined
      }
      tg_notify_partner: {
        Args: { author_id: string; kind: string; message: string }
        Returns: undefined
      }
      tg_notify_self: {
        Args: { kind: string; message: string; target_id: string }
        Returns: undefined
      }
      tg_send_raw: {
        Args: { chat_id: string; message: string }
        Returns: number
      }
      year_in_numbers: { Args: { year: number }; Returns: Json }
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

