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
    configurarBotoesDeAcesso();
});


// =====================================================
// BOTÃO DE ASSISTÊNCIA
// =====================================================

function configurarBotaoAssistencia() {

    const botao = document.getElementById("botaoAssistencia");

    if (!botao) {
        return;
    }

    botao.addEventListener("click", processarAcionamento);
}


// =====================================================
// BOTÕES ENTRAR / CRIAR CONTA
// =====================================================

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