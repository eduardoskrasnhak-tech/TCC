let usuarioAtual;
let idosoAtual;

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
    await carregarMeuCadastro();
}

async function carregarMeuCadastro() {
    if (!idosoAtual) return;
    const [{ data: endereco }, { data: familiares = [] }] = await Promise.all([
        supabaseClient.from("enderecos").select("*").eq("idoso_id", idosoAtual.id).maybeSingle(),
        supabaseClient.from("familiares").select("*").eq("idoso_id", idosoAtual.id).order("prioridade")
    ]);
    const f1 = familiares.find(f => f.prioridade === 1) || {}, f2 = familiares.find(f => f.prioridade === 2) || {};
    const dados = { ...idosoAtual, ...(endereco || {}) };
    const campos = { meuNome: dados.nome, meuTelefone: dados.telefone, meuRg: dados.rg, meuCep: dados.cep, meuNumero: dados.numero, meuLogradouro: dados.logradouro, meuBairro: dados.bairro, meuCidade: dados.cidade, meuEstado: dados.estado, meuComplemento: dados.complemento, meuFamiliar1Nome: f1.nome, meuFamiliar1Parentesco: f1.parentesco, meuFamiliar1Telefone: f1.telefone, meuFamiliar2Nome: f2.nome, meuFamiliar2Parentesco: f2.parentesco, meuFamiliar2Telefone: f2.telefone };
    Object.entries(campos).forEach(([id, valor]) => { document.getElementById(id).value = valor || ""; });
}

async function salvarMeuCadastro(evento) {
    evento.preventDefault();
    const { error: erroIdoso } = await supabaseClient.from("idosos").update({ nome: valorCampo("meuNome"), telefone: valorCampo("meuTelefone"), rg: valorCampo("meuRg") }).eq("id", idosoAtual.id);
    if (erroIdoso) { mostrarMensagem("mensagemMeuCadastro", erroIdoso.message, "erro"); return; }
    const endereco = { cep: valorCampo("meuCep"), numero: valorCampo("meuNumero"), logradouro: valorCampo("meuLogradouro"), bairro: valorCampo("meuBairro"), cidade: valorCampo("meuCidade"), estado: valorCampo("meuEstado").toUpperCase(), complemento: valorCampo("meuComplemento") };
    const { data: enderecoExistente } = await supabaseClient.from("enderecos").select("id").eq("idoso_id", idosoAtual.id).maybeSingle();
    const resultadoEndereco = enderecoExistente ? await supabaseClient.from("enderecos").update(endereco).eq("id", enderecoExistente.id) : await supabaseClient.from("enderecos").insert({ ...endereco, idoso_id: idosoAtual.id });
    if (resultadoEndereco.error) { mostrarMensagem("mensagemMeuCadastro", resultadoEndereco.error.message, "erro"); return; }
    for (const contato of [{ prioridade: 1, prefixo: "meuFamiliar1" }, { prioridade: 2, prefixo: "meuFamiliar2" }]) { const dados = { nome: valorCampo(`${contato.prefixo}Nome`), parentesco: valorCampo(`${contato.prefixo}Parentesco`), telefone: valorCampo(`${contato.prefixo}Telefone`) }; const { data: existente } = await supabaseClient.from("familiares").select("id").eq("idoso_id", idosoAtual.id).eq("prioridade", contato.prioridade).maybeSingle(); if (existente) await supabaseClient.from("familiares").update(dados).eq("id", existente.id); else await supabaseClient.from("familiares").insert({ ...dados, idoso_id: idosoAtual.id, prioridade: contato.prioridade }); }
    mostrarMensagem("mensagemMeuCadastro", "Cadastro atualizado com sucesso.", "sucesso");
    idosoAtual.nome = valorCampo("meuNome"); document.getElementById("nomeUsuario").textContent = idosoAtual.nome.split(" ")[0];
}

function valorCampo(id) { return document.getElementById(id).value.trim(); }

async function carregarPainel() {
    if (!idosoAtual) return;
    const { data: chamados = [] } = await supabaseClient.from("acionamentos").select("*").eq("idoso_id", idosoAtual.id).order("criado_em", { ascending: false });
    const { count: familiares } = await supabaseClient.from("familiares").select("id", { count: "exact", head: true }).eq("idoso_id", idosoAtual.id);
    document.getElementById("totalChamados").textContent = chamados.length;
    document.getElementById("totalFamiliares").textContent = familiares || 0;
    document.getElementById("ultimoChamado").textContent = chamados[0] ? new Date(chamados[0].criado_em).toLocaleDateString("pt-BR") : "Nenhum";
    const lista = document.getElementById("listaChamados");
    lista.innerHTML = chamados.length ? chamados.map(chamado => `<tr><td>${new Date(chamado.criado_em).toLocaleString("pt-BR")}</td><td>${chamado.latitude ? `<a href="https://www.google.com/maps?q=${chamado.latitude},${chamado.longitude}" target="_blank">Ver localização</a>` : "Não registrada"}</td><td>${chamado.destinatarios || "Familiares"}</td><td><span class="statusPainel">${chamado.status || "Recebido"}</span></td></tr>`).join("") : '<tr><td colspan="4">Nenhum chamado realizado ainda.</td></tr>';
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
    const { error } = await supabaseClient.from("mensagens").insert({ usuario_id: usuarioAtual.id, assunto: document.getElementById("assuntoMensagem").value, tipo: document.getElementById("tipoMensagem").value, mensagem: document.getElementById("textoMensagem").value });
    mostrarMensagem("mensagemSuporte", error ? error.message : "Mensagem enviada ao suporte.", error ? "erro" : "sucesso");
    if (!error) evento.target.reset();
}

async function sair() { await supabaseClient.auth.signOut(); window.location.href = "login.html"; }
function mostrarMensagem(id, texto, tipo) { const elemento = document.getElementById(id); elemento.textContent = texto; elemento.setAttribute("data-tipo", tipo); }
