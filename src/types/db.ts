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
          updated_at?: string
          yield_grams?: number | null
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
          sex?: string | null
          telegram_chat_id?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
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
    }
    Functions: {
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
      is_member: { Args: never; Returns: boolean }
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
      tg_escape: { Args: { input: string }; Returns: string }
      tg_notify_partner: {
        Args: { author_id: string; message: string }
        Returns: undefined
      }
      tg_send_raw: {
        Args: { chat_id: string; message: string }
        Returns: number
      }
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

