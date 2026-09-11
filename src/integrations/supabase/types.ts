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
      locations: {
        Row: {
          area: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          area?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          mobile: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name?: string
          id: string
          mobile: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
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
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          license_number: string | null
          qr_token: string
          rider_id: string
          seat_capacity: number
          updated_at: string
          vehicle_category_id: string
          vehicle_model: string | null
          vehicle_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          license_number?: string | null
          qr_token?: string
          rider_id: string
          seat_capacity?: number
          updated_at?: string
          vehicle_category_id: string
          vehicle_model?: string | null
          vehicle_number: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          license_number?: string | null
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
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancel_reason: string | null
          cancelled_by: string | null
          cash_collected: boolean
          completed_at: string | null
          created_at: string
          customer_id: string
          from_location_id: string
          id: string
          passengers: number
          pickup_note: string | null
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
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancel_reason?: string | null
          cancelled_by?: string | null
          cash_collected?: boolean
          completed_at?: string | null
          created_at?: string
          customer_id: string
          from_location_id: string
          id?: string
          passengers?: number
          pickup_note?: string | null
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
          booking_type?: Database["public"]["Enums"]["booking_type"]
          cancel_reason?: string | null
          cancelled_by?: string | null
          cash_collected?: boolean
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          from_location_id?: string
          id?: string
          passengers?: number
          pickup_note?: string | null
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
      vehicle_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          seat_capacity: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          seat_capacity?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          seat_capacity?: number
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      booking_type: "share" | "reserve"
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
      booking_type: ["share", "reserve"],
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
