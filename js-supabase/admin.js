// =====================================================
// ESTADO E CONTROLE DE ALTERAÇÕES PENDENTES
// =====================================================
let clientesAdmin = [], chamadosAdmin = [];
const alteracoesChamados = new Map();
let avisarSaidaComAlteracoes = true;
const PRAZO_EXIBICAO_RESOLVIDO_MS = 24 * 60 * 60 * 1000;

function deveExibirChamadoOperacional(chamado) {
    if (chamado.status !== "Resolvido") return true;
    const resolvidoEm = chamado.resolvido_em || chamado.encerrado_automaticamente_em || chamado.criado_em;
    return Date.now() - new Date(resolvidoEm).getTime() < PRAZO_EXIBICAO_RESOLVIDO_MS;
}
document.addEventListener("DOMContentLoaded", inicializarAdmin);

async function inicializarAdmin() {
    const { data } = await supabaseClient.auth.getUser();
    if (!data.user) { window.location.href = "login.html"; return; }
    const { data: perfil } = await supabaseClient.from("perfis").select("tipo").eq("usuario_id", data.user.id).single();
    if (!perfil || perfil.tipo !== "admin") { alert("Acesso restrito à administração."); window.location.href = "dashboard.html"; return; }
    document.getElementById("botaoSair").addEventListener("click", async evento => { if (!confirmarSaida()) { evento.preventDefault(); return; } avisarSaidaComAlteracoes = false; await supabaseClient.auth.signOut(); window.location.href = "login.html"; });
    document.getElementById("formEdicao").addEventListener("submit", salvarCliente);
    document.getElementById("buscaCliente").addEventListener("input", aplicarFiltros);
    document.getElementById("filtroStatus").addEventListener("change", aplicarFiltros);
    document.getElementById("salvarAlteracoesChamados").addEventListener("click", salvarTodosStatus);
    window.addEventListener("beforeunload", evento => { if (!avisarSaidaComAlteracoes || !alteracoesChamados.size) return; evento.preventDefault(); evento.returnValue = ""; });
    document.querySelectorAll("a[href]").forEach(link => link.addEventListener("click", evento => { if (!alteracoesChamados.size || link.target === "_blank" || link.href.startsWith("mailto:") || link.href.startsWith("tel:")) return; if (!confirmarSaida()) evento.preventDefault(); else avisarSaidaComAlteracoes = false; }));
    await carregarAdmin();
    window.setInterval(() => {
        if (!alteracoesChamados.size) carregarAdmin();
    }, 15000);
}

async function carregarAdmin() {
    const { data: clientes = [] } = await supabaseClient.from("idosos").select("id,nome,cpf,telefone,rg,data_nascimento").order("criado_em", { ascending: false });
    clientesAdmin = clientes;
    const { data: chamados = [] } = await supabaseClient.from("acionamentos").select("*, idosos(nome)").order("criado_em", { ascending: false }).limit(50);
    chamadosAdmin = chamados.filter(deveExibirChamadoOperacional).slice(0, 10);
    const { data: mensagens = [] } = await supabaseClient.from("mensagens").select("*").order("criado_em", { ascending: false }).limit(30);
    document.getElementById("totalClientes").textContent = clientes.length; document.getElementById("totalChamadosAdmin").textContent = chamadosAdmin.length; document.getElementById("totalMensagens").textContent = mensagens.filter(m => m.status === "aberta").length;
    document.getElementById("listaClientes").innerHTML = clientes.length ? clientes.map(c => `<tr><td>${c.nome}</td><td>${c.cpf}</td><td>${c.telefone}</td><td><button class="botaoTabela" data-id="${c.id}">Editar</button></td></tr>`).join("") : '<tr><td colspan="4">Nenhum cliente cadastrado.</td></tr>';
    document.querySelectorAll(".botaoTabela[data-id]").forEach(botao => botao.addEventListener("click", () => editarCliente(botao.dataset.id)));
    renderizarChamados(); renderizarMensagens(mensagens);
}

// =====================================================
// FILTROS E RENDERIZAÇÃO DOS CHAMADOS
// =====================================================
function aplicarFiltros() {
    const busca = document.getElementById("buscaCliente").value.trim().toLowerCase();
    const status = document.getElementById("filtroStatus").value;
    const idsEncontrados = new Set(clientesAdmin.filter(c => !busca || c.nome.toLowerCase().includes(busca) || c.cpf.includes(busca)).map(c => c.id));
    const chamados = chamadosAdmin.filter(c => idsEncontrados.has(c.idoso_id) && (status === "todos" || c.status === status));
    document.querySelectorAll("#listaClientes tr").forEach(linha => { const texto = linha.textContent.toLowerCase(); linha.hidden = Boolean(busca && !texto.includes(busca)); });
    renderizarChamados(chamados);
}

function renderizarChamadosAntigo(lista = chamadosAdmin) {
    document.getElementById("listaChamadosAdmin").innerHTML = lista.length ? lista.map(c => `<tr><td>${c.idosos?.nome || "Cliente"}</td><td>${new Date(c.criado_em).toLocaleString("pt-BR")}</td><td>${c.latitude ? `<a href="https://www.google.com/maps?q=${c.latitude},${c.longitude}" target="_blank">Ver localização</a>` : "Não registrada"}</td><td><select class="statusSelect" data-chamado="${c.id}"><option ${c.status === "Recebido" ? "selected" : ""}>Recebido</option><option ${c.status === "Em atendimento" ? "selected" : ""}>Em atendimento</option><option ${c.status === "Resolvido" ? "selected" : ""}>Resolvido</option><option ${c.status === "Emergência" ? "selected" : ""}>Emergência</option></select></td><td><button class="botaoTabela salvarStatus" data-chamado="${c.id}">Salvar</button></td></tr>`).join("") : '<tr><td colspan="5">Nenhum chamado encontrado.</td></tr>';
    document.querySelectorAll(".salvarStatus").forEach(botao => botao.addEventListener("click", () => atualizarStatus(botao.dataset.chamado)));
}

async function atualizarStatusAntigo(id) { const select = document.querySelector(`.statusSelect[data-chamado="${id}"]`); const { error } = await supabaseClient.from("acionamentos").update({ status: select.value }).eq("id", id); if (error) alert(error.message); else { const chamado = chamadosAdmin.find(c => c.id === id); if (chamado) chamado.status = select.value; select.parentElement.nextElementSibling.textContent = "Atualizado"; } }

function renderizarMensagens(mensagens) { document.getElementById("listaMensagens").innerHTML = mensagens.length ? mensagens.map(m => `<article class="mensagemCliente"><strong>${m.assunto}</strong><small>${m.tipo} · ${new Date(m.criado_em).toLocaleString("pt-BR")}</small><p>${m.mensagem}</p>${m.resposta ? `<div class="respostaCliente"><strong>Resposta:</strong> ${m.resposta}</div>` : `<textarea id="resposta-${m.id}" rows="2" placeholder="Digite uma resposta"></textarea><button class="botaoTabela responderMensagem" data-id="${m.id}">Responder</button>`}</article>`).join("") : "Nenhuma mensagem recebida."; document.querySelectorAll(".responderMensagem").forEach(b => b.addEventListener("click", () => responderMensagem(b.dataset.id))); }

async function editarCliente(id) {
    const cliente = clientesAdmin.find(c => c.id === id); if (!cliente) return;
    const [{ data: endereco }, { data: familiares = [] }] = await Promise.all([supabaseClient.from("enderecos").select("*").eq("idoso_id", id).maybeSingle(), supabaseClient.from("familiares").select("*").eq("idoso_id", id).order("prioridade")]);
    const f1 = familiares.find(f => f.prioridade === 1) || {}, f2 = familiares.find(f => f.prioridade === 2) || {};
    document.getElementById("edicaoCliente").hidden = false; document.getElementById("idClienteEdicao").value = id; document.getElementById("clienteEmEdicao").textContent = `Atualizando ${cliente.nome}`;
    const dados = { ...cliente, ...(endereco || {}) }; const campos = { nomeEdicao: dados.nome, dataNascimentoEdicao: dados.data_nascimento, rgEdicao: dados.rg, cpfEdicao: dados.cpf, telefoneEdicao: dados.telefone, cepEdicao: dados.cep, numeroEdicao: dados.numero, logradouroEdicao: dados.logradouro, bairroEdicao: dados.bairro, cidadeEdicao: dados.cidade, estadoEdicao: dados.estado, complementoEdicao: dados.complemento, familiar1NomeEdicao: f1.nome, familiar1ParentescoEdicao: f1.parentesco, familiar1TelefoneEdicao: f1.telefone, familiar1EmailEdicao: f1.email, familiar2NomeEdicao: f2.nome, familiar2ParentescoEdicao: f2.parentesco, familiar2TelefoneEdicao: f2.telefone, familiar2EmailEdicao: f2.email }; Object.entries(campos).forEach(([campo, valorAtual]) => { document.getElementById(campo).value = valorAtual || ""; });
    document.getElementById("edicaoCliente").scrollIntoView({ behavior: "smooth" });
}

async function salvarCliente(evento) {
    evento.preventDefault(); if (!window.confirm("Salvar as alterações deste cadastro?")) return; const id = document.getElementById("idClienteEdicao").value;
    const { error: erroCliente } = await supabaseClient.from("idosos").update({ nome: valor("nomeEdicao"), data_nascimento: valor("dataNascimentoEdicao") || null, rg: valor("rgEdicao"), telefone: valor("telefoneEdicao") }).eq("id", id); if (erroCliente) { mostrarMensagem("mensagemEdicao", erroCliente.message, "erro"); return; }
    const endereco = { cep: valor("cepEdicao"), numero: valor("numeroEdicao"), logradouro: valor("logradouroEdicao"), bairro: valor("bairroEdicao"), cidade: valor("cidadeEdicao"), estado: valor("estadoEdicao").toUpperCase(), complemento: valor("complementoEdicao") }; const { data: existente } = await supabaseClient.from("enderecos").select("id").eq("idoso_id", id).maybeSingle(); const resultadoEndereco = existente ? await supabaseClient.from("enderecos").update(endereco).eq("id", existente.id) : await supabaseClient.from("enderecos").insert({ ...endereco, idoso_id: id }); if (resultadoEndereco.error) { mostrarMensagem("mensagemEdicao", resultadoEndereco.error.message, "erro"); return; }
    for (const contato of [{ prioridade: 1, prefixo: "familiar1" }, { prioridade: 2, prefixo: "familiar2" }]) { const dados = { nome: valor(`${contato.prefixo}NomeEdicao`), parentesco: valor(`${contato.prefixo}ParentescoEdicao`), telefone: valor(`${contato.prefixo}TelefoneEdicao`), email: valor(`${contato.prefixo}EmailEdicao`) || null }; const { data: familiar } = await supabaseClient.from("familiares").select("id").eq("idoso_id", id).eq("prioridade", contato.prioridade).maybeSingle(); if (familiar) await supabaseClient.from("familiares").update(dados).eq("id", familiar.id); else await supabaseClient.from("familiares").insert({ ...dados, idoso_id: id, prioridade: contato.prioridade }); }
    mostrarMensagem("mensagemEdicao", "Cadastro completo atualizado com sucesso.", "sucesso"); await carregarAdmin();
}
async function responderMensagem(id) { const resposta = document.getElementById(`resposta-${id}`).value.trim(); if (!resposta) return; const { error } = await supabaseClient.from("mensagens").update({ resposta, status: "respondida", respondido_em: new Date().toISOString() }).eq("id", id); if (error) alert(error.message); else await carregarAdmin(); }
function valor(id) { return document.getElementById(id).value.trim(); } function mostrarMensagem(id, texto, tipo) { const e = document.getElementById(id); e.textContent = texto; e.setAttribute("data-tipo", tipo); }

/* Os status ficam pendentes na tela até o único botão de salvamento ser usado. */
function renderizarChamados(lista = chamadosAdmin) {
    document.getElementById("listaChamadosAdmin").innerHTML = lista.length ? lista.map(c => {
        const statusAtual = alteracoesChamados.get(c.id) || c.status;
        return `<tr><td>${c.idosos?.nome || "Cliente"}</td><td>${new Date(c.criado_em).toLocaleString("pt-BR")}</td><td>${c.latitude ? `<a href="https://www.google.com/maps?q=${c.latitude},${c.longitude}" target="_blank">Ver localização</a>` : "Não registrada"}</td><td><select class="statusSelect" data-chamado="${c.id}"><option ${statusAtual === "Recebido" ? "selected" : ""}>Recebido</option><option ${statusAtual === "Em atendimento" ? "selected" : ""}>Em atendimento</option><option ${statusAtual === "Resolvido" ? "selected" : ""}>Resolvido</option><option ${statusAtual === "Emergência" ? "selected" : ""}>Emergência</option></select></td><td>${alteracoesChamados.has(c.id) ? "Pendente" : "Salvo"}</td></tr>`;
    }).join("") : '<tr><td colspan="5">Nenhum chamado encontrado.</td></tr>';
    document.querySelectorAll(".statusSelect").forEach(select => select.addEventListener("change", () => registrarAlteracaoStatus(select.dataset.chamado, select.value)));
    atualizarIndicadorAlteracoes();
}

function registrarAlteracaoStatus(id, status) {
    const chamado = chamadosAdmin.find(c => c.id === id);
    if (!chamado) return;
    if (status === chamado.status) alteracoesChamados.delete(id); else alteracoesChamados.set(id, status);
    aplicarFiltros();
}

async function salvarTodosStatus() {
    if (!alteracoesChamados.size) return;
    if (!window.confirm(`Salvar ${alteracoesChamados.size} alteração(ões) de chamado?`)) return;
    const botao = document.getElementById("salvarAlteracoesChamados");
    botao.disabled = true;
    botao.textContent = "Salvando...";
    const resultados = await Promise.all([...alteracoesChamados.entries()].map(([id, status]) => supabaseClient.from("acionamentos").update({ status }).eq("id", id)));
    const falhas = resultados.filter(resultado => resultado.error);
    if (falhas.length) alert(`Não foi possível salvar ${falhas.length} alteração(ões). Tente novamente.`);
    else { alteracoesChamados.forEach((status, id) => { const chamado = chamadosAdmin.find(c => c.id === id); if (chamado) chamado.status = status; }); alteracoesChamados.clear(); }
    botao.textContent = "Salvar alterações";
    aplicarFiltros();
}

function atualizarIndicadorAlteracoes() {
    const botao = document.getElementById("salvarAlteracoesChamados");
    const indicador = document.getElementById("indicadorAlteracoes");
    const quantidade = alteracoesChamados.size;
    botao.disabled = quantidade === 0;
    indicador.hidden = quantidade === 0;
    indicador.textContent = quantidade === 1 ? "1 alteração pendente" : `${quantidade} alterações pendentes`;
}

function confirmarSaida() {
    return !alteracoesChamados.size || window.confirm("Existem alterações de chamados que ainda não foram salvas. Deseja sair mesmo assim?");
}
