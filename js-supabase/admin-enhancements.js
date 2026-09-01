// Relatórios, filtros adicionais e organização da central administrativa.
(function () {
    let filtroMensagemAdmin = "todas";
    const esc = valor => String(valor ?? "").replace(/[&<>"']/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[caractere]));

    function aplicarFiltrosAprimorados() {
        const tipo = document.getElementById("filtroTipoChamado")?.value || "todos";
        const inicio = document.getElementById("filtroDataChamado")?.value || "";
        const busca = document.getElementById("buscaCliente")?.value.trim().toLowerCase() || "";
        const status = document.getElementById("filtroStatus")?.value || "todos";
        const clientes = typeof clientesAdmin !== "undefined" ? clientesAdmin : [];
        const chamados = typeof chamadosAdmin !== "undefined" ? chamadosAdmin : [];
        const ids = new Set(clientes.filter(cliente => !busca || cliente.nome.toLowerCase().includes(busca) || String(cliente.cpf || "").includes(busca)).map(cliente => cliente.id));
        const filtrados = chamados.filter(chamado => ids.has(chamado.idoso_id) && (status === "todos" || (status === "pendentes" && chamado.status !== "Resolvido") || chamado.status === status || (status === "Emergência" && /emerg/i.test(chamado.status || ""))) && (tipo === "todos" || chamado.event_type === tipo) && (!inicio || new Date(chamado.occurred_at || chamado.criado_em) >= new Date(`${inicio}T00:00:00`)));
        if (typeof window.renderizarChamados === "function") window.renderizarChamados(filtrados);
        document.querySelectorAll("#listaClientes tr").forEach(linha => { const texto = linha.textContent.toLowerCase(); linha.hidden = Boolean(busca && !texto.includes(busca)); });
        paginarClientes();
    }

    function aplicarFiltroMensagens() {
        document.querySelectorAll("#listaMensagens .mensagemCliente").forEach(item => {
            const pendente = item.classList.contains("mensagemPendente");
            item.hidden = filtroMensagemAdmin === "abertas" ? !pendente : filtroMensagemAdmin === "respondidas" ? pendente : false;
        });
    }

    let paginaClientes = 1;
    const tamanhoPaginaClientes = 10;
    function paginarClientes() {
        const corpo = document.getElementById("listaClientes");
        const navegacao = document.getElementById("paginacaoClientes");
        if (!corpo || !navegacao) return;
        const todas = [...corpo.querySelectorAll("tr")].filter(linha => linha.querySelectorAll("td").length > 1);
        todas.forEach(linha => { if (linha.dataset.paginacaoOculta === "true") { linha.hidden = false; delete linha.dataset.paginacaoOculta; } });
        const linhas = todas.filter(linha => !linha.hidden);
        const paginas = Math.max(1, Math.ceil(linhas.length / tamanhoPaginaClientes));
        paginaClientes = Math.min(paginaClientes, paginas);
        linhas.forEach((linha, indice) => { const foraDaPagina = indice < (paginaClientes - 1) * tamanhoPaginaClientes || indice >= paginaClientes * tamanhoPaginaClientes; linha.hidden = foraDaPagina; if (foraDaPagina) linha.dataset.paginacaoOculta = "true"; });
        navegacao.innerHTML = linhas.length > tamanhoPaginaClientes ? `<button class="botaoSecundario" type="button" ${paginaClientes === 1 ? "disabled" : ""} data-pagina="anterior">Anterior</button><span>Página ${paginaClientes} de ${paginas}</span><button class="botaoSecundario" type="button" ${paginaClientes === paginas ? "disabled" : ""} data-pagina="proxima">Próxima</button>` : "";
        navegacao.querySelectorAll("button[data-pagina]").forEach(botao => botao.addEventListener("click", () => { paginaClientes += botao.dataset.pagina === "proxima" ? 1 : -1; paginarClientes(); }));
    }

    async function carregarRelatorio() {
        const { data, error } = await supabaseClient.from("acionamentos").select("id,status,event_type,criado_em").order("criado_em", { ascending: false });
        if (error) { const alvo = document.getElementById("mensagemRelatorioAdmin"); if (alvo) { alvo.textContent = "Não foi possível carregar o relatório."; alvo.dataset.tipo = "erro"; } return []; }
        const chamados = data || [];
        const set = (id, valor) => { const alvo = document.getElementById(id); if (alvo) alvo.textContent = valor; };
        set("relatorioTotalChamados", chamados.length);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        set("relatorioChamadosHoje", chamados.filter(item => new Date(item.occurred_at || item.criado_em) >= hoje).length);
        set("relatorioResolvidos", chamados.filter(item => item.status === "Resolvido").length);
        set("relatorioAndamento", chamados.filter(item => item.status !== "Resolvido").length);
        set("relatorioEmergencias", chamados.filter(item => item.event_type === "emergency" || /emerg/i.test(item.status || "")).length);
        const { data: mensagens } = await supabaseClient.from("mensagens").select("criado_em,respondido_em").not("respondido_em", "is", null).limit(500);
        const tempos = (mensagens || []).map(item => new Date(item.respondido_em) - new Date(item.criado_em)).filter(valor => valor >= 0);
        const mediaMinutos = tempos.length ? Math.round(tempos.reduce((soma, valor) => soma + valor, 0) / tempos.length / 60000) : null;
        set("relatorioTempoResposta", mediaMinutos == null ? "—" : mediaMinutos >= 60 ? `${Math.floor(mediaMinutos / 60)}h ${mediaMinutos % 60}min` : `${mediaMinutos} min`);
        return chamados;
    }

    async function exportarChamadosCsv() {
        const alvo = document.getElementById("mensagemRelatorioAdmin");
        if (alvo) { alvo.textContent = "Preparando arquivo..."; alvo.dataset.tipo = "info"; }
        const { data, error } = await supabaseClient.from("acionamentos").select("id,status,event_type,source,device_id,latitude,longitude,destinatarios,criado_em,occurred_at,idosos(nome)").order("criado_em", { ascending: false });
        if (error) { if (alvo) { alvo.textContent = error.message; alvo.dataset.tipo = "erro"; } return; }
        const cabecalho = ["Cliente", "Data", "Tipo", "Status", "Origem", "Dispositivo", "Destinatários", "Latitude", "Longitude"];
        const linhas = (data || []).map(item => [item.idosos?.nome || "", item.occurred_at || item.criado_em, item.event_type || "assistance", item.status || "", item.source || "", item.device_id || "", item.destinatarios || "", item.latitude ?? "", item.longitude ?? ""]);
        const csv = [cabecalho, ...linhas].map(linha => linha.map(celula => `"${String(celula).replaceAll('"', '""')}"`).join(";")).join("\n");
        const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `relatorio-chamados-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
        if (alvo) { alvo.textContent = "Relatório exportado com sucesso."; alvo.dataset.tipo = "sucesso"; }
    }

    function classeNotificacao(status) {
        return status === "enviado" ? "statusResolvido" : status === "falhou" ? "statusFalha" : "statusAguardando";
    }

    async function carregarNotificacoes() {
        const lista = document.getElementById("listaNotificacoesAdmin");
        const resumo = document.getElementById("resumoNotificacoes");
        if (!lista) return;
        const { data, error } = await supabaseClient.from("fila_notificacoes").select("id,canal,destino,status,tentativas,erro,criado_em").order("criado_em", { ascending: false }).limit(30);
        if (error) { lista.innerHTML = '<tr><td colspan="5">A fila ficará disponível após executar a migração operacional.</td></tr>'; if (resumo) resumo.innerHTML = ""; return; }
        if (resumo) {
            const totais = (data || []).reduce((resultado, item) => { resultado[item.status] = (resultado[item.status] || 0) + 1; return resultado; }, {});
            resumo.innerHTML = `<span>${totais.pendente || 0} pendente(s)</span><span>${totais.enviado || 0} enviada(s)</span><span class="falhas">${totais.falhou || 0} falha(s)</span>`;
        }
        lista.innerHTML = data?.length ? data.map(item => `<tr><td>${esc(item.canal.toUpperCase())}</td><td>${esc(item.destino)}</td><td><span class="statusPainel ${classeNotificacao(item.status)}">${esc(item.status)}</span></td><td>${esc(item.erro || `${item.tentativas} tentativa(s)`)}</td><td>${item.status === "falhou" ? `<button class="botaoTabela reenviarNotificacao" data-id="${item.id}" type="button">Tentar novamente</button>` : "—"}</td></tr>`).join("") : '<tr><td colspan="5">Nenhuma notificação registrada.</td></tr>';
        lista.querySelectorAll(".reenviarNotificacao").forEach(botao => botao.addEventListener("click", async () => {
            if (!window.confirm("Colocar esta notificação novamente na fila de envio?")) return;
            const { error: erro } = await supabaseClient.from("fila_notificacoes").update({ status: "pendente", tentativas: 0, erro: null }).eq("id", botao.dataset.id);
            if (erro) window.alert(erro.message);
            else {
                const { data: sessao } = await supabaseClient.auth.getUser();
                if (sessao?.user?.id) await supabaseClient.from("auditoria_admin").insert({ admin_id: sessao.user.id, acao: "reenvio", entidade: "fila_notificacoes", detalhes: { resumo: "Notificação colocada novamente na fila" } });
                carregarNotificacoes();
            }
        }));
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("filtroTipoChamado")?.addEventListener("change", aplicarFiltrosAprimorados);
        document.getElementById("filtroDataChamado")?.addEventListener("change", aplicarFiltrosAprimorados);
        document.getElementById("buscaCliente")?.addEventListener("input", () => window.setTimeout(aplicarFiltrosAprimorados, 0));
        document.getElementById("filtroStatus")?.addEventListener("change", () => window.setTimeout(aplicarFiltrosAprimorados, 0));
        document.querySelectorAll(".filtroStatusChamado").forEach(botao => botao.addEventListener("click", () => {
            const seletor = document.getElementById("filtroStatus");
            if (!seletor) return;
            seletor.value = botao.dataset.status;
            document.querySelectorAll(".filtroStatusChamado").forEach(item => item.classList.toggle("ativo", item === botao));
            const titulo = document.getElementById("tituloListaChamadosAdmin");
            const descricao = document.getElementById("descricaoListaChamadosAdmin");
            const textos = {
                pendentes: ["Chamados pendentes", "Acompanhe as solicitações que ainda precisam de atendimento."],
                Resolvido: ["Chamados resolvidos", "Consulte os atendimentos concluídos nas últimas 24 horas."],
                todos: ["Todos os chamados", "Consulte os chamados operacionais disponíveis no painel."]
            };
            if (titulo) titulo.textContent = textos[botao.dataset.status][0];
            if (descricao) descricao.textContent = textos[botao.dataset.status][1];
            aplicarFiltrosAprimorados();
        }));
        document.getElementById("exportarChamadosCsv")?.addEventListener("click", exportarChamadosCsv);
        document.querySelectorAll(".filtroMensagemAdmin").forEach(botao => botao.addEventListener("click", () => { filtroMensagemAdmin = botao.dataset.filtroMensagemAdmin; document.querySelectorAll(".filtroMensagemAdmin").forEach(item => item.classList.toggle("ativo", item === botao)); aplicarFiltroMensagens(); }));
        new MutationObserver(aplicarFiltroMensagens).observe(document.getElementById("listaMensagens"), { childList: true, subtree: true });
        const tabelaClientes = document.getElementById("listaClientes");
        if (tabelaClientes) new MutationObserver(() => { paginaClientes = 1; paginarClientes(); }).observe(tabelaClientes, { childList: true });
        let tentativas = 0;
        const aguardarAdmin = window.setInterval(() => {
            if (typeof clientesAdmin !== "undefined" && clientesAdmin.length) { carregarRelatorio(); carregarNotificacoes(); paginarClientes(); window.clearInterval(aguardarAdmin); }
            else if (++tentativas > 30) { carregarRelatorio(); carregarNotificacoes(); window.clearInterval(aguardarAdmin); }
        }, 300);
        window.setInterval(carregarNotificacoes, 30000);
    });
})();
