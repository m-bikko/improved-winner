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
      app_releases: {
        Row: {
          announced: boolean
          seen_at: string
          version: string
        }
        Insert: {
          announced?: boolean
          seen_at?: string
          version: string
        }
        Update: {
          announced?: boolean
          seen_at?: string
          version?: string
        }
        Relationships: []
      }
      babies: {
        Row: {
          born_on: string
          created_at: string
          created_by: string
          height_cm: number | null
          id: string
          name: string | null
          sex: string | null
          weight_g: number | null
        }
        Insert: {
          born_on: string
          created_at?: string
          created_by?: string
          height_cm?: number | null
          id?: string
          name?: string | null
          sex?: string | null
          weight_g?: number | null
        }
        Update: {
          born_on?: string
          created_at?: string
          created_by?: string
          height_cm?: number | null
          id?: string
          name?: string | null
          sex?: string | null
          weight_g?: number | null
        }
        Relationships: []
      }
      baby_checkups: {
        Row: {
          baby_id: string
          created_at: string
          created_by: string
          date: string
          done: boolean
          id: string
          kind: string
          note: string | null
          title: string
        }
        Insert: {
          baby_id: string
          created_at?: string
          created_by?: string
          date: string
          done?: boolean
          id?: string
          kind: string
          note?: string | null
          title: string
        }
        Update: {
          baby_id?: string
          created_at?: string
          created_by?: string
          date?: string
          done?: boolean
          id?: string
          kind?: string
          note?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "baby_checkups_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
        ]
      }
      baby_events: {
        Row: {
          amount_ml: number | null
          baby_id: string
          created_at: string
          created_by: string
          diaper: string | null
          ended_at: string | null
          id: string
          kind: string
          note: string | null
          side: string | null
          started_at: string
        }
        Insert: {
          amount_ml?: number | null
          baby_id: string
          created_at?: string
          created_by?: string
          diaper?: string | null
          ended_at?: string | null
          id?: string
          kind: string
          note?: string | null
          side?: string | null
          started_at: string
        }
        Update: {
          amount_ml?: number | null
          baby_id?: string
          created_at?: string
          created_by?: string
          diaper?: string | null
          ended_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          side?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baby_events_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
        ]
      }
      baby_growth: {
        Row: {
          baby_id: string
          created_at: string
          created_by: string
          date: string
          head_cm: number | null
          height_cm: number | null
          id: string
          weight_g: number | null
        }
        Insert: {
          baby_id: string
          created_at?: string
          created_by?: string
          date: string
          head_cm?: number | null
          height_cm?: number | null
          id?: string
          weight_g?: number | null
        }
        Update: {
          baby_id?: string
          created_at?: string
          created_by?: string
          date?: string
          head_cm?: number | null
          height_cm?: number | null
          id?: string
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baby_growth_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
        ]
      }
      baby_names: {
        Row: {
          created_at: string
          created_by: string | null
          gender: string
          key: string
          latin: string | null
          meaning_en: string | null
          meaning_kk: string | null
          meaning_ru: string | null
          name: string
          origin: string
          rank: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gender: string
          key: string
          latin?: string | null
          meaning_en?: string | null
          meaning_kk?: string | null
          meaning_ru?: string | null
          name: string
          origin: string
          rank?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gender?: string
          key?: string
          latin?: string | null
          meaning_en?: string | null
          meaning_kk?: string | null
          meaning_ru?: string | null
          name?: string
          origin?: string
          rank?: number | null
        }
        Relationships: []
      }
      challenge_marks: {
        Row: {
          challenge_id: string
          created_at: string
          date: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          date: string
          user_id?: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_marks_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string
          created_by: string
          days: number
          icon: string
          id: string
          started_on: string
          stopped_on: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          days: number
          icon: string
          id?: string
          started_on: string
          stopped_on?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          days?: number
          icon?: string
          id?: string
          started_on?: string
          stopped_on?: string | null
          title?: string
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
          lh_positive: boolean
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
          lh_positive?: boolean
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
          lh_positive?: boolean
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
      date_ideas: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          hint_en: string | null
          hint_kk: string | null
          hint_ru: string | null
          key: string
          rank: number | null
          title: string | null
          title_en: string | null
          title_kk: string | null
          title_ru: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          hint_en?: string | null
          hint_kk?: string | null
          hint_ru?: string | null
          key: string
          rank?: number | null
          title?: string | null
          title_en?: string | null
          title_kk?: string | null
          title_ru?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          hint_en?: string | null
          hint_kk?: string | null
          hint_ru?: string | null
          key?: string
          rank?: number | null
          title?: string | null
          title_en?: string | null
          title_kk?: string | null
          title_ru?: string | null
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
      doctors: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          note: string | null
          person_id: string | null
          phone: string | null
          place: string | null
          specialty: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          name: string
          note?: string | null
          person_id?: string | null
          phone?: string | null
          place?: string | null
          specialty?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          note?: string | null
          person_id?: string | null
          phone?: string | null
          place?: string | null
          specialty?: string | null
        }
        Relationships: []
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
          barcode: string | null
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
          barcode?: string | null
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
          barcode?: string | null
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
      gratitudes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      health_cards: {
        Row: {
          allergies: string | null
          blood_type: string | null
          conditions: string | null
          emergency: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string | null
          blood_type?: string | null
          conditions?: string | null
          emergency?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          allergies?: string | null
          blood_type?: string | null
          conditions?: string | null
          emergency?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      idea_done: {
        Row: {
          created_at: string
          done_by: string
          done_on: string
          idea_key: string
          memory_id: string | null
        }
        Insert: {
          created_at?: string
          done_by?: string
          done_on: string
          idea_key: string
          memory_id?: string | null
        }
        Update: {
          created_at?: string
          done_by?: string
          done_on?: string
          idea_key?: string
          memory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idea_done_idea_key_fkey"
            columns: ["idea_key"]
            isOneToOne: true
            referencedRelation: "date_ideas"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "idea_done_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_votes: {
        Row: {
          created_at: string
          idea_key: string
          liked: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          idea_key: string
          liked: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          idea_key?: string
          liked?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_key_fkey"
            columns: ["idea_key"]
            isOneToOne: false
            referencedRelation: "date_ideas"
            referencedColumns: ["key"]
          },
        ]
      }
      kick_sessions: {
        Row: {
          created_at: string
          ended_at: string
          id: string
          kicks: number
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at: string
          id?: string
          kicks: number
          started_at: string
          user_id?: string
        }
        Update: {
          created_at?: string
          ended_at?: string
          id?: string
          kicks?: number
          started_at?: string
          user_id?: string
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
          lang: string
          message: string
          on_date: string
        }
        Insert: {
          lang?: string
          message: string
          on_date: string
        }
        Update: {
          lang?: string
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
      med_doses: {
        Row: {
          day: string
          medication_id: string
          slot: string
          taken_at: string
        }
        Insert: {
          day: string
          medication_id: string
          slot: string
          taken_at?: string
        }
        Update: {
          day?: string
          medication_id?: string
          slot?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "med_doses_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      med_notices: {
        Row: {
          created_at: string
          day: string
          medication_id: string
          slot: string
        }
        Insert: {
          created_at?: string
          day: string
          medication_id: string
          slot: string
        }
        Update: {
          created_at?: string
          day?: string
          medication_id?: string
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "med_notices_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string
          dose: string | null
          ends_on: string | null
          id: string
          name: string
          note: string | null
          starts_on: string
          times: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          dose?: string | null
          ends_on?: string | null
          id?: string
          name: string
          note?: string | null
          starts_on: string
          times?: string[]
          user_id?: string
        }
        Update: {
          created_at?: string
          dose?: string | null
          ends_on?: string | null
          id?: string
          name?: string
          note?: string | null
          starts_on?: string
          times?: string[]
          user_id?: string
        }
        Relationships: []
      }
      meeting_items: {
        Row: {
          created_at: string
          created_by: string
          done: boolean
          id: string
          meeting_id: string
          source: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          done?: boolean
          id?: string
          meeting_id: string
          source?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          done?: boolean
          id?: string
          meeting_id?: string
          source?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notices: {
        Row: {
          created_at: string
          meeting_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          meeting_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notices_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          created_by: string
          ends_on: string
          id: string
          memory_id: string | null
          note: string | null
          place: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          ends_on: string
          id?: string
          memory_id?: string | null
          note?: string | null
          place?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_on?: string
          id?: string
          memory_id?: string | null
          note?: string | null
          place?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          happened_on: string
          id: string
          place: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string
          caption?: string | null
          created_at?: string
          happened_on: string
          id: string
          place?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          happened_on?: string
          id?: string
          place?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      memory_hearts: {
        Row: {
          created_at: string
          memory_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          memory_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          memory_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_hearts_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_photos: {
        Row: {
          created_at: string
          height: number
          id: string
          memory_id: string
          path: string
          placeholder: string
          position: number
          thumb_path: string
          width: number
        }
        Insert: {
          created_at?: string
          height: number
          id?: string
          memory_id: string
          path: string
          placeholder: string
          position?: number
          thumb_path: string
          width: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          memory_id?: string
          path?: string
          placeholder?: string
          position?: number
          thumb_path?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "memory_photos_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      name_votes: {
        Row: {
          created_at: string
          liked: boolean
          name_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          liked: boolean
          name_key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          liked?: boolean
          name_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "name_votes_name_key_fkey"
            columns: ["name_key"]
            isOneToOne: false
            referencedRelation: "baby_names"
            referencedColumns: ["key"]
          },
        ]
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
      nudges: {
        Row: {
          created_at: string
          from_id: string
          id: string
        }
        Insert: {
          created_at?: string
          from_id?: string
          id?: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
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
          person_id: string | null
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
          person_id?: string | null
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
          person_id?: string | null
          title?: string
          updated_at?: string
          yearly?: boolean
        }
        Relationships: []
      }
      pause_notes: {
        Row: {
          created_at: string
          feel: string
          need: string
          pause_id: string
          updated_at: string
          user_id: string
          when_text: string | null
        }
        Insert: {
          created_at?: string
          feel: string
          need: string
          pause_id: string
          updated_at?: string
          user_id?: string
          when_text?: string | null
        }
        Update: {
          created_at?: string
          feel?: string
          need?: string
          pause_id?: string
          updated_at?: string
          user_id?: string
          when_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pause_notes_pause_id_fkey"
            columns: ["pause_id"]
            isOneToOne: false
            referencedRelation: "pauses"
            referencedColumns: ["id"]
          },
        ]
      }
      pauses: {
        Row: {
          closed_at: string | null
          end_notified_at: string | null
          ends_at: string
          id: string
          outcome: string | null
          started_at: string
          started_by: string
          topic_id: string | null
        }
        Insert: {
          closed_at?: string | null
          end_notified_at?: string | null
          ends_at: string
          id?: string
          outcome?: string | null
          started_at?: string
          started_by?: string
          topic_id?: string | null
        }
        Update: {
          closed_at?: string | null
          end_notified_at?: string | null
          ends_at?: string
          id?: string
          outcome?: string | null
          started_at?: string
          started_by?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pauses_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          created_at: string
          ended_on: string | null
          id: string
          long_confirmed: boolean
          note: string | null
          started_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_on?: string | null
          id?: string
          long_confirmed?: boolean
          note?: string | null
          started_on: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          ended_on?: string | null
          id?: string
          long_confirmed?: boolean
          note?: string | null
          started_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pregnancy: {
        Row: {
          created_at: string
          ended_on: string | null
          id: boolean
          lmp: string
          mother_id: string
          started_by: string
        }
        Insert: {
          created_at?: string
          ended_on?: string | null
          id?: boolean
          lmp: string
          mother_id: string
          started_by?: string
        }
        Update: {
          created_at?: string
          ended_on?: string | null
          id?: boolean
          lmp?: string
          mother_id?: string
          started_by?: string
        }
        Relationships: []
      }
      pregnancy_notices: {
        Row: {
          created_at: string
          lmp: string
          user_id: string
          week: number
        }
        Insert: {
          created_at?: string
          lmp: string
          user_id: string
          week: number
        }
        Update: {
          created_at?: string
          lmp?: string
          user_id?: string
          week?: number
        }
        Relationships: []
      }
      pregnancy_visits: {
        Row: {
          created_at: string
          created_by: string
          date: string
          done: boolean
          id: string
          note: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          date: string
          done?: boolean
          id?: string
          note?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          done?: boolean
          id?: string
          note?: string | null
          title?: string
        }
        Relationships: []
      }
      prep_asks: {
        Row: {
          created_at: string
          date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          user_id?: string
        }
        Relationships: []
      }
      prep_checks: {
        Row: {
          created_at: string
          done_on: string | null
          id: string
          item_key: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          done_on?: string | null
          id?: string
          item_key?: string | null
          title?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          done_on?: string | null
          id?: string
          item_key?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prep_plan: {
        Row: {
          created_at: string
          created_by: string
          id: boolean
          started_on: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: boolean
          started_on: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: boolean
          started_on?: string
        }
        Relationships: []
      }
      prep_vitamins: {
        Row: {
          created_at: string
          date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string
          birth_year: number | null
          bmr_kcal: number | null
          body_fat_pct: number | null
          created_at: string
          goal_carbs: number | null
          goal_direction: string
          goal_fat: number | null
          goal_kcal: number | null
          goal_protein: number | null
          goals_mode: string
          height_cm: number | null
          language: string
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
          bmr_kcal?: number | null
          body_fat_pct?: number | null
          created_at?: string
          goal_carbs?: number | null
          goal_direction?: string
          goal_fat?: number | null
          goal_kcal?: number | null
          goal_protein?: number | null
          goals_mode?: string
          height_cm?: number | null
          language?: string
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
          bmr_kcal?: number | null
          body_fat_pct?: number | null
          created_at?: string
          goal_carbs?: number | null
          goal_direction?: string
          goal_fat?: number | null
          goal_kcal?: number | null
          goal_protein?: number | null
          goals_mode?: string
          height_cm?: number | null
          language?: string
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
      pulse_asks: {
        Row: {
          created_at: string
          month: string
          user_id: string
        }
        Insert: {
          created_at?: string
          month: string
          user_id: string
        }
        Update: {
          created_at?: string
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      pulse_entries: {
        Row: {
          created_at: string
          month: string
          note: string | null
          scores: number[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          month: string
          note?: string | null
          scores: number[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          month?: string
          note?: string | null
          scores?: number[]
          updated_at?: string
          user_id?: string
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
      question_answers: {
        Row: {
          body: string
          created_at: string
          date: string
          question_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          date: string
          question_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          date?: string
          question_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_asks: {
        Row: {
          created_at: string
          date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          user_id?: string
        }
        Relationships: []
      }
      release_probes: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      savings_deposits: {
        Row: {
          amount: number
          created_at: string
          date: string
          goal_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          goal_id: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          goal_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_deposits_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          currency: string
          deadline: string | null
          icon: string
          id: string
          target: number
          title: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency: string
          deadline?: string | null
          icon: string
          id?: string
          target: number
          title: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deadline?: string | null
          icon?: string
          id?: string
          target?: number
          title?: string
        }
        Relationships: []
      }
      shot_prompts: {
        Row: {
          created_at: string
          day: string
          fire_at: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          day: string
          fire_at: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          day?: string
          fire_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      shots: {
        Row: {
          caption: string | null
          created_at: string
          day: string
          height: number
          id: string
          path: string
          placeholder: string
          thumb_path: string
          user_id: string
          width: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          day: string
          height: number
          id: string
          path: string
          placeholder: string
          thumb_path: string
          user_id?: string
          width: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          day?: string
          height?: number
          id?: string
          path?: string
          placeholder?: string
          thumb_path?: string
          user_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "shots_day_fkey"
            columns: ["day"]
            isOneToOne: false
            referencedRelation: "shot_prompts"
            referencedColumns: ["day"]
          },
        ]
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
      texts: {
        Row: {
          key: string
          lang: string
          value: string
        }
        Insert: {
          key: string
          lang: string
          value: string
        }
        Update: {
          key?: string
          lang?: string
          value?: string
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
          pinned_at: string | null
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
          pinned_at?: string | null
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
          pinned_at?: string | null
          resolution?: string | null
          search_tsv?: unknown
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      tot_answers: {
        Row: {
          created_at: string
          guess: number
          pair_id: string
          pick: number
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          guess: number
          pair_id: string
          pick: number
          round_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          guess?: number
          pair_id?: string
          pick?: number
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tot_answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "tot_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      tot_rounds: {
        Row: {
          created_at: string
          created_by: string
          id: string
          pairs: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          pairs: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          pairs?: string[]
        }
        Relationships: []
      }
      voice_notes: {
        Row: {
          author_id: string
          created_at: string
          duration_ms: number
          id: string
          listened_at: string | null
          path: string
          peaks: number[]
        }
        Insert: {
          author_id?: string
          created_at?: string
          duration_ms: number
          id: string
          listened_at?: string | null
          path: string
          peaks: number[]
        }
        Update: {
          author_id?: string
          created_at?: string
          duration_ms?: number
          id?: string
          listened_at?: string | null
          path?: string
          peaks?: number[]
        }
        Relationships: []
      }
      watch_items: {
        Row: {
          added_by: string
          created_at: string
          id: string
          kind: string
          note: string | null
          status: string
          title: string
          watched_on: string | null
          year: number | null
        }
        Insert: {
          added_by?: string
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          status?: string
          title: string
          watched_on?: string | null
          year?: number | null
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          status?: string
          title?: string
          watched_on?: string | null
          year?: number | null
        }
        Relationships: []
      }
      watch_ratings: {
        Row: {
          comment: string | null
          created_at: string
          item_id: string
          stars: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          item_id: string
          stars: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          item_id?: string
          stars?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_ratings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "watch_items"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_wants: {
        Row: {
          created_at: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_wants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "watch_items"
            referencedColumns: ["id"]
          },
        ]
      }
      week_notices: {
        Row: {
          created_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      weigh_in_asks: {
        Row: {
          created_at: string
          date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_log: {
        Row: {
          bmr_kcal: number | null
          body_fat_pct: number | null
          created_at: string
          date: string
          muscle_pct: number | null
          skeletal_muscle_pct: number | null
          user_id: string
          visceral: number | null
          water_pct: number | null
          weight_kg: number
        }
        Insert: {
          bmr_kcal?: number | null
          body_fat_pct?: number | null
          created_at?: string
          date: string
          muscle_pct?: number | null
          skeletal_muscle_pct?: number | null
          user_id?: string
          visceral?: number | null
          water_pct?: number | null
          weight_kg: number
        }
        Update: {
          bmr_kcal?: number | null
          body_fat_pct?: number | null
          created_at?: string
          date?: string
          muscle_pct?: number | null
          skeletal_muscle_pct?: number | null
          user_id?: string
          visceral?: number | null
          water_pct?: number | null
          weight_kg?: number
        }
        Relationships: []
      }
      wish_reservations: {
        Row: {
          created_at: string
          gifted_on: string | null
          user_id: string
          wish_id: string
        }
        Insert: {
          created_at?: string
          gifted_on?: string | null
          user_id?: string
          wish_id: string
        }
        Update: {
          created_at?: string
          gifted_on?: string | null
          user_id?: string
          wish_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wish_reservations_wish_id_fkey"
            columns: ["wish_id"]
            isOneToOne: true
            referencedRelation: "wishlists"
            referencedColumns: ["id"]
          },
        ]
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
          barcode: string | null
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
          long_confirmed: boolean | null
          note: string | null
          period_days: number | null
          started_on: string | null
          user_id: string | null
        }
        Relationships: []
      }
      weight_log_v: {
        Row: {
          bmr_kcal: number | null
          body_fat_pct: number | null
          created_at: string | null
          date: string | null
          fat_kg: number | null
          lean_kg: number | null
          muscle_kg: number | null
          muscle_pct: number | null
          skeletal_kg: number | null
          skeletal_muscle_pct: number | null
          user_id: string | null
          visceral: number | null
          water_kg: number | null
          water_pct: number | null
          weight_kg: number | null
        }
        Insert: {
          bmr_kcal?: number | null
          body_fat_pct?: number | null
          created_at?: string | null
          date?: string | null
          fat_kg?: never
          lean_kg?: never
          muscle_kg?: never
          muscle_pct?: number | null
          skeletal_kg?: never
          skeletal_muscle_pct?: number | null
          user_id?: string | null
          visceral?: number | null
          water_kg?: never
          water_pct?: number | null
          weight_kg?: number | null
        }
        Update: {
          bmr_kcal?: number | null
          body_fat_pct?: number | null
          created_at?: string | null
          date?: string | null
          fat_kg?: never
          lean_kg?: never
          muscle_kg?: never
          muscle_pct?: number | null
          skeletal_kg?: never
          skeletal_muscle_pct?: number | null
          user_id?: string | null
          visceral?: number | null
          water_kg?: never
          water_pct?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ask_checkins: { Args: never; Returns: number }
      ask_checkins_evening: { Args: never; Returns: number }
      attention_count: { Args: { target: string }; Returns: number }
      body_composition: {
        Args: { days?: number; target: string; today: string }
        Returns: {
          fat_change: number
          fat_share: number
          fat_slope: number
          from_date: string
          gap: string
          last_bmr: number
          last_date: string
          last_fat_kg: number
          last_fat_pct: number
          last_lean_kg: number
          last_muscle_pct: number
          last_skeletal_pct: number
          last_visceral: number
          last_water_pct: number
          lean_change: number
          lean_slope: number
          measures: number
          span: number
          to_date: string
          weight_change: number
          weight_slope: number
          window_days: number
        }[]
      }
      by_sex: {
        Args: { female: string; male: string; neutral: string; person: string }
        Returns: string
      }
      check_release: { Args: never; Returns: undefined }
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
      cycle_delay: {
        Args: { on_date: string; owner: string }
        Returns: {
          basis: string
          days: number
          level: string
          since_last: number
        }[]
      }
      cycle_diary_stats: {
        Args: { months?: number; owner: string; today: string }
        Returns: {
          days: number
          mean_carbs: number
          mean_kcal: number
          mean_protein: number
          phase: string
          weigh_ins: number
          weight_delta: number
        }[]
      }
      cycle_lh_anchor: {
        Args: { on_date: string; owner: string; since: string }
        Returns: string
      }
      cycle_luteal_of: { Args: { owner: string }; Returns: number }
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
      cycle_tip_key: { Args: { day: number; phase: string }; Returns: string }
      cycle_usable: {
        Args: { owner: string }
        Returns: {
          cycle_len: number
          cycles_used: number
        }[]
      }
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
      energy_balance: {
        Args: { days?: number; target: string; today: string }
        Returns: {
          first_weight: number
          fit_today: number
          from_date: string
          gap: string
          last_weight: number
          logged_days: number
          mean_kcal: number
          slope: number
          slope_error: number
          tdee: number
          tdee_error: number
          to_date: string
          weigh_ins: number
          weight_span: number
          window_days: number
        }[]
      }
      health_summary: { Args: { days?: number; today: string }; Returns: Json }
      idea_is_match: { Args: { of_key: string }; Returns: boolean }
      idea_matches: {
        Args: never
        Returns: {
          idea_key: string
          matched_at: string
        }[]
      }
      idea_title: {
        Args: { for_user: string; of_key: string }
        Returns: string
      }
      in_quiet_hours: { Args: { target: string }; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      lang_of: { Args: { person: string }; Returns: string }
      last_nudge: { Args: never; Returns: string }
      letter_delivered_to_me: { Args: { letter: string }; Returns: boolean }
      letter_recipients: { Args: { letter: string }; Returns: string[] }
      letters_in_flight: { Args: never; Returns: number }
      med_is_mine: { Args: { of_med: string }; Returns: boolean }
      money_fmt: { Args: { cur: string; n: number }; Returns: string }
      month_summary: { Args: { month: number; year: number }; Returns: Json }
      name_matches: {
        Args: never
        Returns: {
          matched_at: string
          name_key: string
        }[]
      }
      next_occurrence: {
        Args: { from_ts: string; rule: Json }
        Returns: string
      }
      next_occurrence_allowed: {
        Args: { excluded: string[]; from_ts: string; rule: Json }
        Returns: string
      }
      nick_for: { Args: { actor: string; target: string }; Returns: string }
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
      pause_clock: { Args: { at: string; target: string }; Returns: string }
      pause_noted_by: {
        Args: { of_pause: string; who: string }
        Returns: boolean
      }
      pause_noted_by_partner: { Args: { of_pause: string }; Returns: boolean }
      pause_progress: {
        Args: never
        Returns: {
          pause_id: string
          user_id: string
        }[]
      }
      pause_send_over: { Args: { of_pause: string }; Returns: undefined }
      pause_writable: { Args: { of_pause: string }; Returns: boolean }
      pregnancy_active: { Args: { owner: string }; Returns: boolean }
      pulse_done_by_me: { Args: { of_month: string }; Returns: boolean }
      pulse_done_by_partner: { Args: { of_month: string }; Returns: boolean }
      pulse_progress: {
        Args: never
        Returns: {
          month: string
          user_id: string
        }[]
      }
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
      question_answered_by_me: { Args: { on_date: string }; Returns: boolean }
      question_answered_by_partner: {
        Args: { on_date: string }
        Returns: boolean
      }
      question_progress: {
        Args: { since: string }
        Returns: {
          date: string
          question_id: string
          user_id: string
        }[]
      }
      release_seen: {
        Args: { p_app_name: string; p_version: string }
        Returns: number
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
          pinned_at: string | null
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
      send_med_reminders: { Args: { at?: string }; Returns: number }
      send_meeting_reminders: { Args: never; Returns: number }
      send_nudge: { Args: never; Returns: string }
      send_pause_ends: { Args: never; Returns: number }
      send_pregnancy_weeks: { Args: never; Returns: number }
      send_prep_reminders: { Args: never; Returns: number }
      send_pulse_reminders: { Args: never; Returns: number }
      send_question_reminders: { Args: never; Returns: number }
      send_week_summaries: { Args: never; Returns: number }
      send_weigh_in_reminders: { Args: never; Returns: number }
      shot_file_open: { Args: { object_name: string }; Returns: boolean }
      shot_open: { Args: { of_day: string }; Returns: boolean }
      shot_progress: {
        Args: never
        Returns: {
          created_at: string
          day: string
          user_id: string
        }[]
      }
      shot_tick: { Args: { at?: string }; Returns: number }
      story: {
        Args: { lang?: string; today: string }
        Returns: {
          at: string
          day: string
          detail: string
          kind: string
          n: number
          photo: string
          placeholder: string
          ref: string
          title: string
        }[]
      }
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
      tot_done_by: { Args: { round: string; who: string }; Returns: boolean }
      tot_done_by_me: { Args: { round: string }; Returns: boolean }
      tot_progress: {
        Args: never
        Returns: {
          answered: number
          round_id: string
          user_id: string
        }[]
      }
      tx: {
        Args: { args?: string[]; key: string; target: string }
        Returns: string
      }
      tx_by: {
        Args: { actor: string; args?: string[]; key: string; target: string }
        Returns: string
      }
      tx_plural: {
        Args: { key: string; n: number; target: string }
        Returns: string
      }
      tx_sex: {
        Args: { actor: string; key: string; target: string }
        Returns: string
      }
      valid_med_times: { Args: { times: string[] }; Returns: boolean }
      watch_rated_by_me: { Args: { item: string }; Returns: boolean }
      watch_rating_progress: {
        Args: never
        Returns: {
          item_id: string
          user_id: string
        }[]
      }
      week_summary: { Args: { d0: string }; Returns: Json }
      week_summary_of: { Args: { d0: string }; Returns: Json }
      wish_is_others: { Args: { of_wish: string }; Returns: boolean }
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

