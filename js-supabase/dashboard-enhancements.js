// Melhorias complementares da área do usuário: mensagens, contatos e segurança.
(function () {
    let filtroMensagem = "pendentes";
    let mensagensUsuario = [];

    const esc = valor => String(valor ?? "").replace(/[&<>"']/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[caractere]));
    const mensagem = (id, texto, tipo) => { const alvo = document.getElementById(id); if (alvo) { alvo.textContent = texto; alvo.dataset.tipo = tipo; } };

    function renderizarMensagensAprimoradas() {
        const lista = document.getElementById("listaMinhasMensagens");
        const contador = document.getElementById("contadorMensagensPendentes");
        if (!lista) return;
        const pendentes = mensagensUsuario.filter(item => !item.resposta);
        const novasRespostas = mensagensUsuario.filter(item => item.resposta && !item.lida_em);
        if (contador) { contador.hidden = pendentes.length === 0 && novasRespostas.length === 0; contador.textContent = novasRespostas.length ? `${novasRespostas.length} ${novasRespostas.length === 1 ? "nova resposta" : "novas respostas"}` : `${pendentes.length} ${pendentes.length === 1 ? "aguardando resposta" : "aguardando respostas"}`; }
        const itens = mensagensUsuario.filter(item => filtroMensagem === "todas" || (filtroMensagem === "pendentes" ? !item.resposta : Boolean(item.resposta)));
        lista.innerHTML = itens.length ? itens.map(item => `<article class="mensagemUsuario ${item.resposta ? "mensagemRespondida" : "mensagemPendente"}"><div class="cabecalhoMensagem"><div><strong>${esc(item.assunto)}</strong><small>${esc(item.tipo)} · ${new Date(item.criado_em).toLocaleString("pt-BR")}</small></div><span class="statusPainel ${item.resposta ? "statusResolvido" : "statusAguardando"}">${item.resposta ? "Respondida" : "Aguardando resposta"}</span></div><p class="textoMensagemUsuario">${esc(item.mensagem)}</p>${item.resposta ? `<div class="respostaCliente"><strong>Resposta da equipe</strong><p>${esc(item.resposta)}</p><small>Respondida em ${new Date(item.respondido_em || item.criado_em).toLocaleString("pt-BR")}</small></div>` : '<small class="aguardandoMensagem">A equipe responderá por este painel.</small>'}</article>`).join("") : '<p class="estadoMensagens">Nenhuma mensagem encontrada para este filtro.</p>';
    }

    async function carregarMensagensAprimoradas() {
        if (typeof usuarioAtual === "undefined" || !usuarioAtual) return;
        let { data, error } = await supabaseClient.from("mensagens").select("id,assunto,tipo,mensagem,resposta,status,criado_em,respondido_em,lida_em").eq("usuario_id", usuarioAtual.id).order("criado_em", { ascending: false }).limit(50);
        if (error && /lida_em/i.test(error.message || "")) ({ data, error } = await supabaseClient.from("mensagens").select("id,assunto,tipo,mensagem,resposta,status,criado_em,respondido_em").eq("usuario_id", usuarioAtual.id).order("criado_em", { ascending: false }).limit(50));
        if (error) { mensagem("mensagemSuporte", "Não foi possível atualizar suas mensagens.", "erro"); return; }
        mensagensUsuario = data || [];
        renderizarMensagensAprimoradas();
        const novas = mensagensUsuario.filter(item => item.resposta && !item.lida_em).map(item => item.id);
        if (novas.length) await supabaseClient.from("mensagens").update({ lida_em: new Date().toISOString() }).in("id", novas);
    }

    async function carregarContatosExtras() {
        if (typeof idosoAtual === "undefined" || !idosoAtual) return;
        const lista = document.getElementById("listaContatosExtras");
        if (!lista) return;
        const { data, error } = await supabaseClient.from("familiares").select("id,nome,parentesco,telefone,email,prioridade").eq("idoso_id", idosoAtual.id).gt("prioridade", 2).order("prioridade");
        if (error) { lista.innerHTML = '<p class="estadoMensagens mensagemErro">Não foi possível carregar os contatos extras.</p>'; return; }
        lista.innerHTML = data?.length ? data.map(contato => `<article class="contatoExtra"><div><strong>${esc(contato.nome)}</strong><span>${esc(contato.parentesco || "Contato adicional")} · ${esc(contato.telefone || "Sem telefone")}</span>${contato.email ? `<small>${esc(contato.email)}</small>` : ""}</div><button class="botaoSecundario removerContatoExtra" data-id="${contato.id}" type="button">Remover</button></article>`).join("") : '<p class="estadoMensagens">Nenhum contato adicional cadastrado.</p>';
        lista.querySelectorAll(".removerContatoExtra").forEach(botao => botao.addEventListener("click", async () => {
            if (!window.confirm("Remover este contato de acionamento?")) return;
            const { error: erro } = await supabaseClient.from("familiares").delete().eq("id", botao.dataset.id);
            mensagem("mensagemContatosExtras", erro ? erro.message : "Contato removido.", erro ? "erro" : "sucesso");
            if (!erro) { await carregarContatosExtras(); if (typeof carregarPainel === "function") carregarPainel(); }
        }));
    }

    function abrirFormularioContato() {
        const lista = document.getElementById("listaContatosExtras");
        if (!lista || lista.querySelector("#formContatoExtra")) return;
        lista.insertAdjacentHTML("afterbegin", '<form id="formContatoExtra" class="formContatoExtra"><div class="campoDuplo"><div class="campoAcesso"><label for="extraNome">Nome</label><input id="extraNome" required></div><div class="campoAcesso"><label for="extraParentesco">Parentesco</label><input id="extraParentesco" required></div></div><div class="campoDuplo"><div class="campoAcesso"><label for="extraTelefone">Telefone</label><input id="extraTelefone" type="tel" required></div><div class="campoAcesso"><label for="extraEmail">E-mail (opcional)</label><input id="extraEmail" type="email"></div></div><div class="acoesCadastro"><button class="botaoFormulario" type="submit">Salvar contato</button><button id="cancelarContatoExtra" class="botaoSecundario" type="button">Cancelar</button></div></form>');
        document.getElementById("cancelarContatoExtra").addEventListener("click", carregarContatosExtras);
        document.getElementById("formContatoExtra").addEventListener("submit", salvarContatoExtra);
        if (window.aplicarMascarasCadastro) window.aplicarMascarasCadastro();
    }

    async function salvarContatoExtra(evento) {
        evento.preventDefault();
        const { data: ultimo } = await supabaseClient.from("familiares").select("prioridade").eq("idoso_id", idosoAtual.id).order("prioridade", { ascending: false }).limit(1).maybeSingle();
        const novo = { idoso_id: idosoAtual.id, prioridade: Math.max(3, Number(ultimo?.prioridade || 2) + 1), nome: document.getElementById("extraNome").value.trim(), parentesco: document.getElementById("extraParentesco").value.trim(), telefone: document.getElementById("extraTelefone").value.trim(), email: document.getElementById("extraEmail").value.trim() || null };
        const { error } = await supabaseClient.from("familiares").insert(novo);
        mensagem("mensagemContatosExtras", error ? error.message : "Contato adicional salvo.", error ? "erro" : "sucesso");
        if (!error) { await carregarContatosExtras(); if (typeof carregarPainel === "function") carregarPainel(); }
    }

    async function atualizarEmail(evento) {
        evento.preventDefault();
        const email = document.getElementById("novoEmailConta").value.trim();
        const { error } = await supabaseClient.auth.updateUser({ email });
        mensagem("mensagemEmailConta", error ? error.message : "Solicitação enviada. Confirme o novo e-mail conforme as instruções recebidas.", error ? "erro" : "sucesso");
    }

    async function atualizarSenha(evento) {
        evento.preventDefault();
        const password = document.getElementById("novaSenhaConta").value;
        const { error } = await supabaseClient.auth.updateUser({ password });
        mensagem("mensagemSenhaConta", error ? error.message : "Senha atualizada com sucesso.", error ? "erro" : "sucesso");
        if (!error) evento.target.reset();
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".filtroMensagem").forEach(botao => botao.addEventListener("click", () => {
            filtroMensagem = botao.dataset.filtroMensagem;
            document.querySelectorAll(".filtroMensagem").forEach(item => item.classList.toggle("ativo", item === botao));
            const titulo = document.getElementById("tituloMinhasMensagens");
            const descricao = document.getElementById("descricaoMinhasMensagens");
            const textos = {
                pendentes: ["Mensagens aguardando resposta", "Acompanhe as dúvidas e solicitações que ainda aguardam retorno da equipe."],
                respondidas: ["Mensagens respondidas", "Consulte as respostas enviadas pela equipe P.R.O.T.E.G.E."],
                todas: ["Todas as mensagens", "Consulte todo o histórico de conversas com a equipe."]
            };
            if (titulo) titulo.textContent = textos[filtroMensagem][0];
            if (descricao) descricao.textContent = textos[filtroMensagem][1];
            renderizarMensagensAprimoradas();
        }));
        document.getElementById("adicionarContatoExtra")?.addEventListener("click", abrirFormularioContato);
        document.getElementById("formEmailConta")?.addEventListener("submit", atualizarEmail);
        document.getElementById("formSenhaConta")?.addEventListener("submit", atualizarSenha);
        let tentativas = 0;
        const aguardarUsuario = window.setInterval(() => { if (typeof usuarioAtual !== "undefined" && usuarioAtual) { carregarMensagensAprimoradas(); carregarContatosExtras(); window.clearInterval(aguardarUsuario); } else if (++tentativas > 30) window.clearInterval(aguardarUsuario); }, 300);
        window.setInterval(carregarMensagensAprimoradas, 20000);
    });
})();
