// Melhorias de clareza da central administrativa.
(function () {
    const chamadosAtuais = () => typeof chamadosAdmin !== "undefined" ? chamadosAdmin : [];
    const alteracoesAtuais = () => typeof alteracoesChamados !== "undefined" ? alteracoesChamados : new Map();
    const esc = window.protegeEscaparHtml || (valor => String(valor ?? ""));

    function statusHumano(status) {
        if (/emerg/i.test(String(status || ""))) return { texto: "Emergência acionada", classe: "statusEmergencia" };
        const mapa = {
            "Recebido": ["Aguardando atendimento", "statusAguardando"],
            "Em atendimento": ["Em atendimento", "statusAtendimento"],
            "Resolvido": ["Resolvido", "statusResolvido"],
            "Falha no envio": ["Falha no envio", "statusFalha"]
        };
        const item = mapa[status] || [status || "Aguardando atendimento", "statusAguardando"];
        return { texto: item[0], classe: item[1] };
    }

    function atualizarResumo() {
        const chamados = chamadosAtuais();
        const andamento = chamados.filter(chamado => chamado.status !== "Resolvido").sort((a, b) => {
            const prioridadeA = /emerg/i.test(String(a.status || "")) || a.event_type === "emergency" ? 1 : 0;
            const prioridadeB = /emerg/i.test(String(b.status || "")) || b.event_type === "emergency" ? 1 : 0;
            return prioridadeB - prioridadeA || new Date(b.criado_em) - new Date(a.criado_em);
        });
        const total = document.getElementById("totalChamadosAndamento");
        const descricao = document.getElementById("descricaoChamadosAndamento");
        if (total) total.textContent = andamento.length;
        if (descricao) descricao.textContent = andamento.length === 0 ? "Nenhuma solicitação aguardando atendimento" : andamento.length === 1 ? "Solicitação aguardando atendimento" : "Solicitações aguardando atendimento";

        const area = document.getElementById("chamadosAtencao");
        const lista = document.getElementById("listaChamadosAtencao");
        const quantidade = document.getElementById("quantidadeChamadosAtencao");
        if (!area || !lista || !quantidade) return;
        area.hidden = andamento.length === 0;
        if (!andamento.length) return;
        quantidade.textContent = `${andamento.length} ${andamento.length === 1 ? "chamado" : "chamados"}`;
        lista.innerHTML = andamento.slice(0, 3).map(chamado => {
            const status = statusHumano(chamado.status);
            const mapa = chamado.latitude != null && chamado.longitude != null ? `<a class="botaoTabela" href="https://www.google.com/maps?q=${chamado.latitude},${chamado.longitude}" target="_blank" rel="noopener">Ver localização</a>` : "Localização não registrada";
            return `<article class="itemChamadoAtencao"><div><strong>${esc(chamado.idosos?.nome || "Cliente")}</strong><small>${new Date(chamado.criado_em).toLocaleString("pt-BR")}</small><span class="statusPainel ${status.classe}">${esc(status.texto)}</span></div><div class="acoesAtencao">${mapa}<button class="botaoTabela verChamadoAtencao" type="button">Ver chamado</button></div></article>`;
        }).join("");
        lista.querySelectorAll(".verChamadoAtencao").forEach(botao => botao.addEventListener("click", () => document.getElementById("listaChamadosAdmin").scrollIntoView({ behavior: "smooth", block: "center" })));
    }

    function renderizarChamadosPolido(lista) {
        lista = lista || chamadosAtuais();
        atualizarResumo();
        const corpo = document.getElementById("listaChamadosAdmin");
        if (!corpo) return;
        corpo.innerHTML = lista.length ? lista.map(chamado => {
            const statusAtual = alteracoesAtuais().get(chamado.id) || chamado.status;
            const status = statusHumano(statusAtual);
            const mapa = chamado.latitude != null && chamado.longitude != null ? `<a href="https://www.google.com/maps?q=${chamado.latitude},${chamado.longitude}" target="_blank" rel="noopener">Ver localização</a>` : "Localização não registrada";
            const pendente = alteracoesAtuais().has(chamado.id);
            return `<tr><td>${esc(chamado.idosos?.nome || "Cliente")}</td><td>${new Date(chamado.criado_em).toLocaleString("pt-BR")}</td><td>${mapa}</td><td><span class="statusPainel ${status.classe}">${esc(status.texto)}</span><select class="statusSelect" data-chamado="${esc(chamado.id)}" aria-label="Alterar status de ${esc(chamado.idosos?.nome || "cliente")}"><option value="Recebido" ${statusAtual === "Recebido" ? "selected" : ""}>Aguardando atendimento</option><option value="Em atendimento" ${statusAtual === "Em atendimento" ? "selected" : ""}>Em atendimento</option><option value="Resolvido" ${statusAtual === "Resolvido" ? "selected" : ""}>Resolvido</option><option value="Emergência" ${/emerg/i.test(String(statusAtual || "")) ? "selected" : ""}>Emergência acionada</option></select></td><td class="estadoAlteracao">${pendente ? "Alteração pendente" : "✓ Salvo"}</td></tr>`;
        }).join("") : '<tr><td colspan="5">Nenhum chamado encontrado.</td></tr>';
        corpo.querySelectorAll(".statusSelect").forEach(select => select.addEventListener("change", () => window.registrarAlteracaoStatus(select.dataset.chamado, select.value)));
        if (window.atualizarIndicadorAlteracoes) window.atualizarIndicadorAlteracoes();
    }

    function renderizarMensagensPolido(mensagens) {
        const lista = document.getElementById("listaMensagens");
        if (!lista) return;
        lista.innerHTML = mensagens?.length ? mensagens.map(mensagem => {
            const respondida = Boolean(mensagem.resposta);
            return `<article class="mensagemCliente ${respondida ? "mensagemRespondida" : "mensagemPendente"}"><div class="cabecalhoMensagem"><div><strong>${esc(mensagem.assunto)}</strong><small>${esc(mensagem.tipo)} · ${new Date(mensagem.criado_em).toLocaleString("pt-BR")}</small></div><span class="statusPainel ${respondida ? "statusResolvido" : "statusAguardando"}">${respondida ? "Respondida" : "Aguardando resposta"}</span></div><p class="textoMensagemCliente">${esc(mensagem.mensagem)}</p>${respondida ? `<div class="respostaCliente"><strong>Resposta da equipe:</strong><p>${esc(mensagem.resposta)}</p></div>` : `<label class="rotuloResposta" for="resposta-${esc(mensagem.id)}">Resposta</label><textarea id="resposta-${esc(mensagem.id)}" rows="3" placeholder="Digite uma resposta para o cliente"></textarea><button class="botaoTabela responderMensagem" data-id="${esc(mensagem.id)}" type="button">Responder</button>`}</article>`;
        }).join("") : "Nenhuma mensagem recebida.";
        lista.querySelectorAll(".responderMensagem").forEach(botao => botao.addEventListener("click", () => window.responderMensagem(botao.dataset.id)));
    }

    function preencherClientesSimulacao() {
        const seletor = document.getElementById("clienteSimulacao");
        const clientes = typeof clientesAdmin !== "undefined" ? clientesAdmin : [];
        if (!seletor || !clientes.length) return;
        const valorAtual = seletor.value;
        seletor.innerHTML = '<option value="">Selecione um cliente</option>' + clientes.map(cliente => `<option value="${esc(cliente.id)}">${esc(cliente.nome)}</option>`).join("");
        if (clientes.some(cliente => cliente.id === valorAtual)) seletor.value = valorAtual;
    }

    async function simularEmergencia() {
        const seletor = document.getElementById("clienteSimulacao");
        const mensagem = document.getElementById("mensagemSimulacao");
        const clienteId = seletor?.value;
        if (!clienteId) { mensagem.textContent = "Selecione um cliente antes de iniciar a simulação."; mensagem.dataset.tipo = "erro"; return; }
        if (!window.confirm("Registrar uma simulação de emergência usando a localização deste navegador?")) return;
        if (!navigator.geolocation) { mensagem.textContent = "Este navegador não disponibiliza localização."; mensagem.dataset.tipo = "erro"; return; }
        mensagem.textContent = "Obtendo localização atual...";
        mensagem.dataset.tipo = "info";
        navigator.geolocation.getCurrentPosition(async posicao => {
            const evento = { idoso_id: clienteId, latitude: posicao.coords.latitude, longitude: posicao.coords.longitude, occurred_at: new Date().toISOString(), event_type: "emergency", status: "Emergência", destinatarios: "Familiar 1 + Familiar 2 + Emergência", source: "simulation" };
            const { error } = await supabaseClient.from("acionamentos").insert(evento);
            if (error) { mensagem.textContent = `Não foi possível registrar a simulação: ${error.message}`; mensagem.dataset.tipo = "erro"; return; }
            mensagem.textContent = "Simulação registrada. O chamado já aparece no histórico administrativo.";
            mensagem.dataset.tipo = "sucesso";
            if (typeof carregarAdmin === "function") await carregarAdmin();
        }, () => { mensagem.textContent = "Não foi possível obter a localização deste navegador."; mensagem.dataset.tipo = "erro"; }, { enableHighAccuracy: true, timeout: 10000 });
    }

    // O script principal chama estas funções após carregar os dados reais.
    window.renderizarChamados = renderizarChamadosPolido;
    window.renderizarMensagens = renderizarMensagensPolido;
    window.mascaraCpfAdmin = function (cpf) { const n = String(cpf || "").replace(/\D/g, ""); return n.length === 11 ? `***.***.***-${n.slice(-2)}` : (cpf || "Não informado"); };

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("#formEdicao > button.botaoFormulario").forEach(botao => botao.remove());
        const botaoSalvarCadastro = document.querySelector("#formEdicao .acoesEdicaoAdmin .botaoFormulario");
        if (botaoSalvarCadastro) botaoSalvarCadastro.textContent = "Salvar altera\u00e7\u00f5es";
        const cancelarEdicao = document.getElementById("cancelarEdicaoAdmin");
        cancelarEdicao?.addEventListener("click", () => {
            document.getElementById("edicaoCliente").hidden = true;
            document.getElementById("formEdicao").reset();
        });
        document.getElementById("formEdicao")?.addEventListener("submit", () => window.setTimeout(() => {
            if (document.getElementById("mensagemEdicao")?.dataset.tipo === "sucesso") document.getElementById("edicaoCliente").hidden = true;
        }, 700), true);
        const cards = document.querySelectorAll(".gradeResumo .resumoCard");
        cards.forEach(card => card.setAttribute("tabindex", "0"));
        document.getElementById("cardMensagensPendentes")?.addEventListener("click", () => document.getElementById("listaMensagens")?.scrollIntoView({ behavior: "smooth", block: "center" }));
        document.getElementById("simularEmergencia")?.addEventListener("click", simularEmergencia);
        let tentativasClientes = 0;
        const carregarOpcoes = window.setInterval(() => { preencherClientesSimulacao(); if (++tentativasClientes >= 20) window.clearInterval(carregarOpcoes); }, 300);
        const tabelaClientes = document.getElementById("listaClientes");
        if (tabelaClientes) {
            const mascararDados = () => tabelaClientes.querySelectorAll("tr").forEach(linha => {
                const celulas = linha.querySelectorAll("td");
                if (celulas.length >= 3) {
                    const cpf = String(celulas[1].textContent || "").replace(/\D/g, "");
                    if (cpf.length === 11) {
                        const cpfFormatado = `***.***.***-${cpf.slice(-2)}`;
                        if (celulas[1].textContent.trim() !== cpfFormatado) celulas[1].textContent = cpfFormatado;
                    }
                    const telefone = String(celulas[2].textContent || "").replace(/\D/g, "");
                    if (telefone.length === 11) {
                        const telefoneFormatado = `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
                        if (celulas[2].textContent.trim() !== telefoneFormatado) celulas[2].textContent = telefoneFormatado;
                    }
                    if (telefone.length === 13 && telefone.startsWith("55")) {
                        const telefoneFormatado = `+55 ${telefone.slice(2, 4)} ${telefone.slice(4, 9)}-${telefone.slice(9)}`;
                        if (celulas[2].textContent.trim() !== telefoneFormatado) celulas[2].textContent = telefoneFormatado;
                    }
                }
            });
            new MutationObserver(mascararDados).observe(tabelaClientes, { childList: true, subtree: true });
            mascararDados();
        }
    });
})();

// Camada adicional: detalhes dos chamados e inventário de dispositivos.
(function () {
    const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    const calls = () => typeof chamadosAdmin !== "undefined" ? chamadosAdmin : [];
    const statusInfo = status => /emerg/i.test(String(status || "")) ? ["Emergência acionada", "statusEmergencia"] : ({ "Recebido": ["Aguardando atendimento", "statusAguardando"], "Em atendimento": ["Em atendimento", "statusAtendimento"], "Resolvido": ["Resolvido", "statusResolvido"] }[status] || [status || "Aguardando atendimento", "statusAguardando"]);

    function abrirDetalhes(id) {
        const chamado = calls().find(item => item.id === id);
        const modal = document.getElementById("modalDetalhesChamado");
        const alvo = document.getElementById("conteudoDetalhesChamado");
        const acoes = document.getElementById("acoesDetalhesChamado");
        const assumir = document.getElementById("assumirChamado");
        if (!chamado || !modal || !alvo) return;
        const [textoStatus, classeStatus] = statusInfo(chamado.status);
        const data = chamado.occurred_at || chamado.criado_em;
        const temLocal = chamado.latitude != null && chamado.longitude != null;
        const mapa = temLocal ? `https://www.google.com/maps?q=${encodeURIComponent(`${chamado.latitude},${chamado.longitude}`)}` : "";
        const cliente = typeof clientesAdmin !== "undefined" ? clientesAdmin.find(item => item.id === chamado.idoso_id) : null;
        const telefone = String(cliente?.telefone || "").replace(/\D/g, "");
        const telefoneFormatado = telefone.length === 11 ? `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}` : (cliente?.telefone || "Não informado");
        const cpf = String(cliente?.cpf || "").replace(/\D/g, "");
        const cpfProtegido = cpf.length === 11 ? `***.***.***-${cpf.slice(-2)}` : "Não informado";
        const itens = [
            ["Cliente", chamado.idosos?.nome || "Não identificado"],
            ["Contato do cliente", telefoneFormatado],
            ["CPF protegido", cpfProtegido],
            ["Data e hora", data ? new Date(data).toLocaleString("pt-BR") : "Não informada"],
            ["Tipo", chamado.event_type === "emergency" ? "Emergência" : "Solicitação de assistência"],
            ["Origem", chamado.source === "device" ? "Dispositivo físico" : chamado.source === "simulation" ? "Simulação administrativa" : "Painel do usuário"],
            ["Status", `<span class="statusPainel ${classeStatus}">${esc(textoStatus)}</span>`],
            ["Destinatários", chamado.destinatarios || "Não informado"],
            ["Dispositivo", chamado.device_id || "Não vinculado"],
            ["Localização", temLocal ? `<a class="botaoTabela" href="${mapa}" target="_blank" rel="noopener">Abrir no mapa</a><small>${esc(chamado.latitude)}, ${esc(chamado.longitude)}</small>` : "Não registrada"]
        ];
        const camposComHtmlControlado = new Set(["Status", "Localização"]);
        alvo.innerHTML = itens.map(([label, value]) => `<div class="detalheChamado"><span>${esc(label)}</span><strong>${camposComHtmlControlado.has(label) ? value : esc(value)}</strong></div>`).join("");
        if (acoes && assumir) {
            const podeAssumir = chamado.status !== "Resolvido" && chamado.status !== "Em atendimento";
            acoes.hidden = !podeAssumir;
            assumir.dataset.chamado = chamado.id;
        }
        modal.hidden = false;
    }

    function fecharDetalhes() { const modal = document.getElementById("modalDetalhesChamado"); if (modal) modal.hidden = true; }

    async function carregarDispositivos() {
        const alvo = document.getElementById("listaDispositivosAdmin");
        if (!alvo || typeof supabaseClient === "undefined") return;
        const { data, error } = await supabaseClient.from("dispositivos").select("id,device_id,idoso_id,ativo,criado_em,idosos(nome)").order("criado_em", { ascending: false });
        if (error) { alvo.innerHTML = '<tr><td colspan="4">Não foi possível carregar os dispositivos.</td></tr>'; return; }
        alvo.innerHTML = data?.length ? data.map(item => `<tr><td><strong>${esc(item.device_id)}</strong></td><td>${esc(item.idosos?.nome || "Sem vínculo")}</td><td><span class="statusPainel ${item.ativo ? "statusResolvido" : "statusFalha"}">${item.ativo ? "Ativo" : "Inativo"}</span></td><td>${new Date(item.criado_em).toLocaleDateString("pt-BR")}</td></tr>`).join("") : '<tr><td colspan="4">Nenhum dispositivo cadastrado.</td></tr>';
    }

    async function carregarAuditoria() {
        const alvo = document.getElementById("listaAuditoriaAdmin");
        if (!alvo || typeof supabaseClient === "undefined") return;
        const { data, error } = await supabaseClient.from("auditoria_admin").select("acao,entidade,detalhes,criado_em").order("criado_em", { ascending: false }).limit(20);
        if (error) { alvo.innerHTML = '<tr><td colspan="4">Histórico disponível após a migração operacional.</td></tr>'; return; }
        alvo.innerHTML = data?.length ? data.map(item => `<tr><td>${esc(item.acao)}</td><td>${esc(item.entidade)}</td><td>${esc(item.detalhes?.resumo || "Ação registrada")}</td><td>${new Date(item.criado_em).toLocaleString("pt-BR")}</td></tr>`).join("") : '<tr><td colspan="4">Nenhuma ação registrada ainda.</td></tr>';
    }

    async function registrarAuditoria(acao, entidade, resumo) {
        if (typeof supabaseClient === "undefined" || !supabaseClient.auth) return;
        const { data } = await supabaseClient.auth.getUser();
        const adminId = data?.user?.id;
        if (!adminId) return;
        await supabaseClient.from("auditoria_admin").insert({ admin_id: adminId, acao, entidade, detalhes: { resumo } });
        carregarAuditoria();
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("fecharDetalhesChamado")?.addEventListener("click", fecharDetalhes);
        document.getElementById("modalDetalhesChamado")?.addEventListener("click", event => { if (event.target.id === "modalDetalhesChamado") fecharDetalhes(); });
        document.addEventListener("keydown", event => { if (event.key === "Escape") fecharDetalhes(); });
        carregarDispositivos();
        carregarAuditoria();
        window.setTimeout(carregarDispositivos, 1800);
        window.setTimeout(carregarAuditoria, 1800);
        document.getElementById("simularEmergencia")?.addEventListener("click", () => registrarAuditoria("simulação", "acionamentos", "Simulação de emergência iniciada"));
        document.getElementById("salvarAlteracoesChamados")?.addEventListener("click", () => registrarAuditoria("atualização", "acionamentos", "Alterações de status salvas"));
        document.getElementById("formEdicao")?.addEventListener("submit", () => registrarAuditoria("atualização", "idosos", "Cadastro de cliente atualizado"));
        document.addEventListener("click", event => { if (event.target.closest(".responderMensagem")) registrarAuditoria("resposta", "mensagens", "Resposta enviada ao cliente"); });
        document.getElementById("assumirChamado")?.addEventListener("click", async event => {
            const botao = event.currentTarget;
            const chamadoId = botao.dataset.chamado;
            if (!chamadoId || !window.confirm("Assumir este chamado e mudar o status para Em atendimento?")) return;
            botao.disabled = true;
            const textoOriginal = botao.textContent;
            botao.textContent = "Assumindo...";
            const { error } = await supabaseClient.from("acionamentos").update({ status: "Em atendimento" }).eq("id", chamadoId);
            if (error) {
                window.alert(`Não foi possível assumir o chamado: ${error.message}`);
                botao.disabled = false;
                botao.textContent = textoOriginal;
                return;
            }
            await registrarAuditoria("atualização", "acionamentos", "Chamado assumido para atendimento");
            fecharDetalhes();
            if (typeof carregarAdmin === "function") await carregarAdmin();
        });
    });

    const renderAnterior = window.renderizarChamados;
    window.renderizarChamados = function (lista) {
        renderAnterior?.(lista);
        document.querySelectorAll("#listaChamadosAdmin .verDetalhesChamado").forEach(button => button.remove());
        const corpo = document.getElementById("listaChamadosAdmin");
        if (!corpo) return;
        [...corpo.querySelectorAll("tr")].forEach(row => {
            const select = row.querySelector(".statusSelect");
            const id = select?.dataset.chamado;
            if (!id) return;
            const cell = row.querySelector(".estadoAlteracao");
            if (!cell) return;
            const button = document.createElement("button");
            button.type = "button"; button.className = "botaoTabela verDetalhesChamado"; button.textContent = "Ver detalhes";
            button.addEventListener("click", () => abrirDetalhes(id));
            cell.prepend(button);
        });
    };
})();
