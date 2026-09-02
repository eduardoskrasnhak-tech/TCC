/* Recursos de navegação por teclado compartilhados pelas páginas. */
document.addEventListener("DOMContentLoaded", () => {
    const principal = document.querySelector("main");
    if (!principal) return;
    if (!principal.id) principal.id = "conteudoPrincipal";
    if (!document.querySelector(".linkPularConteudo")) {
        const link = document.createElement("a");
        link.className = "linkPularConteudo";
        link.href = `#${principal.id}`;
        link.textContent = "Pular para o conteúdo principal";
        document.body.prepend(link);
    }
});
