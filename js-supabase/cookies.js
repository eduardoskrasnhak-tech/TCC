/* Consentimento simples para o armazenamento local e cookies opcionais. */
(function () {
    const CHAVE_CONSENTIMENTO = "protege-consentimento-cookies-v1";
    const escolhaAtual = () => {
        try { return JSON.parse(localStorage.getItem(CHAVE_CONSENTIMENTO) || "null"); }
        catch { return null; }
    };

    function salvarEscolha(opcionais) {
        try {
            localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({
                essenciais: true,
                opcionais: Boolean(opcionais),
                atualizadoEm: new Date().toISOString()
            }));
        } catch {
            // O site continua funcionando mesmo quando o navegador bloqueia armazenamento local.
        }
        document.getElementById("bannerCookies")?.remove();
        document.getElementById("preferenciasCookies")?.remove();
    }

    function abrirPreferencias() {
        const dialogo = document.getElementById("preferenciasCookies");
        if (!dialogo) return;
        dialogo.hidden = false;
        dialogo.querySelector("button")?.focus();
    }

    function criarInterface() {
        if (escolhaAtual()) return;
        const banner = document.createElement("aside");
        banner.id = "bannerCookies";
        banner.className = "bannerCookies";
        banner.setAttribute("aria-label", "Preferências de cookies");
        banner.innerHTML = `
            <div class="bannerCookiesTexto">
                <strong>Privacidade e cookies</strong>
                <p>Usamos armazenamento essencial para manter preferências e o funcionamento da conta. Não ativamos cookies opcionais sem sua autorização. <a href="politica-privacidade.html">Saiba mais na política de privacidade</a>.</p>
            </div>
            <div class="bannerCookiesAcoes">
                <button id="configurarCookies" class="botaoSecundario" type="button">Configurar</button>
                <button id="recusarCookies" class="botaoSecundario" type="button">Somente essenciais</button>
                <button id="aceitarCookies" class="botaoFormulario" type="button">Permitir opcionais</button>
            </div>`;
        document.body.appendChild(banner);

        const dialogo = document.createElement("div");
        dialogo.id = "preferenciasCookies";
        dialogo.className = "preferenciasCookies";
        dialogo.hidden = true;
        dialogo.setAttribute("role", "dialog");
        dialogo.setAttribute("aria-modal", "true");
        dialogo.setAttribute("aria-labelledby", "tituloPreferenciasCookies");
        dialogo.innerHTML = `
            <div class="preferenciasCookiesConteudo">
                <h2 id="tituloPreferenciasCookies">Preferências de cookies</h2>
                <p>Você pode alterar sua escolha a qualquer momento limpando os dados do site no navegador.</p>
                <div class="preferenciaCookie"><div><strong>Essenciais</strong><span>Necessários para segurança, sessão e preferências básicas.</span></div><strong>Ativos</strong></div>
                <div class="preferenciaCookie"><div><strong>Opcionais</strong><span>Seriam usados apenas para recursos adicionais, quando forem incluídos.</span></div><strong>Desativados</strong></div>
                <div class="preferenciasCookiesAcoes"><button id="fecharPreferenciasCookies" class="botaoSecundario" type="button">Cancelar</button><button id="salvarPreferenciasCookies" class="botaoFormulario" type="button">Salvar somente essenciais</button></div>
            </div>`;
        document.body.appendChild(dialogo);

        document.getElementById("configurarCookies").addEventListener("click", abrirPreferencias);
        document.getElementById("recusarCookies").addEventListener("click", () => salvarEscolha(false));
        document.getElementById("aceitarCookies").addEventListener("click", () => salvarEscolha(true));
        document.getElementById("fecharPreferenciasCookies").addEventListener("click", () => { dialogo.hidden = true; document.getElementById("configurarCookies")?.focus(); });
        document.getElementById("salvarPreferenciasCookies").addEventListener("click", () => salvarEscolha(false));
        dialogo.addEventListener("click", evento => { if (evento.target === dialogo) dialogo.hidden = true; });
    }

    document.addEventListener("DOMContentLoaded", criarInterface);
})();
