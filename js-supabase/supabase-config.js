// =====================================================
// CONFIGURAÇÃO DAS CONEXÕES EXTERNAS
// =====================================================
// A chave pública é protegida pelas políticas RLS do Supabase.
const supabaseUrl = "https://agysrflxstkranxznxxt.supabase.co";
const supabaseAnonKey = "sb_publishable_2mwWnzRVIutF1iiQuScPjA_s-W9wBYo";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
// Em desenvolvimento a API roda na porta 5000. Em produção, o padrão é
// usar a mesma origem HTTPS do site por meio de um proxy reverso em /api.
const protegeApiUrl = ["localhost", "127.0.0.1", "192.168.3.3"].includes(window.location.hostname)
    ? `http://${window.location.hostname}:5000`
    : "https://tcc-9vom.onrender.com";
window.protegeApiUrl = protegeApiUrl;

// Converte qualquer dado externo em texto seguro antes de inseri-lo em HTML.
// Use esta função para nomes, mensagens e demais valores vindos do banco.
window.protegeEscaparHtml = function protegeEscaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
    })[caractere]);
};
