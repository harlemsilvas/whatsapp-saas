const router = require("express").Router();

function env(name, fallback = "") {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.5; padding: 24px; max-width: 920px; margin: 0 auto;">
    <h1 style="margin: 0 0 12px;">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </body>
</html>`;
}

router.get("/privacy", (req, res) => {
  const serviceName = env("SERVICE_NAME", "WhatsApp SaaS");
  const contactEmail = env("LEGAL_CONTACT_EMAIL", env("CONTACT_EMAIL", ""));
  const companyName = env("LEGAL_ENTITY_NAME", "");

  const bodyHtml = `
    <p><strong>Serviço:</strong> ${escapeHtml(serviceName)}${companyName ? ` (${escapeHtml(companyName)})` : ""}</p>
    <p>Esta Política de Privacidade descreve como coletamos, usamos e armazenamos dados ao operar este serviço.</p>

    <h2>Dados que podemos coletar</h2>
    <ul>
      <li>Dados de contato (ex.: nome e telefone) para identificar conversas no WhatsApp.</li>
      <li>Conteúdo de mensagens recebidas e enviadas para fins de automação e histórico.</li>
      <li>Metadados técnicos (ex.: IDs de mensagens, timestamps, status de entrega) para auditoria e suporte.</li>
    </ul>

    <h2>Como usamos os dados</h2>
    <ul>
      <li>Operar a automação e responder mensagens via WhatsApp Cloud API.</li>
      <li>Manter histórico e registros operacionais (logs) para suporte e segurança.</li>
      <li>Melhorar o serviço e diagnosticar problemas.</li>
    </ul>

    <h2>Compartilhamento</h2>
    <p>Os dados podem ser processados pela Meta (WhatsApp Cloud API) como parte do envio/recebimento de mensagens.</p>

    <h2>Retenção</h2>
    <p>Retemos os dados apenas pelo tempo necessário para operar o serviço e cumprir obrigações legais e de segurança.</p>

    <h2>Solicitações (acesso/exclusão)</h2>
    <p>Para solicitar acesso, correção ou exclusão de dados, use a página <a href="./data-deletion">data-deletion</a>.</p>

    <h2>Contato</h2>
    <p>${contactEmail ? `E-mail: <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : "Defina LEGAL_CONTACT_EMAIL no ambiente para exibir um e-mail de contato."}</p>

    <p style="margin-top: 24px;"><small>Última atualização: ${new Date().toISOString().slice(0, 10)}</small></p>
  `;

  res
    .status(200)
    .type("html")
    .send(page({ title: "Política de Privacidade", bodyHtml }));
});

router.get("/terms", (req, res) => {
  const serviceName = env("SERVICE_NAME", "WhatsApp SaaS");
  const contactEmail = env("LEGAL_CONTACT_EMAIL", env("CONTACT_EMAIL", ""));
  const companyName = env("LEGAL_ENTITY_NAME", "");

  const bodyHtml = `
    <p><strong>Serviço:</strong> ${escapeHtml(serviceName)}${companyName ? ` (${escapeHtml(companyName)})` : ""}</p>
    <p>Ao usar este serviço, você concorda com estes Termos de Serviço.</p>

    <h2>Uso permitido</h2>
    <ul>
      <li>Você é responsável pelo conteúdo e pela legalidade das mensagens enviadas.</li>
      <li>Você concorda em seguir as políticas aplicáveis da Meta/WhatsApp e leis locais.</li>
    </ul>

    <h2>Restrições</h2>
    <ul>
      <li>Não usar o serviço para spam, fraude, assédio ou atividades ilegais.</li>
      <li>Não tentar acessar dados de terceiros sem autorização.</li>
    </ul>

    <h2>Disponibilidade e mudanças</h2>
    <p>O serviço pode ser alterado, suspenso ou descontinuado. Podemos atualizar estes termos periodicamente.</p>

    <h2>Limitação de responsabilidade</h2>
    <p>O serviço é fornecido "como está", sem garantias de disponibilidade ininterrupta.</p>

    <h2>Contato</h2>
    <p>${contactEmail ? `E-mail: <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : "Defina LEGAL_CONTACT_EMAIL no ambiente para exibir um e-mail de contato."}</p>

    <p style="margin-top: 24px;"><small>Última atualização: ${new Date().toISOString().slice(0, 10)}</small></p>
  `;

  res
    .status(200)
    .type("html")
    .send(page({ title: "Termos de Serviço", bodyHtml }));
});

router.get("/data-deletion", (req, res) => {
  const serviceName = env("SERVICE_NAME", "WhatsApp SaaS");
  const contactEmail = env("LEGAL_CONTACT_EMAIL", env("CONTACT_EMAIL", ""));

  const bodyHtml = `
    <p>Esta página descreve como solicitar a exclusão dos seus dados relacionados ao <strong>${escapeHtml(serviceName)}</strong>.</p>

    <h2>Como solicitar</h2>
    <ol>
      <li>Envie um e-mail para ${contactEmail ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : "(defina LEGAL_CONTACT_EMAIL no ambiente)"} com o assunto <strong>\"Exclusão de dados\"</strong>.</li>
      <li>No corpo do e-mail, informe: (a) seu número de telefone (WhatsApp) e (b) o motivo/solicitação.</li>
      <li>Se aplicável, inclua o nome da empresa/conta que utilizou para conversar.</li>
    </ol>

    <h2>O que acontece depois</h2>
    <ul>
      <li>Vamos confirmar o recebimento e solicitar validação adicional se necessário.</li>
      <li>Após validação, removeremos os dados armazenados no nosso banco que estejam associados à sua solicitação, respeitando obrigações legais e de segurança.</li>
    </ul>

    <p style="margin-top: 24px;"><small>Última atualização: ${new Date().toISOString().slice(0, 10)}</small></p>
  `;

  res
    .status(200)
    .type("html")
    .send(page({ title: "Instruções de exclusão de dados", bodyHtml }));
});

module.exports = router;
