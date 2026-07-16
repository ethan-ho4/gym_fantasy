export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at?: string;
        };
        Update: {
          display_name?: string;
        };
        Relationships: [];
      };
      seasons: {
        Row: {
          id: string;
          start_date: string;
          end_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          start_date: string;
          end_date: string;
          created_at?: string;
        };
        Update: {
          start_date?: string;
          end_date?: string;
        };
        Relationships: [];
      };
      pools: {
        Row: {
          id: string;
          season_id: string;
          invite_code: string;
          is_active: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          invite_code: string;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: {
          is_active?: boolean;
        };
        Relationships: [];
      };
      pool_members: {
        Row: {
          pool_id: string;
          user_id: string;
          total_points: number;
          joined_at: string;
        };
        Insert: {
          pool_id: string;
          user_id: string;
          total_points?: number;
          joined_at?: string;
        };
        Update: {
          total_points?: number;
        };
        Relationships: [];
      };
      matchups: {
        Row: {
          id: string;
          pool_id: string;
          user_a_id: string;
          user_b_id: string;
          week_start: string;
          week_end: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          pool_id: string;
          user_a_id: string;
          user_b_id: string;
          week_start: string;
          week_end: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          is_active?: boolean;
        };
        Relationships: [];
      };
      workouts: {
        Row: {
          id: string;
          user_id: string;
          matchup_id: string;
          exercise_name: string;
          reps: number;
          points: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          matchup_id: string;
          exercise_name: string;
          reps: number;
          points?: number;
          created_at?: string;
        };
        Update: {
          exercise_name?: string;
          reps?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_pool: {
        Args: Record<string, never>;
        Returns: { pool_id: string; invite_code: string }[];
      };
      join_pool: {
        Args: { p_invite_code: string };
        Returns: { pool_id: string }[];
      };
      start_pool_bracket: {
        Args: { p_pool_id: string };
        Returns: undefined;
      };
      get_active_matchup: {
        Args: Record<string, never>;
        Returns: {
          matchup_id: string;
          pool_id: string;
          opponent_id: string;
          opponent_name: string;
          week_start: string;
          week_end: string;
          my_points: number;
          opponent_points: number;
        }[];
      };
      ensure_active_season: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_display_name_available: {
        Args: { p_name: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Season = Database['public']['Tables']['seasons']['Row'];
export type Pool = Database['public']['Tables']['pools']['Row'];
export type PoolMember = Database['public']['Tables']['pool_members']['Row'];
export type Matchup = Database['public']['Tables']['matchups']['Row'];
export type Workout = Database['public']['Tables']['workouts']['Row'];
export type ActiveMatchup = Database['public']['Functions']['get_active_matchup']['Returns'][number];
