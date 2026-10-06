// =====================================================
// MONITORAMENTO DO ESP8266 PELO BACKEND LOCAL
// =====================================================
// Este arquivo apenas exibe dados realmente recebidos pelo Flask.
// Enquanto nenhum alerta chegar, a tela permanece em estado de espera.
(function () {
    const intervaloAtualizacao = 5000;

    function atualizarIndicadores({ conexao, localizacao, descricaoLocalizacao }) {
        const indicadores = document.querySelectorAll(".indicadorDispositivo");
        const indicadorConexao = indicadores[0];
        const indicadorLocalizacao = indicadores[1];
        if (indicadorConexao) {
            indicadorConexao.querySelector("span").textContent = conexao.texto;
            indicadorConexao.querySelector("span").className = `estadoDispositivo ${conexao.classe}`;
            indicadorConexao.querySelector("small").textContent = conexao.descricao;
        }
        if (indicadorLocalizacao) {
            indicadorLocalizacao.querySelector("span").textContent = localizacao;
            indicadorLocalizacao.querySelector("span").className = "estadoDispositivo statusResolvido";
            indicadorLocalizacao.querySelector("small").textContent = descricaoLocalizacao;
        }
    }

    function limparLocalizacao(mensagem = "A posição será exibida quando o GPS enviar dados.") {
        const status = document.getElementById("statusLocalizacaoAtual");
        const texto = document.getElementById("localizacaoAtualTexto");
        const horario = document.getElementById("localizacaoAtualHorario");
        const link = document.getElementById("localizacaoAtualLink");
        if (status) {
            status.textContent = "Aguardando localização";
            status.className = "statusPainel statusAtencao";
        }
        if (texto) texto.textContent = "Nenhuma localização recebida";
        if (horario) horario.textContent = mensagem;
        if (link) link.hidden = true;
    }

    function exibirAlerta(alerta) {
        const latitude = Number(alerta.latitude);
        const longitude = Number(alerta.longitude);
        const coordenadas = `Latitude ${latitude.toFixed(5)} | Longitude ${longitude.toFixed(5)}`;
        const linkMapa = `https://maps.google.com/?q=${latitude},${longitude}`;
        const status = document.getElementById("statusLocalizacaoAtual");
        const texto = document.getElementById("localizacaoAtualTexto");
        const horario = document.getElementById("localizacaoAtualHorario");
        const link = document.getElementById("localizacaoAtualLink");

        atualizarIndicadores({
            conexao: {
                texto: "Conectado",
                classe: "statusResolvido",
                descricao: "Último alerta recebido pelo Flask local."
            },
            localizacao: coordenadas,
            descricaoLocalizacao: "Coordenadas recebidas do GPS do dispositivo."
        });
        if (status) {
            status.textContent = "Alerta SOS recebido";
            status.className = "statusPainel statusEmergencia";
        }
        if (texto) texto.textContent = coordenadas;
        if (horario) horario.textContent = "Último alerta recebido pelo dispositivo.";
        if (link) {
            link.href = linkMapa;
            link.hidden = false;
        }
    }

    async function consultarUltimoAlerta() {
        if (!window.protegeApiUrl) return;
        try {
            const resposta = await fetch(`${window.protegeApiUrl}/ultimo-alerta`, { cache: "no-store" });
            if (resposta.status === 404) {
                atualizarIndicadores({
                    conexao: {
                        texto: "Aguardando comunicação",
                        classe: "statusAguardando",
                        descricao: "Nenhum alerta foi recebido pelo Flask ainda."
                    },
                    localizacao: "GPS ainda indisponível",
                    descricaoLocalizacao: "A posição será exibida quando o dispositivo enviar dados."
                });
                limparLocalizacao();
                return;
            }
            if (!resposta.ok) throw new Error("Falha ao consultar o backend local");
            const alerta = await resposta.json();
            if (alerta.status !== "SOS" || !Number.isFinite(Number(alerta.latitude)) || !Number.isFinite(Number(alerta.longitude))) {
                throw new Error("Resposta do backend sem coordenadas válidas");
            }
            exibirAlerta(alerta);
        } catch (_erro) {
            atualizarIndicadores({
                conexao: {
                    texto: "Backend indisponível",
                    classe: "statusFalha",
                    descricao: "Não foi possível consultar o Flask local."
                },
                localizacao: "Aguardando sinal GPS",
                descricaoLocalizacao: "A posição será exibida quando o dispositivo enviar dados."
            });
            limparLocalizacao("O painel tentará consultar o backend novamente.");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        consultarUltimoAlerta();
        window.setInterval(consultarUltimoAlerta, intervaloAtualizacao);
    });
})();
