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
      admin_wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          direction: string
          id: string
          note: string | null
          withdrawal_request_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          note?: string | null
          withdrawal_request_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          note?: string | null
          withdrawal_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_wallet_transactions_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
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
      app_text_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      broadcast_messages: {
        Row: {
          action_path: string
          audience: string
          body: string
          created_at: string
          delivered_count: number
          id: string
          recipient_count: number
          sent_by: string | null
          title: string
        }
        Insert: {
          action_path?: string
          audience: string
          body: string
          created_at?: string
          delivered_count?: number
          id?: string
          recipient_count?: number
          sent_by?: string | null
          title: string
        }
        Update: {
          action_path?: string
          audience?: string
          body?: string
          created_at?: string
          delivered_count?: number
          id?: string
          recipient_count?: number
          sent_by?: string | null
          title?: string
        }
        Relationships: []
      }
      day_night_pricing_config: {
        Row: {
          applies_to_per_km: boolean
          applies_to_reserve: boolean
          applies_to_share: boolean
          created_at: string
          day_start_time: string
          id: string
          is_enabled: boolean
          night_direct_rate: number | null
          night_multiplier: number
          night_start_time: string
          pricing_mode: string
          updated_at: string
        }
        Insert: {
          applies_to_per_km?: boolean
          applies_to_reserve?: boolean
          applies_to_share?: boolean
          created_at?: string
          day_start_time?: string
          id?: string
          is_enabled?: boolean
          night_direct_rate?: number | null
          night_multiplier?: number
          night_start_time?: string
          pricing_mode?: string
          updated_at?: string
        }
        Update: {
          applies_to_per_km?: boolean
          applies_to_reserve?: boolean
          applies_to_share?: boolean
          created_at?: string
          day_start_time?: string
          id?: string
          is_enabled?: boolean
          night_direct_rate?: number | null
          night_multiplier?: number
          night_start_time?: string
          pricing_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      day_night_vehicle_overrides: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_enabled: boolean
          night_direct_rate: number | null
          night_multiplier: number | null
          pricing_mode: string
          updated_at: string
          vehicle_category_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          night_direct_rate?: number | null
          night_multiplier?: number | null
          pricing_mode?: string
          updated_at?: string
          vehicle_category_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          night_direct_rate?: number | null
          night_multiplier?: number | null
          pricing_mode?: string
          updated_at?: string
          vehicle_category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_night_vehicle_overrides_vehicle_category_id_fkey"
            columns: ["vehicle_category_id"]
            isOneToOne: true
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_settings: {
        Row: {
          created_at: string
          dispatch_enabled: boolean
          dispatch_priority: string
          en_route_matching_enabled: boolean
          id: string
          max_additional_minutes: number
          max_gps_accuracy_meters: number
          max_location_age_seconds: number
          max_pickup_detour_km: number
          max_share_passengers: number
          nearby_dispatch_enabled: boolean
          pickup_radius_km: number
          require_location_for_dispatch: boolean
          reserve_exclusive: boolean
          route_corridor_km: number
          updated_at: string
          weight_additional_time: number
          weight_capacity: number
          weight_detour: number
          weight_pickup_proximity: number
        }
        Insert: {
          created_at?: string
          dispatch_enabled?: boolean
          dispatch_priority?: string
          en_route_matching_enabled?: boolean
          id?: string
          max_additional_minutes?: number
          max_gps_accuracy_meters?: number
          max_location_age_seconds?: number
          max_pickup_detour_km?: number
          max_share_passengers?: number
          nearby_dispatch_enabled?: boolean
          pickup_radius_km?: number
          require_location_for_dispatch?: boolean
          reserve_exclusive?: boolean
          route_corridor_km?: number
          updated_at?: string
          weight_additional_time?: number
          weight_capacity?: number
          weight_detour?: number
          weight_pickup_proximity?: number
        }
        Update: {
          created_at?: string
          dispatch_enabled?: boolean
          dispatch_priority?: string
          en_route_matching_enabled?: boolean
          id?: string
          max_additional_minutes?: number
          max_gps_accuracy_meters?: number
          max_location_age_seconds?: number
          max_pickup_detour_km?: number
          max_share_passengers?: number
          nearby_dispatch_enabled?: boolean
          pickup_radius_km?: number
          require_location_for_dispatch?: boolean
          reserve_exclusive?: boolean
          route_corridor_km?: number
          updated_at?: string
          weight_additional_time?: number
          weight_capacity?: number
          weight_detour?: number
          weight_pickup_proximity?: number
        }
        Relationships: []
      }
      earning_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          ride_id: string
          rider_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          ride_id: string
          rider_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          ride_id?: string
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "earning_transactions_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: true
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      en_route_matches: {
        Row: {
          active_ride_id: string
          additional_duration_minutes: number | null
          compatibility_result: Json
          created_at: string
          id: string
          new_ride_id: string
          pickup_detour_km: number | null
          rider_id: string
          route_deviation_km: number | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active_ride_id: string
          additional_duration_minutes?: number | null
          compatibility_result?: Json
          created_at?: string
          id?: string
          new_ride_id: string
          pickup_detour_km?: number | null
          rider_id: string
          route_deviation_km?: number | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active_ride_id?: string
          additional_duration_minutes?: number | null
          compatibility_result?: Json
          created_at?: string
          id?: string
          new_ride_id?: string
          pickup_detour_km?: number | null
          rider_id?: string
          route_deviation_km?: number | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "en_route_matches_active_ride_id_fkey"
            columns: ["active_ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "en_route_matches_new_ride_id_fkey"
            columns: ["new_ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "en_route_matches_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fare_rule_history: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          table_name: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          table_name: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          table_name?: string
          target_id?: string | null
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
          pin_code: string | null
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
          pin_code?: string | null
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
          pin_code?: string | null
          provider_place_id?: string | null
          source?: string
        }
        Relationships: []
      }
      mobile_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          mobile: string
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          mobile: string
          purpose: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          mobile?: string
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_devices: {
        Row: {
          created_at: string
          device_type: string
          id: string
          is_active: boolean
          push_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          push_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          push_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          data: Json
          delivered: boolean
          id: string
          ride_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          data?: Json
          delivered?: boolean
          id?: string
          ride_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          data?: Json
          delivered?: boolean
          id?: string
          ride_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          is_blocked: boolean
          mobile: string
          my_referral_code: string | null
          photo_url: string | null
          referral_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_blocked?: boolean
          mobile: string
          my_referral_code?: string | null
          photo_url?: string | null
          referral_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          mobile?: string
          my_referral_code?: string | null
          photo_url?: string | null
          referral_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotional_banners: {
        Row: {
          action_url: string | null
          badge_text: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          badge_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          subtitle?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          badge_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          subtitle?: string
          title?: string
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
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_reward_conditions: {
        Row: {
          code: string
          created_at: string
          description: string
          display_name: string
          event_type: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          display_name: string
          event_type: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          display_name?: string
          event_type?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          referral_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          referral_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          referral_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_transactions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          eligible_at: string | null
          id: string
          referral_code_id: string | null
          referred_user_id: string
          referrer_user_id: string
          reward_amount: number
          rewarded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          eligible_at?: string | null
          id?: string
          referral_code_id?: string | null
          referred_user_id: string
          referrer_user_id: string
          reward_amount?: number
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          eligible_at?: string | null
          id?: string
          referral_code_id?: string | null
          referred_user_id?: string
          referrer_user_id?: string
          reward_amount?: number
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_alert_settings: {
        Row: {
          alert_duration_seconds: number
          alert_sound: string
          created_at: string
          full_screen_enabled: boolean
          id: string
          max_riders_notified: number
          notification_priority: string
          response_timeout_seconds: number
          retry_interval_seconds: number
          sound_enabled: boolean
          updated_at: string
          vibration_enabled: boolean
        }
        Insert: {
          alert_duration_seconds?: number
          alert_sound?: string
          created_at?: string
          full_screen_enabled?: boolean
          id?: string
          max_riders_notified?: number
          notification_priority?: string
          response_timeout_seconds?: number
          retry_interval_seconds?: number
          sound_enabled?: boolean
          updated_at?: string
          vibration_enabled?: boolean
        }
        Update: {
          alert_duration_seconds?: number
          alert_sound?: string
          created_at?: string
          full_screen_enabled?: boolean
          id?: string
          max_riders_notified?: number
          notification_priority?: string
          response_timeout_seconds?: number
          retry_interval_seconds?: number
          sound_enabled?: boolean
          updated_at?: string
          vibration_enabled?: boolean
        }
        Relationships: []
      }
      ride_dismissals: {
        Row: {
          created_at: string
          ride_id: string
          rider_id: string
        }
        Insert: {
          created_at?: string
          ride_id: string
          rider_id: string
        }
        Update: {
          created_at?: string
          ride_id?: string
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_dismissals_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          heading: number | null
          latitude: number
          longitude: number
          ride_id: string
          rider_id: string
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          heading?: number | null
          latitude: number
          longitude: number
          ride_id: string
          rider_id: string
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          heading?: number | null
          latitude?: number
          longitude?: number
          ride_id?: string
          rider_id?: string
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_driver_locations_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: true
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_route_state: {
        Row: {
          created_at: string
          current_latitude: number | null
          current_longitude: number | null
          destination_latitude: number | null
          destination_longitude: number | null
          is_active: boolean
          occupied_passenger_count: number
          origin_latitude: number | null
          origin_longitude: number | null
          remaining_capacity: number
          remaining_distance_km: number | null
          remaining_duration_minutes: number | null
          ride_id: string
          rider_id: string
          route_geometry: Json
          route_progress: number
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          is_active?: boolean
          occupied_passenger_count?: number
          origin_latitude?: number | null
          origin_longitude?: number | null
          remaining_capacity?: number
          remaining_distance_km?: number | null
          remaining_duration_minutes?: number | null
          ride_id: string
          rider_id: string
          route_geometry?: Json
          route_progress?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          is_active?: boolean
          occupied_passenger_count?: number
          origin_latitude?: number | null
          origin_longitude?: number | null
          remaining_capacity?: number
          remaining_distance_km?: number | null
          remaining_duration_minutes?: number | null
          ride_id?: string
          rider_id?: string
          route_geometry?: Json
          route_progress?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ride_route_state_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: true
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_route_state_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_route_stops: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          location_id: string | null
          longitude: number | null
          passenger_count: number
          ride_id: string
          rider_id: string
          sequence_order: number
          status: string
          stop_type: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          passenger_count?: number
          ride_id: string
          rider_id: string
          sequence_order?: number
          status?: string
          stop_type: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          passenger_count?: number
          ride_id?: string
          rider_id?: string
          sequence_order?: number
          status?: string
          stop_type?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ride_route_stops_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_route_stops_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_route_stops_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
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
          is_verified: boolean
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
          is_verified?: boolean
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
          is_verified?: boolean
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
      rider_live_locations: {
        Row: {
          accuracy_meters: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          rider_id: string
          vehicle_id: string | null
        }
        Insert: {
          accuracy_meters?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          rider_id: string
          vehicle_id?: string | null
        }
        Update: {
          accuracy_meters?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          rider_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_live_locations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_presence: {
        Row: {
          active_ride_id: string | null
          active_vehicle_id: string | null
          created_at: string
          current_accuracy_meters: number | null
          current_latitude: number | null
          current_longitude: number | null
          last_location_at: string | null
          last_seen_at: string | null
          rider_id: string
          status: string
          updated_at: string
        }
        Insert: {
          active_ride_id?: string | null
          active_vehicle_id?: string | null
          created_at?: string
          current_accuracy_meters?: number | null
          current_latitude?: number | null
          current_longitude?: number | null
          last_location_at?: string | null
          last_seen_at?: string | null
          rider_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_ride_id?: string | null
          active_vehicle_id?: string | null
          created_at?: string
          current_accuracy_meters?: number | null
          current_latitude?: number | null
          current_longitude?: number | null
          last_location_at?: string | null
          last_seen_at?: string | null
          rider_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_presence_active_ride_id_fkey"
            columns: ["active_ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_presence_active_vehicle_id_fkey"
            columns: ["active_vehicle_id"]
            isOneToOne: false
            referencedRelation: "rider_vehicles"
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
          brand_name: string | null
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
          variant_id: string | null
          vehicle_category_id: string
          vehicle_model: string | null
          vehicle_number: string
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
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
          variant_id?: string | null
          vehicle_category_id: string
          vehicle_model?: string | null
          vehicle_number: string
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
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
          variant_id?: string | null
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
            foreignKeyName: "rider_vehicles_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vehicle_variants"
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
      three_wheeler_reserve_config: {
        Row: {
          created_at: string
          fixed_fare: number
          id: string
          is_enabled: boolean
          max_km: number
          min_km: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fixed_fare?: number
          id?: string
          is_enabled?: boolean
          max_km?: number
          min_km?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fixed_fare?: number
          id?: string
          is_enabled?: boolean
          max_km?: number
          min_km?: number
          updated_at?: string
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
          segment_id: string | null
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
          segment_id?: string | null
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
          segment_id?: string | null
          sort_order?: number
          vehicle_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_categories_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "vehicle_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_images: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          id: string
          image_path: string
          is_active: boolean
          is_primary: boolean
          model_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_path: string
          is_active?: boolean
          is_primary?: boolean
          model_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_path?: string
          is_active?: boolean
          is_primary?: boolean
          model_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_images_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "vehicle_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_images_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_images_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vehicle_variants"
            referencedColumns: ["id"]
          },
        ]
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
      vehicle_segments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          vehicle_class: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          vehicle_class: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          vehicle_class?: string
        }
        Relationships: []
      }
      vehicle_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          model_id: string
          name: string
          seat_capacity: number
          supports_ac: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          model_id: string
          name: string
          seat_capacity?: number
          supports_ac?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          model_id?: string
          name?: string
          seat_capacity?: number
          supports_ac?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_variants_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_accounts: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          reference_id: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          type?: Database["public"]["Enums"]["wallet_txn_type"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reference_utr: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
          upi_id: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reference_utr?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          upi_id: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reference_utr?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          upi_id?: string
          user_id?: string
        }
        Relationships: []
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
      admin_adjust_wallet: {
        Args: { _amount: number; _note: string; _user_id: string }
        Returns: boolean
      }
      admin_update_withdrawal: {
        Args: {
          _id: string
          _note?: string
          _status: Database["public"]["Enums"]["withdrawal_status"]
          _utr?: string
        }
        Returns: boolean
      }
      advance_rider_ride: {
        Args: { _action: string; _ride_id: string }
        Returns: boolean
      }
      award_referral: { Args: { _referral_id: string }; Returns: boolean }
      ensure_referral_code: { Args: { _user_id?: string }; Returns: string }
      ensure_wallet: { Args: { _user_id: string }; Returns: undefined }
      generate_referral_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      request_withdrawal: {
        Args: { _amount: number; _upi: string }
        Returns: string
      }
      shares_ride_with: { Args: { _other: string }; Returns: boolean }
      wallet_balance: { Args: { _user_id: string }; Returns: number }
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
        | "no_rider_available"
      wallet_txn_type:
        | "REFERRAL_REWARD"
        | "RIDE_EARNING"
        | "WITHDRAWAL_HOLD"
        | "WITHDRAWAL_DEBIT"
        | "WITHDRAWAL_REVERSAL"
        | "ADMIN_ADJUSTMENT"
      withdrawal_status:
        | "PENDING"
        | "APPROVED"
        | "PROCESSING"
        | "PAID"
        | "REJECTED"
        | "FAILED"
        | "REVERSED"
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
        "no_rider_available",
      ],
      wallet_txn_type: [
        "REFERRAL_REWARD",
        "RIDE_EARNING",
        "WITHDRAWAL_HOLD",
        "WITHDRAWAL_DEBIT",
        "WITHDRAWAL_REVERSAL",
        "ADMIN_ADJUSTMENT",
      ],
      withdrawal_status: [
        "PENDING",
        "APPROVED",
        "PROCESSING",
        "PAID",
        "REJECTED",
        "FAILED",
        "REVERSED",
      ],
    },
  },
} as const
