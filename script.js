/*
 * P.R.O.T.E.G.E.
 * Sistema de assistência e segurança para idosos
 *
 * 1º acionamento -> Familiar 1
 * 2º acionamento -> Familiar 1 + Familiar 2
 * 3º acionamento -> Emergência
 *
 * A localização é obtida no momento de cada acionamento.
 */

let contadorAcionamentos = 0;

document.addEventListener("DOMContentLoaded", function () {
    configurarBotaoAssistencia();
    configurarFormulariosDeAcesso();
    configurarAcessoPublico();
});

async function configurarAcessoPublico() {
    const { data } = await supabaseClient.auth.getUser();
    const autenticado = Boolean(data.user);
    const botaoAssistencia = document.getElementById("botaoAssistencia");
    const bloqueioAssistencia = document.getElementById("bloqueioAssistencia");
    const bloqueioHistorico = document.getElementById("bloqueioHistorico");
    const tabelaHistorico = document.getElementById("tabelaHistorico");
    const botaoPainel = document.getElementById("botaoPainel");
    const secoesProtegidas = ["areaAssistencia", "areaFuncionamento", "secaoHistorico"];

    if (botaoAssistencia) botaoAssistencia.disabled = !autenticado;
    if (bloqueioAssistencia) bloqueioAssistencia.hidden = autenticado;
    if (bloqueioHistorico) bloqueioHistorico.hidden = autenticado;
    if (tabelaHistorico) tabelaHistorico.hidden = !autenticado;
    if (botaoPainel) botaoPainel.hidden = !autenticado;
    secoesProtegidas.forEach(function (id) {
        const secao = document.getElementById(id);
        if (secao) secao.hidden = !autenticado;
        const link = document.querySelector('a[href="#' + id + '"]');
        if (link && link.parentElement) link.parentElement.hidden = !autenticado;
    });
}


// =====================================================
// BOTÃO DE ASSISTÊNCIA
// =====================================================

function configurarBotaoAssistencia() {

    const botao = document.getElementById("botaoAssistencia");

    if (!botao) {
        return;
    }

    botao.addEventListener("click", function () {
        window.location.href = "dashboard.html";
    });
}


// =====================================================
// BOTÕES ENTRAR / CRIAR CONTA
// =====================================================

function configurarFormulariosDeAcesso() {

    const formLogin = document.getElementById("formLogin");
    const formRegistro = document.getElementById("formRegistro");
    const linkEsqueciSenha = document.getElementById("linkEsqueciSenha");

    if (formLogin) {
        formLogin.addEventListener("submit", async function (evento) {
            evento.preventDefault();
            const email = document.getElementById("emailLogin").value;
            const senha = document.getElementById("senhaLogin").value;
            const { data: loginData, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

            if (error) {
                mostrarMensagemFormulario("mensagemLogin", "E-mail ou senha invÃ¡lidos.", "erro");
                return;
            }

            const { data: perfil } = await supabaseClient
                .from("perfis")
                .select("tipo")
                .eq("usuario_id", loginData.user.id)
                .single();

            window.location.href = perfil?.tipo === "admin" ? "selecionar-area.html" : "dashboard.html";
            return;
            mostrarMensagemFormulario("mensagemLogin", "Login validado. A integração com o servidor será conectada na próxima etapa.", "sucesso");
        });
    }

    if (formRegistro) {
        formRegistro.addEventListener("submit", async function (evento) {
            evento.preventDefault();
            const senha = document.getElementById("senhaRegistro").value;
            const confirmacao = document.getElementById("confirmarSenha").value;

            if (senha !== confirmacao) {
                mostrarMensagemFormulario("mensagemRegistro", "As senhas não coincidem.", "erro");
                return;
            }

            const dados = Object.fromEntries(new FormData(formRegistro).entries());
            const cpf = dados.cpf.replace(/\D/g, "");
            const telefone = dados.telefone.replace(/\D/g, "");

            if (cpf.length !== 11) {
                mostrarMensagemFormulario("mensagemRegistro", "Informe um CPF válido com 11 dígitos.", "erro");
                return;
            }

            if (telefone.length < 10 || dados.familiar1Telefone.replace(/\D/g, "").length < 10 || dados.familiar2Telefone.replace(/\D/g, "").length < 10) {
                mostrarMensagemFormulario("mensagemRegistro", "Informe telefones válidos com DDD.", "erro");
                return;
            }

            const { data: cadastroAuth, error: erroAuth } = await supabaseClient.auth.signUp({
                email: dados.email,
                password: senha
            });

            if (erroAuth || !cadastroAuth.user) {
                mostrarMensagemFormulario("mensagemRegistro", erroAuth ? erroAuth.message : "NÃ£o foi possÃ­vel criar a conta.", "erro");
                return;
            }

            const idoso = {
                usuario_id: cadastroAuth.user.id,
                nome: dados.nome,
                rg: dados.rg,
                cpf: cpf,
                telefone: telefone,
                data_nascimento: dados.dataNascimento
            };
            const { data: idosoCriado, error: erroIdoso } = await supabaseClient
                .from("idosos")
                .insert(idoso)
                .select("id")
                .single();

            if (erroIdoso) {
                mostrarMensagemFormulario("mensagemRegistro", erroIdoso.message, "erro");
                return;
            }

            await supabaseClient.from("enderecos").insert({
                idoso_id: idosoCriado.id,
                cep: dados.cep,
                logradouro: dados.logradouro,
                numero: dados.numero,
                bairro: dados.bairro,
                cidade: dados.cidade,
                estado: dados.estado.toUpperCase(),
                complemento: dados.complemento
            });

            await supabaseClient.from("familiares").insert([
                { idoso_id: idosoCriado.id, nome: dados.familiar1Nome, parentesco: dados.familiar1Parentesco, telefone: dados.familiar1Telefone, email: dados.familiar1Email || null, prioridade: 1 },
                { idoso_id: idosoCriado.id, nome: dados.familiar2Nome, parentesco: dados.familiar2Parentesco, telefone: dados.familiar2Telefone, email: dados.familiar2Email || null, prioridade: 2 }
            ]);

            mostrarMensagemFormulario("mensagemRegistro", "Cadastro realizado com sucesso!", "sucesso");
            formRegistro.reset();

            mostrarMensagemFormulario("mensagemRegistro", "Cadastro validado. Sua conta está pronta para ser integrada ao servidor.", "sucesso");
        });
    }

    if (linkEsqueciSenha) {
        linkEsqueciSenha.addEventListener("click", async function (evento) {
            evento.preventDefault();
            const email = document.getElementById("emailLogin").value.trim();

            if (!email) {
                mostrarMensagemFormulario("mensagemLogin", "Digite seu e-mail para receber o link de recuperaÃ§Ã£o.", "erro");
                return;
            }

            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/reset-password.html"
            });

            if (error) {
                mostrarMensagemFormulario("mensagemLogin", error.message, "erro");
                return;
            }

            mostrarMensagemFormulario("mensagemLogin", "Link de recuperaÃ§Ã£o enviado. Verifique seu e-mail.", "info");
            return;
            mostrarMensagemFormulario("mensagemLogin", "O fluxo de recuperação de senha será disponibilizado em breve.", "info");
        });
    }

    const formRedefinirSenha = document.getElementById("formRedefinirSenha");
    if (formRedefinirSenha) {
        formRedefinirSenha.addEventListener("submit", async function (evento) {
            evento.preventDefault();
            const novaSenha = document.getElementById("novaSenha").value;
            const confirmarNovaSenha = document.getElementById("confirmarNovaSenha").value;

            if (novaSenha !== confirmarNovaSenha) {
                mostrarMensagemFormulario("mensagemRedefinir", "As senhas nÃ£o coincidem.", "erro");
                return;
            }

            const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
            if (error) {
                mostrarMensagemFormulario("mensagemRedefinir", error.message, "erro");
                return;
            }

            mostrarMensagemFormulario("mensagemRedefinir", "Senha alterada com sucesso! Redirecionando...", "sucesso");
            setTimeout(function () { window.location.href = "login.html"; }, 1500);
        });
    }
}

function mostrarMensagemFormulario(id, texto, tipo) {
    const mensagem = document.getElementById(id);
    if (mensagem) {
        mensagem.textContent = texto;
        mensagem.setAttribute("data-tipo", tipo);
    }
}

function configurarBotoesDeAcesso() {

    const botoes = [
        "botaoEntrar",
        "botaoCriarConta",
        "botaoEntrarPrincipal",
        "botaoCriarContaPrincipal"
    ];

    botoes.forEach(function (id) {

        const botao = document.getElementById(id);

        if (!botao) {
            return;
        }

        botao.addEventListener("click", function (evento) {

            evento.preventDefault();

            alert(
                "Essa função será implementada nas próximas etapas do projeto."
            );

        });

    });
}


// =====================================================
// PROCESSAR ACIONAMENTO
// =====================================================

async function processarAcionamento() {

    const botao = document.getElementById("botaoAssistencia");

    // Evita vários cliques enquanto a localização está sendo obtida.
    botao.disabled = true;

    mostrarMensagem(
        "Registrando acionamento e obtendo localização...",
        "info"
    );

    try {

        // Obtém a localização EXATAMENTE no momento do acionamento.
        const localizacao = await obterLocalizacaoAtual();

        contadorAcionamentos++;

        const nivel = Math.min(contadorAcionamentos, 3);

        const informacoes = obterInformacoesDoNivel(nivel);

        mostrarMensagem(
            informacoes.mensagem +
            " Localização registrada: " +
            localizacao.textoLegivel,
            informacoes.tipo
        );

        registrarHistorico({

            dataHora: new Date(),

            localizacao: localizacao,

            destinatarios: informacoes.destinatarios,

            status: informacoes.status

        });

    } catch (erro) {

        mostrarMensagem(
            "Não foi possível registrar o acionamento porque a localização não foi obtida.",
            "erro"
        );

    } finally {

        botao.disabled = false;

    }
}


// =====================================================
// DEFINIR O QUE ACONTECE EM CADA ACIONAMENTO
// =====================================================

function obterInformacoesDoNivel(nivel) {

    // 1º ACIONAMENTO
    if (nivel === 1) {

        return {

            mensagem:
                "1º acionamento realizado. O primeiro familiar/responsável foi chamado.",

            destinatarios:
                "Familiar/responsável 1",

            status:
                "Aguardando resposta",

            tipo:
                "sucesso"
        };
    }


    // 2º ACIONAMENTO
    if (nivel === 2) {

        return {

            mensagem:
                "2º acionamento realizado. O primeiro e o segundo familiar/responsável foram chamados.",

            destinatarios:
                "Familiar/responsável 1 + Familiar/responsável 2",

            status:
                "Aguardando resposta",

            tipo:
                "sucesso"
        };
    }


    // 3º ACIONAMENTO EM DIANTE
    return {

        mensagem:
            "Alerta de emergência acionado. A localização atual foi registrada para atendimento.",

        destinatarios:
            "Emergência",

        status:
            "Alerta de emergência enviado",

        tipo:
            "emergencia"
    };
}


// =====================================================
// OBTER LOCALIZAÇÃO
// =====================================================

function obterLocalizacaoAtual() {

    return new Promise(function (resolve, reject) {

        if (!navigator.geolocation) {

            reject(
                new Error("Geolocalização não disponível.")
            );

            return;
        }


        navigator.geolocation.getCurrentPosition(

            function (posicao) {

                const latitude =
                    posicao.coords.latitude;

                const longitude =
                    posicao.coords.longitude;


                resolve({

                    latitude: latitude,

                    longitude: longitude,

                    textoLegivel:
                        latitude.toFixed(5) +
                        ", " +
                        longitude.toFixed(5),

                    linkMapa:
                        "https://www.google.com/maps?q=" +
                        latitude +
                        "," +
                        longitude

                });

            },


            function (erro) {

                reject(erro);

            },


            {

                enableHighAccuracy: true,

                timeout: 10000,

                maximumAge: 0

            }

        );

    });
}


// =====================================================
// MOSTRAR MENSAGEM NA TELA
// =====================================================

function mostrarMensagem(texto, tipo) {

    let mensagem =
        document.getElementById("mensagemAssistencia");


    if (!mensagem) {

        mensagem =
            document.createElement("p");

        mensagem.id =
            "mensagemAssistencia";


        const botao =
            document.getElementById("botaoAssistencia");


        if (botao) {

            botao.insertAdjacentElement(
                "afterend",
                mensagem
            );

        }

    }


    mensagem.textContent =
        texto;

    mensagem.setAttribute(
        "data-tipo",
        tipo
    );
}


// =====================================================
// HISTÓRICO
// =====================================================

function registrarHistorico(chamado) {

    const corpoTabela =
        document.getElementById(
            "corpoTabelaHistorico"
        );


    if (!corpoTabela) {
        return;
    }


    removerLinhaDeTabelaVazia(
        corpoTabela
    );


    const linha =
        document.createElement("tr");


    // DATA E HORA
    const celulaData =
        document.createElement("td");

    celulaData.textContent =
        chamado.dataHora.toLocaleString("pt-BR");


    // LOCALIZAÇÃO
    const celulaLocalizacao =
        document.createElement("td");


    const linkLocalizacao =
        document.createElement("a");


    linkLocalizacao.href =
        chamado.localizacao.linkMapa;


    linkLocalizacao.target =
        "_blank";


    linkLocalizacao.rel =
        "noopener noreferrer";


    linkLocalizacao.textContent =
        chamado.localizacao.latitude.toFixed(5) +
        ", " +
        chamado.localizacao.longitude.toFixed(5);


    celulaLocalizacao.appendChild(
        linkLocalizacao
    );


    // DESTINATÁRIOS
    const celulaDestinatarios =
        document.createElement("td");


    celulaDestinatarios.textContent =
        chamado.destinatarios;


    // STATUS
    const celulaStatus =
        document.createElement("td");


    celulaStatus.textContent =
        chamado.status;


    // COLOCAR TODAS AS CÉLULAS NA LINHA
    linha.appendChild(
        celulaData
    );

    linha.appendChild(
        celulaLocalizacao
    );

    linha.appendChild(
        celulaDestinatarios
    );

    linha.appendChild(
        celulaStatus
    );


    // COLOCAR A LINHA NA TABELA
    corpoTabela.appendChild(
        linha
    );
}


// =====================================================
// REMOVER "NENHUM CHAMADO"
// =====================================================

function removerLinhaDeTabelaVazia(
    corpoTabela
) {

    const linhaVazia =
        corpoTabela.querySelector(
            'td[colspan="4"]'
        );


    if (linhaVazia) {

        linhaVazia
            .closest("tr")
            .remove();

    }
}
