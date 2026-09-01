// Máscaras de apresentação para documentos e telefones.
(function () {
    function somenteNumeros(valor) { return String(valor || "").replace(/\D/g, ""); }

    function formatarCpf(valor) {
        const n = somenteNumeros(valor).slice(0, 11);
        if (n.length <= 3) return n;
        if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
        if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
        return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
    }

    function formatarRg(valor) {
        const n = somenteNumeros(valor).slice(0, 9);
        if (n.length <= 2) return n;
        if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
        if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
        return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}-${n.slice(8)}`;
    }

    function formatarTelefone(valor) {
        let n = somenteNumeros(valor);
        if (n.startsWith("55") && n.length > 11) n = n.slice(2);
        n = n.slice(0, 11);
        if (!n) return "";
        if (n.length <= 2) return `+55 (${n}`;
        if (n.length <= 7) return `+55 (${n.slice(0, 2)}) ${n.slice(2)}`;
        return `+55 (${n.slice(0, 2)}) ${n.length === 11 ? n.slice(2, 7) : n.slice(2, 6)}-${n.slice(n.length === 11 ? 7 : 6)}`;
    }

    function aplicarMascara(elemento, formatador) {
        if (!elemento) return;
        const atualizar = () => {
            const valorAtual = elemento.value;
            if (valorAtual && !/\d/.test(valorAtual)) return;
            const valorFormatado = formatador(valorAtual);
            if (valorAtual !== valorFormatado) elemento.value = valorFormatado;
        };
        if (!elemento.dataset.mascaraAplicada) {
            elemento.addEventListener("input", atualizar);
            elemento.dataset.mascaraAplicada = "true";
        }
        atualizar();
    }

    function aplicarTodas() {
        document.querySelectorAll("[id^='cpf'], [id$='Cpf'], [id$='cpf']").forEach(input => aplicarMascara(input, formatarCpf));
        document.querySelectorAll("[id^='rg'], [id$='Rg'], [id$='rg']").forEach(input => aplicarMascara(input, formatarRg));
        document.querySelectorAll("input[type='tel']").forEach(input => aplicarMascara(input, formatarTelefone));
    }

    document.addEventListener("DOMContentLoaded", () => {
        aplicarTodas();
        let tentativas = 0;
        const inicializacao = window.setInterval(() => {
            aplicarTodas();
            if (++tentativas >= 80) window.clearInterval(inicializacao);
        }, 250);
    });
})();
