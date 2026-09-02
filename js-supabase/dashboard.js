// =====================================================
// ESTADO DA ÁREA DO USUÁRIO
// =====================================================
let usuarioAtual;
let idosoAtual;
let chamadosDoUsuario = [];
let filtroHistoricoAtual = "andamento";
const escaparHtmlPainel = window.protegeEscaparHtml || (valor => String(valor ?? ""));

document.addEventListener("DOMContentLoaded", inicializarPainel);

async function inicializarPainel() {
    const { data } = await supabaseClient.auth.getUser();
    usuarioAtual = data.user;
    if (!usuarioAtual) { window.location.href = "login.html"; return; }

    document.getElementById("usuarioLogado").textContent = usuarioAtual.email;
    const { data: perfil } = await supabaseClient.from("perfis").select("tipo").eq("usuario_id", usuarioAtual.id).single();
    if (perfil?.tipo === "admin") document.getElementById("linkAdmin").hidden = false;
    const { data: idoso } = await supabaseClient.from("idosos").select("*").eq("usuario_id", usuarioAtual.id).single();
    idosoAtual = idoso;
    if (idoso) document.getElementById("nomeUsuario").textContent = idoso.nome.split(" ")[0];
    await carregarPainel();
    document.getElementById("botaoSair").addEventListener("click", sair);
    document.getElementById("formMensagem").addEventListener("submit", enviarMensagem);
    document.getElementById("botaoAssistenciaPainel").addEventListener("click", solicitarAssistencia);
    document.getElementById("formMeuCadastro").addEventListener("submit", salvarMeuCadastro);
    document.getElementById("editarMeuCadastroBotao").addEventListener("click", abrirEdicaoCadastro);
    document.getElementById("cancelarEdicaoCadastro").addEventListener("click", fecharEdicaoCadastro);
    await carregarMeuCadastro();
    await carregarMensagensUsuario();
    window.setInterval(() => { if (usuarioAtual) { carregarPainel(); carregarMensagensUsuario(); } }, 15000);
}

async function carregarMensagensUsuario() {
    // A camada aprimorada controla filtros e respostas não lidas quando está disponível.
    if (typeof window.carregarMensagensAprimoradas === "function") return window.carregarMensagensAprimoradas();
    if (!usuarioAtual) return;
    const lista = document.getElementById("listaMinhasMensagens");
    if (!lista) return;
    const { data: mensagens, error } = await supabaseClient.from("mensagens").select("assunto,tipo,mensagem,resposta,status,criado_em,respondido_em").eq("usuario_id", usuarioAtual.id).order("criado_em", { ascending: false }).limit(20);
    if (error) { lista.innerHTML = `<p class="estadoMensagens mensagemErro">Não foi possível carregar suas mensagens agora. Tente novamente em instantes.</p>`; return; }
    if (!mensagens?.length) { lista.innerHTML = '<p class="estadoMensagens">Você ainda não enviou nenhuma mensagem ao suporte.</p>'; return; }
    lista.innerHTML = mensagens.map(item => {
        const respondida = Boolean(item.resposta);
        return `<article class="mensagemUsuario ${respondida ? "mensagemRespondida" : "mensagemPendente"}"><div class="cabecalhoMensagem"><div><strong>${escaparHtmlPainel(item.assunto)}</strong><small>${escaparHtmlPainel(item.tipo)} · ${new Date(item.criado_em).toLocaleString("pt-BR")}</small></div><span class="statusPainel ${respondida ? "statusResolvido" : "statusAguardando"}">${respondida ? "Respondida" : "Aguardando resposta"}</span></div><p class="textoMensagemUsuario">${escaparHtmlPainel(item.mensagem)}</p>${respondida ? `<div class="respostaCliente"><strong>Resposta da equipe:</strong><p>${escaparHtmlPainel(item.resposta)}</p><small>Respondida em ${new Date(item.respondido_em || item.criado_em).toLocaleString("pt-BR")}</small></div>` : "<small class=\"aguardandoMensagem\">A equipe responderá por este painel.</small>"}</article>`;
    }).join("");
}

async function carregarMeuCadastro() {
    if (!idosoAtual) return;
    const [{ data: endereco }, { data: familiares = [] }] = await Promise.all([
        supabaseClient.from("enderecos").select("*").eq("idoso_id", idosoAtual.id).maybeSingle(),
        supabaseClient.from("familiares").select("*").eq("idoso_id", idosoAtual.id).order("prioridade")
    ]);
    const f1 = familiares.find(f => f.prioridade === 1) || {}, f2 = familiares.find(f => f.prioridade === 2) || {};
    const dados = { ...idosoAtual, ...(endereco || {}) };
    const campos = { meuNome: dados.nome, meuTelefone: dados.telefone, meuRg: dados.rg, meuCep: dados.cep, meuNumero: dados.numero, meuLogradouro: dados.logradouro, meuBairro: dados.bairro, meuCidade: dados.cidade, meuEstado: dados.estado, meuComplemento: dados.complemento, meuFamiliar1Nome: f1.nome, meuFamiliar1Parentesco: f1.parentesco, meuFamiliar1Telefone: f1.telefone, meuFamiliar1Email: f1.email, meuFamiliar2Nome: f2.nome, meuFamiliar2Parentesco: f2.parentesco, meuFamiliar2Telefone: f2.telefone, meuFamiliar2Email: f2.email };
    Object.entries(campos).forEach(([id, valor]) => { document.getElementById(id).value = valor || ""; });
    atualizarResumoCadastro(dados);
}

async function salvarMeuCadastro(evento) {
    evento.preventDefault();
    if (!window.confirm("Salvar as alterações do seu cadastro?")) return;
    const { error: erroIdoso } = await supabaseClient.from("idosos").update({ nome: valorCampo("meuNome"), telefone: valorCampo("meuTelefone"), rg: valorCampo("meuRg") }).eq("id", idosoAtual.id);
    if (erroIdoso) { mostrarMensagem("mensagemMeuCadastro", erroIdoso.message, "erro"); return; }
    const endereco = { cep: valorCampo("meuCep"), numero: valorCampo("meuNumero"), logradouro: valorCampo("meuLogradouro"), bairro: valorCampo("meuBairro"), cidade: valorCampo("meuCidade"), estado: valorCampo("meuEstado").toUpperCase(), complemento: valorCampo("meuComplemento") };
    const { data: enderecoExistente } = await supabaseClient.from("enderecos").select("id").eq("idoso_id", idosoAtual.id).maybeSingle();
    const resultadoEndereco = enderecoExistente ? await supabaseClient.from("enderecos").update(endereco).eq("id", enderecoExistente.id) : await supabaseClient.from("enderecos").insert({ ...endereco, idoso_id: idosoAtual.id });
    if (resultadoEndereco.error) { mostrarMensagem("mensagemMeuCadastro", resultadoEndereco.error.message, "erro"); return; }
    for (const contato of [{ prioridade: 1, prefixo: "meuFamiliar1" }, { prioridade: 2, prefixo: "meuFamiliar2" }]) { const dados = { nome: valorCampo(`${contato.prefixo}Nome`), parentesco: valorCampo(`${contato.prefixo}Parentesco`), telefone: valorCampo(`${contato.prefixo}Telefone`), email: valorCampo(`${contato.prefixo}Email`) || null }; const { data: existente } = await supabaseClient.from("familiares").select("id").eq("idoso_id", idosoAtual.id).eq("prioridade", contato.prioridade).maybeSingle(); if (existente) await supabaseClient.from("familiares").update(dados).eq("id", existente.id); else await supabaseClient.from("familiares").insert({ ...dados, idoso_id: idosoAtual.id, prioridade: contato.prioridade }); }
    mostrarMensagem("mensagemMeuCadastro", "Cadastro atualizado com sucesso.", "sucesso");
    idosoAtual.nome = valorCampo("meuNome"); document.getElementById("nomeUsuario").textContent = idosoAtual.nome.split(" ")[0];
    atualizarResumoCadastro({ nome: idosoAtual.nome, telefone: valorCampo("meuTelefone"), rg: valorCampo("meuRg") });
    fecharEdicaoCadastro();
}

// =====================================================
// CHAMADOS, LOCALIZAÇÃO E SUPORTE
// =====================================================
function valorCampo(id) { return document.getElementById(id).value.trim(); }

async function carregarPainelAntigo() {
    if (!idosoAtual) return;
    const { data: chamados = [] } = await supabaseClient.from("acionamentos").select("*").eq("idoso_id", idosoAtual.id).order("criado_em", { ascending: false });
    const { count: familiares } = await supabaseClient.from("familiares").select("id", { count: "exact", head: true }).eq("idoso_id", idosoAtual.id);
    document.getElementById("totalChamados").textContent = chamados.length;
    document.getElementById("totalFamiliares").textContent = familiares || 0;
    document.getElementById("ultimoChamado").textContent = chamados[0] ? new Date(chamados[0].criado_em).toLocaleDateString("pt-BR") : "Nenhum";
    const lista = document.getElementById("listaChamados");
    lista.innerHTML = chamados.length ? chamados.map(chamado => `<tr><td>${new Date(chamado.criado_em).toLocaleString("pt-BR")}</td><td>${chamado.latitude ? `<a href="https://www.google.com/maps?q=${Number(chamado.latitude)},${Number(chamado.longitude)}" target="_blank" rel="noopener noreferrer">Ver localização</a>` : "Não registrada"}</td><td>${escaparHtmlPainel(chamado.destinatarios || "Familiares")}</td><td><span class="statusPainel">${escaparHtmlPainel(chamado.status || "Recebido")}</span></td></tr>`).join("") : '<tr><td colspan="4">Nenhum chamado realizado ainda.</td></tr>';
}

async function solicitarAssistencia() {
    if (!navigator.geolocation || !idosoAtual) return;
    const botao = document.getElementById("botaoAssistenciaPainel"); botao.disabled = true; botao.textContent = "Registrando...";
    const { count: chamadosAnteriores, error: erroHistorico } = await supabaseClient.from("acionamentos").select("id", { count: "exact", head: true }).eq("idoso_id", idosoAtual.id);
    if (erroHistorico) { mostrarMensagem("mensagemSuporte", erroHistorico.message, "erro"); botao.disabled = false; botao.textContent = "Solicitar assistência"; return; }
    const nivel = Math.min((chamadosAnteriores || 0) + 1, 3);
    const escalonamento = nivel === 1 ? { destinatarios: "Familiar 1", status: "Recebido", event_type: "assistance" } : nivel === 2 ? { destinatarios: "Familiar 1 + Familiar 2", status: "Recebido", event_type: "assistance" } : { destinatarios: "Familiar 1 + Familiar 2 + Emergência", status: "Emergência", event_type: "emergency" };
    navigator.geolocation.getCurrentPosition(async posicao => {
        const evento = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude, ...escalonamento, source: "site", occurred_at: new Date().toISOString() };
        let error = null;
        try {
            const { data: sessao } = await supabaseClient.auth.getSession();
            const respostaApi = await fetch(`${protegeApiUrl}/api/v1/user/events`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sessao.session.access_token}` }, body: JSON.stringify(evento) });
            if (!respostaApi.ok) { const detalhe = await respostaApi.json(); error = new Error(detalhe.error || "Falha no servidor"); }
        } catch (erroApi) {
            const resultadoLocal = await supabaseClient.from("acionamentos").insert({ idoso_id: idosoAtual.id, ...evento });
            error = resultadoLocal.error;
        }
        mostrarMensagem("mensagemSuporte", error ? error.message : "Assistência registrada e localização enviada.", error ? "erro" : "sucesso");
        await carregarPainel(); botao.disabled = false; botao.textContent = "Solicitar assistência";
    }, () => { mostrarMensagem("mensagemSuporte", "Não foi possível obter sua localização.", "erro"); botao.disabled = false; botao.textContent = "Solicitar assistência"; });
}

async function enviarMensagem(evento) {
    evento.preventDefault();
    const assunto = document.getElementById("assuntoMensagem").value.trim();
    const tipo = document.getElementById("tipoMensagem").value.trim();
    const mensagem = document.getElementById("textoMensagem").value.trim();
    if (!assunto || !mensagem) { mostrarMensagem("mensagemSuporte", "Preencha o assunto e a mensagem.", "erro"); return; }
    const { error } = await supabaseClient.from("mensagens").insert({ usuario_id: usuarioAtual.id, assunto, tipo, mensagem, status: "aberta" });
    mostrarMensagem("mensagemSuporte", error ? "Não foi possível enviar a mensagem. Tente novamente." : "Mensagem enviada ao suporte.", error ? "erro" : "sucesso");
    if (!error) evento.target.reset();
}

async function sair() { await supabaseClient.auth.signOut(); window.location.href = "login.html"; }
function mostrarMensagem(id, texto, tipo) { const elemento = document.getElementById(id); elemento.textContent = texto; elemento.setAttribute("data-tipo", tipo); }

function abrirEdicaoCadastro() {
    document.getElementById("resumoMeuCadastro").hidden = true;
    document.getElementById("formMeuCadastro").hidden = false;
    document.getElementById("editarMeuCadastroBotao").setAttribute("aria-expanded", "true");
}

function fecharEdicaoCadastro() {
    document.getElementById("formMeuCadastro").hidden = true;
    document.getElementById("resumoMeuCadastro").hidden = false;
    document.getElementById("editarMeuCadastroBotao").setAttribute("aria-expanded", "false");
}

function atualizarResumoCadastro(dados) {
    document.getElementById("resumoNome").textContent = dados.nome || "Não informado";
    document.getElementById("resumoTelefone").textContent = dados.telefone || "Não informado";
    document.getElementById("resumoRg").textContent = mascararRg(dados.rg);
}

function mascararRg(rg) {
    const numeros = String(rg || "").replace(/\D/g, "");
    if (!numeros) return "Não informado";
    const preenchido = numeros.padStart(9, "0").slice(-9);
    return `••.${preenchido.slice(2, 5)}.•••-•`;
}

// =====================================================
// MELHORIAS DE CLAREZA DO PAINEL
// =====================================================
document.addEventListener("DOMContentLoaded", configurarMelhoriasPainel);

function configurarMelhoriasPainel() {
    document.querySelectorAll(".filtroHistorico").forEach(botao => botao.addEventListener("click", () => {
        filtroHistoricoAtual = botao.dataset.filtro;
        document.querySelectorAll(".filtroHistorico").forEach(item => item.classList.toggle("ativo", item === botao));
        const titulo = document.getElementById("tituloHistoricoChamados");
        const descricao = document.getElementById("descricaoHistoricoChamados");
        if (titulo) titulo.textContent = filtroHistoricoAtual === "resolvidos" ? "Chamados resolvidos" : "Chamados em andamento";
        if (descricao) descricao.textContent = filtroHistoricoAtual === "resolvidos" ? "Consulte os atendimentos que já foram concluídos." : "Acompanhe as solicitações que ainda precisam de atenção. Os chamados concluídos ficam em uma lista separada.";
        renderizarHistorico();
    }));
    document.getElementById("marcarChamadoResolvido")?.addEventListener("click", marcarChamadoResolvido);
}

// Esta versão mantém a consulta original e acrescenta os indicadores do painel.
async function carregarPainel() {
    if (!idosoAtual) return;
    const [respostaChamados, respostaFamiliares] = await Promise.all([
        supabaseClient.from("acionamentos").select("*").eq("idoso_id", idosoAtual.id).order("criado_em", { ascending: false }),
        supabaseClient.from("familiares").select("id", { count: "exact", head: true }).eq("idoso_id", idosoAtual.id)
    ]);
    if (respostaChamados.error || respostaFamiliares.error) {
        const lista = document.getElementById("listaChamados");
        if (lista) lista.innerHTML = '<tr><td colspan="4">Não foi possível carregar os chamados agora. Tente novamente em instantes.</td></tr>';
        return;
    }
    const chamados = respostaChamados.data || [];
    const familiares = respostaFamiliares.count;
    chamadosDoUsuario = chamados;
    document.getElementById("totalChamados").textContent = chamados.length;
    document.getElementById("totalFamiliares").textContent = familiares || 0;
    document.getElementById("ultimoChamado").textContent = chamados[0] ? new Date(chamados[0].criado_em).toLocaleDateString("pt-BR") : "Nenhum";
    renderizarHistorico();
    renderizarLocalizacaoAtual();
    renderizarChamadoAtivo();
}

function renderizarLocalizacaoAtual() {
    const chamadoComLocalizacao = chamadosDoUsuario.find(chamado => chamado.latitude != null && chamado.longitude != null);
    const status = document.getElementById("statusLocalizacaoAtual");
    const texto = document.getElementById("localizacaoAtualTexto");
    const horario = document.getElementById("localizacaoAtualHorario");
    const link = document.getElementById("localizacaoAtualLink");
    if (!status || !texto || !horario || !link) return;
    if (!chamadoComLocalizacao) {
        status.textContent = "Aguardando localização";
        status.className = "statusPainel statusAtencao";
        texto.textContent = "Nenhuma localização recebida";
        horario.textContent = "A posição aparecerá aqui quando o dispositivo enviar dados.";
        link.hidden = true;
        return;
    }
    const latitude = Number(chamadoComLocalizacao.latitude).toFixed(5);
    const longitude = Number(chamadoComLocalizacao.longitude).toFixed(5);
    status.textContent = "Localização recebida";
    status.className = "statusPainel statusResolvido";
    texto.textContent = `Latitude ${latitude} | Longitude ${longitude}`;
    horario.textContent = `Última atualização: ${new Date(chamadoComLocalizacao.criado_em).toLocaleString("pt-BR")}.`;
    link.href = `https://www.google.com/maps?q=${chamadoComLocalizacao.latitude},${chamadoComLocalizacao.longitude}`;
    link.hidden = false;
}

function renderizarHistorico() {
    const lista = document.getElementById("listaChamados");
    const filtrados = chamadosDoUsuario.filter(chamado => {
        if (filtroHistoricoAtual === "andamento") return chamado.status !== "Resolvido";
        if (filtroHistoricoAtual === "resolvidos") return chamado.status === "Resolvido";
        return true;
    });
    lista.innerHTML = filtrados.length ? filtrados.map(chamado => {
        const status = statusHumano(chamado.status);
        const contatos = contarContatos(chamado.destinatarios);
        const localizacao = chamado.latitude && chamado.longitude ? `<a href="https://www.google.com/maps?q=${Number(chamado.latitude)},${Number(chamado.longitude)}" target="_blank" rel="noopener noreferrer">Ver localização</a>` : "Não registrada";
        return `<tr><td>${new Date(chamado.criado_em).toLocaleString("pt-BR")}</td><td>${localizacao}</td><td title="${escaparHtmlPainel(chamado.destinatarios || "Nenhum contato informado")}">${contatos} ${contatos === 1 ? "contato avisado" : "contatos avisados"}</td><td><span class="statusPainel ${status.classe}">${escaparHtmlPainel(status.texto)}</span></td></tr>`;
    }).join("") : `<tr><td colspan="4">${filtroHistoricoAtual === "resolvidos" ? "Nenhum chamado resolvido registrado ainda." : "Nenhum chamado em andamento no momento."}</td></tr>`;
}

function renderizarChamadoAtivo() {
    const card = document.getElementById("chamadoAtivo");
    const chamado = chamadosDoUsuario.find(item => item.status !== "Resolvido");
    if (!chamado) { card.hidden = true; return; }
    card.hidden = false;
    document.getElementById("chamadoAtivoStatus").textContent = statusHumano(chamado.status).texto;
    document.getElementById("chamadoAtivoHorario").textContent = `Solicitação realizada em ${new Date(chamado.criado_em).toLocaleString("pt-BR")}.`;
    document.getElementById("chamadoAtivoDestinatarios").textContent = `${contarContatos(chamado.destinatarios)} ${contarContatos(chamado.destinatarios) === 1 ? "contato foi avisado" : "contatos foram avisados"}.`;
    const link = document.getElementById("chamadoAtivoLocal");
    if (chamado.latitude && chamado.longitude) { link.href = `https://www.google.com/maps?q=${chamado.latitude},${chamado.longitude}`; link.hidden = false; } else link.hidden = true;
    const linhaTempo = document.getElementById("linhaTempoChamado");
    if (linhaTempo) {
        const emAtendimento = chamado.status === "Em atendimento";
        const emergencia = /emerg/i.test(String(chamado.status || "")) || chamado.event_type === "emergency";
        const etapas = [
            ["Solicitação enviada", true],
            [emergencia ? "Emergência priorizada" : "Aguardando atendimento", emAtendimento],
            ["Atendimento concluído", false]
        ];
        linhaTempo.innerHTML = etapas.map(([texto, concluida], indice) => {
            const atual = !concluida && (indice === 1 || (indice === 2 && emAtendimento));
            return `<span class="etapaChamado ${concluida ? "concluida" : atual ? "atual" : ""}">${texto}</span>`;
        }).join("");
    }
    document.getElementById("marcarChamadoResolvido").dataset.chamado = chamado.id;
}

async function marcarChamadoResolvido() {
    const botao = document.getElementById("marcarChamadoResolvido");
    if (!botao.dataset.chamado) return;
    botao.disabled = true;
    const { error } = await supabaseClient.from("acionamentos").update({ status: "Resolvido" }).eq("id", botao.dataset.chamado);
    if (error) { mostrarMensagem("mensagemSuporte", "Não foi possível concluir o chamado. Tente novamente.", "erro"); botao.disabled = false; return; }
    await carregarPainel();
}

function contarContatos(destinatarios) {
    if (!destinatarios) return 0;
    return destinatarios.split("+").map(contato => contato.trim()).filter(contato => contato && !/emerg[eê]ncia/i.test(contato)).length;
}

function statusHumano(status) {
    if (/emerg/i.test(String(status || ""))) return { texto: "Emergência acionada", classe: "statusEmergencia" };
    const mapa = {
        "Recebido": { texto: "Aguardando atendimento", classe: "statusAguardando" },
        "Em atendimento": { texto: "Em atendimento", classe: "statusAtendimento" },
        "Resolvido": { texto: "Resolvido", classe: "statusResolvido" },
        "Emergência": { texto: "Emergência acionada", classe: "statusEmergencia" },
        "Falha no envio": { texto: "Falha no envio", classe: "statusFalha" }
    };
    return mapa[status] || { texto: status || "Aguardando atendimento", classe: "statusAguardando" };
}

// Textos claros para os estados atuais, sem simular dados do dispositivo.
document.addEventListener("DOMContentLoaded", configurarStatusDispositivo);

function configurarStatusDispositivo() {
    const card = document.querySelector(".cardDispositivo");
    if (!card) return;

    const selo = card.querySelector(".cabecalhoCard > .statusPainel");
    if (selo) {
        selo.textContent = "Monitoramento do dispositivo";
        selo.setAttribute("aria-label", "Área de monitoramento do dispositivo");
    }

    const indicadores = card.querySelectorAll(".indicadorDispositivo");
    const estados = [
        { texto: "Aguardando comunicação", classe: "statusAguardando", descricao: "A comunicação do dispositivo aparecerá aqui." },
        { texto: "Aguardando sinal GPS", classe: "statusAguardando", descricao: "A posição será exibida quando o dispositivo enviar dados." },
        { texto: "Informação indisponível", classe: "statusIndisponivel", descricao: "O nível da bateria será informado pelo dispositivo." }
    ];
    indicadores.forEach((indicador, indice) => {
        const estado = estados[indice];
        if (!estado) return;
        const valor = indicador.querySelector("span");
        const descricao = indicador.querySelector("small");
        if (valor) {
            valor.textContent = estado.texto;
            valor.className = `estadoDispositivo ${estado.classe}`;
            valor.setAttribute("aria-label", `Estado: ${estado.texto}`);
        }
        if (descricao) descricao.textContent = estado.descricao;
    });

    if (!card.querySelector(".legendaStatus")) {
        const legenda = document.createElement("div");
        legenda.className = "legendaStatus";
        legenda.setAttribute("aria-label", "Como interpretar os status");
        legenda.innerHTML = `<strong>Como interpretar os status</strong><span><i class="marcadorStatus normal" aria-hidden="true"></i>Funcionando normalmente</span><span><i class="marcadorStatus aguardando" aria-hidden="true"></i>Aguardando informação</span><span><i class="marcadorStatus atencao" aria-hidden="true"></i>Atenção ou emergência</span><span><i class="marcadorStatus indisponivel" aria-hidden="true"></i>Informação indisponível</span>`;
        card.appendChild(legenda);
    }
}
