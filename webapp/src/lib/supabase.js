/**
 * Client Supabase pour StickerStreet.
 * Récupère l'URL et la clé anon dans le projet Supabase :
 * https://supabase.com/dashboard/project/_/settings/api
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** Vérifie si Supabase est configuré */
export const isSupabaseConfigured = () => !!supabase;
