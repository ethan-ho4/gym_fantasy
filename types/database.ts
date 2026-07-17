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
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          matchup_id: string;
          weight_unit: 'lb' | 'kg';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          matchup_id: string;
          weight_unit: 'lb' | 'kg';
          created_at?: string;
        };
        Update: {
          weight_unit?: 'lb' | 'kg';
        };
        Relationships: [];
      };
      workouts: {
        Row: {
          id: string;
          session_id: string | null;
          user_id: string;
          matchup_id: string;
          exercise_name: string;
          sets: number;
          reps_per_set: number | null;
          reps: number;
          points: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          user_id: string;
          matchup_id: string;
          exercise_name: string;
          sets: number;
          reps_per_set?: number | null;
          reps?: number;
          points?: number;
          created_at?: string;
        };
        Update: {
          exercise_name?: string;
          sets?: number;
          reps_per_set?: number | null;
          reps?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'workouts_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_sets: {
        Row: {
          id: string;
          workout_id: string;
          set_number: number;
          weight: number;
          reps: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          set_number: number;
          weight: number;
          reps: number;
          created_at?: string;
        };
        Update: {
          weight?: number;
          reps?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sets_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
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
      submit_workout_session: {
        Args: {
          p_matchup_id: string;
          p_weight_unit: string;
          p_exercises: Json;
        };
        Returns: string;
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
export type WorkoutSession = Database['public']['Tables']['workout_sessions']['Row'];
export type Workout = Database['public']['Tables']['workouts']['Row'];
export type WorkoutSet = Database['public']['Tables']['workout_sets']['Row'];
export type ActiveMatchup = Database['public']['Functions']['get_active_matchup']['Returns'][number];
