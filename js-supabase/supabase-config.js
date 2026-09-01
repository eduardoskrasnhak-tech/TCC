// =====================================================
// CONFIGURAÇÃO DAS CONEXÕES EXTERNAS
// =====================================================
// A chave pública é protegida pelas políticas RLS do Supabase.
const supabaseUrl = "https://agysrflxstkranxznxxt.supabase.co";
const supabaseAnonKey = "sb_publishable_2mwWnzRVIutF1iiQuScPjA_s-W9wBYo";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
const protegeApiUrl = "http://localhost:5000";
