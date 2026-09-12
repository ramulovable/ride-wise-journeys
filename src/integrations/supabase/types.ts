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
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          numeric_value: number
          updated_at: string
        }
        Insert: {
          description?: string | null
          key: string
          numeric_value: number
          updated_at?: string
        }
        Update: {
          description?: string | null
          key?: string
          numeric_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      fare_rules: {
        Row: {
          ac_option: string
          created_at: string
          extra_km_rate: number | null
          id: string
          included_km: number | null
          is_active: boolean
          journey_type: string
          rate_per_km: number | null
          updated_at: string
          vehicle_class: string
        }
        Insert: {
          ac_option?: string
          created_at?: string
          extra_km_rate?: number | null
          id?: string
          included_km?: number | null
          is_active?: boolean
          journey_type: string
          rate_per_km?: number | null
          updated_at?: string
          vehicle_class: string
        }
        Update: {
          ac_option?: string
          created_at?: string
          extra_km_rate?: number | null
          id?: string
          included_km?: number | null
          is_active?: boolean
          journey_type?: string
          rate_per_km?: number | null
          updated_at?: string
          vehicle_class?: string
        }
        Relationships: []
      }
      fare_slabs: {
        Row: {
          created_at: string
          fare_rule_id: string
          id: string
          is_active: boolean
          max_km: number
          min_km: number
          pricing_mode: string
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fare_rule_id: string
          id?: string
          is_active?: boolean
          max_km: number
          min_km: number
          pricing_mode: string
          rate: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fare_rule_id?: string
          id?: string
          is_active?: boolean
          max_km?: number
          min_km?: number
          pricing_mode?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fare_slabs_fare_rule_id_fkey"
            columns: ["fare_rule_id"]
            isOneToOne: false
            referencedRelation: "fare_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          area: string | null
          created_at: string
          formatted_address: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          provider_place_id: string | null
          source: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          formatted_address?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          provider_place_id?: string | null
          source?: string
        }
        Update: {
          area?: string | null
          created_at?: string
          formatted_address?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          provider_place_id?: string | null
          source?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          is_blocked: boolean
          mobile: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_blocked?: boolean
          mobile: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          mobile?: string
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          ride_id: string
          rider_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          ride_id: string
          rider_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          ride_id?: string
          rider_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: true
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["ride_status"] | null
          id: string
          reason: string | null
          ride_id: string
          to_status: Database["public"]["Enums"]["ride_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ride_status"] | null
          id?: string
          reason?: string | null
          ride_id: string
          to_status: Database["public"]["Enums"]["ride_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ride_status"] | null
          id?: string
          reason?: string | null
          ride_id?: string
          to_status?: Database["public"]["Enums"]["ride_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ride_status_history_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_details: {
        Row: {
          base_location_id: string | null
          created_at: string
          is_approved: boolean
          is_blocked: boolean
          is_online: boolean
          license_number: string | null
          seat_capacity: number
          subscription_valid_until: string | null
          updated_at: string
          user_id: string
          vehicle_category_id: string | null
          vehicle_model: string | null
          vehicle_number: string | null
        }
        Insert: {
          base_location_id?: string | null
          created_at?: string
          is_approved?: boolean
          is_blocked?: boolean
          is_online?: boolean
          license_number?: string | null
          seat_capacity?: number
          subscription_valid_until?: string | null
          updated_at?: string
          user_id: string
          vehicle_category_id?: string | null
          vehicle_model?: string | null
          vehicle_number?: string | null
        }
        Update: {
          base_location_id?: string | null
          created_at?: string
          is_approved?: boolean
          is_blocked?: boolean
          is_online?: boolean
          license_number?: string | null
          seat_capacity?: number
          subscription_valid_until?: string | null
          updated_at?: string
          user_id?: string
          vehicle_category_id?: string | null
          vehicle_model?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_details_base_location_id_fkey"
            columns: ["base_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_details_vehicle_category_id_fkey"
            columns: ["vehicle_category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_route_fares: {
        Row: {
          created_at: string
          distance_km: number | null
          duration_minutes: number | null
          from_location_id: string
          id: string
          is_active: boolean
          reserve_fare: number
          rider_id: string
          share_fare: number
          to_location_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          from_location_id: string
          id?: string
          is_active?: boolean
          reserve_fare: number
          rider_id: string
          share_fare: number
          to_location_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          from_location_id?: string
          id?: string
          is_active?: boolean
          reserve_fare?: number
          rider_id?: string
          share_fare?: number
          to_location_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_route_fares_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_route_fares_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_route_fares_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_vehicles: {
        Row: {
          brand_id: string | null
          created_at: string
          has_ac: boolean
          id: string
          is_active: boolean
          is_primary: boolean
          license_number: string | null
          model_id: string | null
          qr_token: string
          rider_id: string
          seat_capacity: number
          updated_at: string
          vehicle_category_id: string
          vehicle_model: string | null
          vehicle_number: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          has_ac?: boolean
          id?: string
          is_active?: boolean
          is_primary?: boolean
          license_number?: string | null
          model_id?: string | null
          qr_token?: string
          rider_id: string
          seat_capacity?: number
          updated_at?: string
          vehicle_category_id: string
          vehicle_model?: string | null
          vehicle_number: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          has_ac?: boolean
          id?: string
          is_active?: boolean
          is_primary?: boolean
          license_number?: string | null
          model_id?: string | null
          qr_token?: string
          rider_id?: string
          seat_capacity?: number
          updated_at?: string
          vehicle_category_id?: string
          vehicle_model?: string | null
          vehicle_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_vehicles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "vehicle_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_vehicles_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_vehicles_vehicle_category_id_fkey"
            columns: ["vehicle_category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          accepted_at: string | null
          arrived_at: string | null
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_collected: boolean
          completed_at: string | null
          created_at: string
          customer_id: string
          distance_km: number | null
          duration_minutes: number | null
          fare_snapshot: Json | null
          from_location_id: string
          id: string
          on_the_way_at: string | null
          passengers: number
          pickup_note: string | null
          requested_ac: boolean | null
          requested_category_id: string | null
          requested_vehicle_class: string | null
          rider_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ride_status"]
          to_location_id: string
          total_fare: number
          unit_fare: number
          updated_at: string
          vehicle_category_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          arrived_at?: string | null
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_collected?: boolean
          completed_at?: string | null
          created_at?: string
          customer_id: string
          distance_km?: number | null
          duration_minutes?: number | null
          fare_snapshot?: Json | null
          from_location_id: string
          id?: string
          on_the_way_at?: string | null
          passengers?: number
          pickup_note?: string | null
          requested_ac?: boolean | null
          requested_category_id?: string | null
          requested_vehicle_class?: string | null
          rider_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          to_location_id: string
          total_fare: number
          unit_fare: number
          updated_at?: string
          vehicle_category_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          arrived_at?: string | null
          booking_type?: Database["public"]["Enums"]["booking_type"]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_collected?: boolean
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          distance_km?: number | null
          duration_minutes?: number | null
          fare_snapshot?: Json | null
          from_location_id?: string
          id?: string
          on_the_way_at?: string | null
          passengers?: number
          pickup_note?: string | null
          requested_ac?: boolean | null
          requested_category_id?: string | null
          requested_vehicle_class?: string | null
          rider_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          to_location_id?: string
          total_fare?: number
          unit_fare?: number
          updated_at?: string
          vehicle_category_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rides_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_requested_category_id_fkey"
            columns: ["requested_category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_vehicle_category_id_fkey"
            columns: ["vehicle_category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          months: number
          note: string | null
          recorded_by: string | null
          rider_id: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          months?: number
          note?: string | null
          recorded_by?: string | null
          rider_id: string
          valid_from?: string
          valid_until: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          months?: number
          note?: string | null
          recorded_by?: string | null
          rider_id?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: []
      }
      support_requests: {
        Row: {
          admin_reply: string | null
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
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
      vehicle_brands: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_brands_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          seat_capacity: number
          sort_order: number
          vehicle_class: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          seat_capacity?: number
          sort_order?: number
          vehicle_class: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          seat_capacity?: number
          sort_order?: number
          vehicle_class?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          seat_capacity: number
          supports_ac: boolean
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          seat_capacity?: number
          supports_ac?: boolean
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          seat_capacity?: number
          supports_ac?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "vehicle_brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_broadcast_ride: {
        Args: { _ride_id: string; _vehicle_id: string }
        Returns: boolean
      }
      advance_rider_ride: {
        Args: { _action: string; _ride_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      shares_ride_with: { Args: { _other: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "rider" | "customer"
      booking_type: "share" | "reserve" | "standard"
      ride_status:
        | "requested"
        | "searching"
        | "accepted"
        | "on_the_way"
        | "arrived"
        | "started"
        | "completed"
        | "cancelled"
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
      app_role: ["admin", "rider", "customer"],
      booking_type: ["share", "reserve", "standard"],
      ride_status: [
        "requested",
        "searching",
        "accepted",
        "on_the_way",
        "arrived",
        "started",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
