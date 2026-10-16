# Estoque CFFGROUP

Sistema web interno da CFFGROUP (múltiplos usuários simultâneos) com dois módulos:

- **Estoque** (`/`) — materiais de escritório, retiradas e relatórios de consumo.
- **RHGroup** (`/frequencia`, antes chamado “Frequência”) — faltas, atestados e folgas dos colaboradores, com filtros por mês/setor, exportação CSV e relatórios mensais.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Prisma 6 + SQLite (dados persistidos em `prisma/dev.db`)
- react-hot-toast para notificações

## Como rodar

Pré-requisito: Node.js 20+.

```bash
npm install
npm run dev
```

Na primeira execução, o banco de dados é criado automaticamente (migração do Prisma) e populado com materiais e retiradas de exemplo. Acesse [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — aplica migrações pendentes, roda o seed (se o banco estiver vazio) e inicia o servidor de desenvolvimento.
- `npm run build` — aplica migrações pendentes e gera o build de produção.
- `npm run start` — inicia o servidor em modo produção (após `build`).
- `npm run lint` — roda o ESLint.

## Acesso aos módulos

Tudo fica atrás da autenticação geral do site (`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`). Além disso:

**Estoque** — senha compartilhada da equipe, na variável `ESTOQUE_PASSWORD` (tela `/entrar`). Sem a variável, o estoque fica bloqueado.

**Frequência (RH)** — privada: **contas individuais**, cada pessoa com o próprio e-mail e senha (tela `/frequencia/entrar`).

**Um acesso não mantém o outro:** abrir o estoque encerra a sessão da frequência, e abrir a frequência encerra a do estoque. Isso é feito pela própria página ao abrir (o proxy não consegue distinguir uma visita de um pré-carregamento de link, porque o Next remove esses cabeçalhos antes dele).

1. **Primeiro acesso:** enquanto não existe nenhuma conta, a tela de entrada pede a *chave de primeiro acesso* — o valor de `FREQUENCIA_PASSWORD` no servidor — e cria a conta de **administrador**. Depois disso a chave não abre mais nada.
2. **Liberar acesso:** o administrador, na aba **acessos**, cadastra nome, e-mail, uma senha inicial e o perfil (*Acesso* ou *Administrador*). A pessoa troca a senha em "minha senha".
   - Ou a própria pessoa **solicita o cadastro** na tela de entrada ("Solicitar cadastro"). A conta nasce **pendente** e não entra em nada até um administrador **aprovar** na aba acessos (que mostra quantos pedidos aguardam). Recusar descarta o pedido.
3. **Tirar acesso:** bloquear, redefinir a senha ou remover encerra as sessões da pessoa na hora. O sistema sempre mantém pelo menos um administrador ativo.

Senhas são guardadas só como hash (scrypt); sessões duram 12 horas e ficam registradas no banco (o navegador guarda só um token aleatório). A verificação de acesso é feita em cada rota da API, não só no proxy.

## Onboarding (admissão digital)

Na frequência (RH), a aba **onboarding** controla a admissão 100% digital:

1. O RH clica em **Novo onboarding** — sem preencher nada. O onboarding já nasce com os dados e documentos padrão:
   - **Dados** que o candidato preenche: nome completo, CPF, RG, data de nascimento, nacionalidade, estado civil, e-mail, telefone/WhatsApp, endereço e chave Pix (CNPJ) — validados: CPF e CNPJ com dígitos verificadores (inclusive o CNPJ alfanumérico emitido desde julho/2026), RG com pelo menos 5 caracteres, e-mail e telefone com DDD.
   - **Documentos**: identidade (RG ou CNH), dados bancários e foto para crachá.
   No detalhe, o RH pode retirar ou pedir outros dados e documentos, marcar como opcional e preencher os dados internos (cargo, setor, início, observações — o candidato não vê).
2. O sistema gera um **link pessoal** para o candidato (válido por 30 dias), com atalho para enviar por WhatsApp ou e-mail. O link fica fora de todas as senhas do site — quem dá acesso é o próprio token aleatório na URL, do qual o banco guarda só o hash. Por isso o link só aparece na hora em que é gerado; se perder, gere outro (o anterior para de funcionar).
3. O candidato abre o link no celular, preenche **Seus dados**, envia foto ou PDF de cada documento (até 10 MB, vários arquivos por documento) e acompanha a situação: *não enviado*, *em análise*, *aprovado* ou *recusado* — com o motivo, para reenviar. A página segue a ordem do processo: preencher os dados, enviar os documentos e, por último, o botão **Enviar dados** — que só envia com os dados completos e válidos e todos os documentos obrigatórios enviados, e então leva a uma página de agradecimento avisando que o RH vai analisar.
4. O RH confere os dados, abre os arquivos e aprova ou recusa (a recusa exige motivo). Com os dados obrigatórios preenchidos e os documentos obrigatórios aprovados, **Concluir onboarding** cria o colaborador ativo, com o nome informado pelo candidato (ou reaproveita um com o mesmo nome) e desativa o link.

### Termos gerados: acordo de confidencialidade e uso de imagem

Quando o onboarding tem uma **empresa contratante** (a empresa em que a pessoa vai trabalhar), o candidato também recebe em "Seus documentos" o **Acordo de confidencialidade (NDA)** e o **Termo de autorização de uso de imagem**, cada um com três passos:

1. Depois de preencher "Seus dados", clica em **Baixar … preenchido (PDF)** — o sistema gera o termo com os dados da empresa e do candidato (nome, nacionalidade, estado civil, nascimento, RG, CPF, e-mail, endereço e CEP, conforme o termo), mais a data de hoje.
2. Assina de graça com a conta gov.br em [assinador.iti.br](https://assinador.iti.br).
3. Envia o PDF assinado no mesmo item. O sistema só aceita PDF com assinatura digital.
4. **A empresa assina por cima.** No onboarding, o RH abre o PDF do candidato, o representante da empresa assina o mesmo arquivo no gov.br e o RH envia em **Enviar PDF assinado pela empresa**. O sistema confere que o PDF tem as duas assinaturas e que é o mesmo documento que o candidato assinou (a assinatura digital só acrescenta ao fim do arquivo). Só então o termo pode ser aprovado; o RH confere as duas assinaturas em [validar.iti.gov.br](https://validar.iti.gov.br). Cada termo mostra a linha do tempo: candidato assinou, empresa assinou, RH aprovou. Se o candidato reenviar o termo, a versão da empresa é descartada e ela assina de novo.

Cada PDF segue o formato do modelo do RH, com a fonte embutida para sair igual em qualquer leitor:
- **Acordo de confidencialidade:** A4, Times 10 justificado (fonte Tinos, mesmas medidas da Times New Roman), margens de 1 cm, título no alto à direita, faixas cinza nas cláusulas e quadro de assinaturas em duas colunas.
- **Uso de imagem:** Carta, Arial 12 justificado (fonte Arimo, mesmas medidas da Arial), margens de 1 polegada, títulos centralizados e linhas de assinatura do titular e da empresa.

Ao clicar em **Novo onboarding** com mais de uma empresa cadastrada, o sistema pergunta em qual delas a pessoa vai trabalhar (ou "sem termos"); com uma só, já usa ela. A empresa pode ser trocada depois no cartão **Empresa contratante**, logo acima da lista de documentos.

Um administrador cadastra as empresas em **Termos do onboarding**, na aba onboarding: CNPJ (o botão **Buscar pelo CNPJ** traz razão social, natureza jurídica e endereço da sede das bases públicas da Receita — publica.cnpj.ws, BrasilAPI ou ReceitaWS, a que responder), qualificação como aparece no acordo (`**texto**` sai em negrito), quem assina, cargo e CPF. O termo de uso de imagem precisa do CNPJ e do endereço da sede; sem eles, a empresa aparece com o aviso "Falta CNPJ e endereço". Na mesma tela dá para editar o texto de cada termo: marcadores como `{{NOME}}` e `{{EMPRESA_CNPJ}}` e uma marcação simples por linha (`^ ` centralizado, `> ` à direita, `# ` título à direita, `## ` cláusula com faixa, `a)`/`I.` listas, `[ASSINATURAS]` com `|` separando as colunas); **Voltar ao texto padrão** desfaz a edição. Os dados das empresas ficam só no banco, nunca no repositório.

**Prazo de guarda (LGPD):** o portal avisa o candidato de que, se a contratação não seguir, os dados e documentos são apagados 90 dias depois. Onboardings **cancelados** há mais de 90 dias são apagados automaticamente, com os arquivos (a verificação roda quando o RH abre a lista de onboardings, no máximo a cada 6 horas). A lista mostra quantos dias faltam; reabrir o onboarding interrompe a contagem.

Os arquivos ficam em `admissoes/`, ao lado do banco (local: `prisma/admissoes/`, fora do git; produção: o volume `/data`). Só o RH logado consegue abri-los; o candidato vê apenas nome e situação dos próprios documentos. Excluir a admissão apaga os arquivos.

### Planilha e documentos sem configurar nada no Google (em uso)

- **Planilha:** na aba onboarding, um administrador clica em **Gerar link para a planilha** e cola a fórmula `=IMPORTDATA("<link>")` na célula A1 de uma aba vazia. A planilha passa a puxar sozinha uma linha por candidato que enviou os dados (data do envio, nome, CPF, nascimento, e-mail, telefone, endereço, chave Pix, cargo, setor, início, situação e os dados extras). O Google atualiza em até ~1 hora. O link (`/api/planilha/<token>/onboarding.csv`) não pede senha — o token aleatório é a chave, o banco guarda só o hash, e **Gerar novo link** ou **Desativar** invalida o anterior na hora. Quem tem o link vê os dados: mantenha a planilha restrita ao RH.
- **Documentos:** cada onboarding tem **Baixar documentos (.zip)** — uma pasta com o nome da pessoa e os arquivos nomeados pelo documento, prontos para arrastar para o Drive.

### Integração automática com o Google (opcional)

Se um dia a empresa liberar, o sistema também sabe gravar direto na planilha e no Drive.



Há dois jeitos de ligar o sistema ao Google; se os dois estiverem configurados, vale o Apps Script.

**Recomendado — Google Apps Script** (não precisa de Google Cloud, conta de serviço nem chave JSON, que em organizações novas do Workspace vêm bloqueadas por política):

1. Na planilha do RH: *Extensões › Apps Script* → cole o conteúdo de [`integrations/google-apps-script/Codigo.gs`](integrations/google-apps-script/Codigo.gs) → ajuste `ABA_GID` (número depois de `gid=` no endereço da aba) e, se quiser, `PASTA_ID` → salve.
2. Escolha a função **configurar** → *Executar* → autorize com a sua conta. O *Registro de execução* mostra o **código secreto** e a pasta do Drive (criada como "Onboarding RH", se `PASTA_ID` estiver vazio).
3. *Implantar › Nova implantação* → tipo **App da Web** → executar como **Eu**, acesso **Qualquer pessoa** → copie o endereço que termina em `/exec`.
4. No Railway: `APPS_SCRIPT_URL` = esse endereço; `APPS_SCRIPT_SECRET` = o código secreto.

O script roda com a conta de quem o implantou, só aceita pedidos com o código secreto e grava tudo como texto puro. Para atualizar o código depois: *Implantar › Gerenciar implantações › editar › Nova versão* (o endereço continua o mesmo).

**Alternativa — conta de serviço do Google Cloud**: descrita nas duas seções abaixo.

### Cópia no Google Drive

Ao **concluir** um onboarding, os documentos aprovados são copiados para o Google Drive: uma pasta por pessoa (`Nome – data de início`) dentro da pasta configurada, com arquivos nomeados pelo documento (`CPF.pdf`, `Documento de identidade (RG ou CNH) (1).png`…). O onboarding mostra o link da pasta; se o envio falhar, mostra o motivo e o botão **Tentar de novo**, que só envia o que faltou. A faixa no topo da aba onboarding indica se a conexão está ok.

Configuração (uma vez, pelo administrador do Google Workspace):

1. **Google Cloud Console** → crie (ou escolha) um projeto → *APIs e serviços* → ative a **Google Drive API**.
2. *IAM e administrador* → **Contas de serviço** → criar conta (ex.: `onboarding-rh`) → aba *Chaves* → *Adicionar chave* → **JSON**. Guarde o arquivo baixado com cuidado: ele dá acesso ao Drive. (Se a criação de chaves estiver bloqueada pela política `iam.disableServiceAccountKeyCreation`, um administrador da organização precisa liberar para esse projeto.)
3. **Google Drive** → crie um **Drive compartilhado** (ex.: "RH – Onboarding") com acesso só do RH → *Gerenciar membros* → adicione o e-mail da conta de serviço (`…@….iam.gserviceaccount.com`) como **Gerente de conteúdo**. Contas de serviço não têm espaço no "Meu Drive"; precisa ser um Drive compartilhado.
4. Abra a pasta de destino nesse Drive compartilhado e copie o ID do endereço (`drive.google.com/drive/folders/`**`ESTE-TRECHO`**).
5. No Railway (*Variables*): `GOOGLE_SERVICE_ACCOUNT_KEY` = o conteúdo **inteiro** do arquivo JSON; `GOOGLE_DRIVE_FOLDER_ID` = o ID da pasta.

Sem essas variáveis, tudo funciona normalmente e os documentos ficam só no sistema; depois de configurar, use **Enviar ao Drive** nos onboardings já concluídos.

### Planilha do Google Sheets

Cada candidato que conclui o envio (botão **Enviar dados**) ganha uma linha na planilha do RH, com situação "Em análise"; ao **concluir** ou **cancelar** o onboarding, a mesma linha é atualizada ("Concluído" / "Cancelado", link da pasta no Drive). A linha é achada pelo CPF (ou pelo nome, se a planilha não tiver CPF), então reordenar a planilha não atrapalha.

O sistema lê os títulos da 1ª linha da aba e preenche as colunas que reconhece — Nome/Colaborador, CPF, Data de nascimento, E-mail, Telefone/WhatsApp, Endereço, Chave Pix, Cargo/Função, Setor/Departamento, Início/Data de admissão, Situação/Status, Data do envio, Pasta/Drive, além dos dados extras pelo próprio nome —, com ou sem acento e em qualquer ordem. Colunas desconhecidas e as outras linhas não são tocadas. Numa aba vazia, ele cria os títulos. Tudo é gravado como texto puro, para nenhum valor digitado pelo candidato virar fórmula.

Configuração (usa a mesma conta de serviço do Drive):

1. Google Cloud → *APIs e serviços* → ative a **Google Sheets API** no mesmo projeto.
2. Na planilha → **Compartilhar** → o e-mail da conta de serviço como **Editor** (funciona também com planilha de Gmail pessoal).
3. No Railway: `GOOGLE_SHEETS_ID` = o trecho de `docs.google.com/spreadsheets/d/`**`ID`**`/edit`; opcional `GOOGLE_SHEETS_TAB_GID` = o número depois de `gid=` no endereço da aba (sem ele, usa a primeira aba).

## Modelo de dados

- **Material**: nome, categoria, unidade, quantidade, estoque mínimo, local, fornecedor, preço e link de compra.
- **Retirada**: cópia dos dados do material no momento da retirada (para manter o histórico legível mesmo após edição ou exclusão do material), quantidade, data e responsável.

- **Admissão**: dados do candidato, situação, hash do link e validade; cada **documento pedido** tem situação, motivo da recusa e quem avaliou, e pode ter vários **arquivos**. Os documentos do tipo `nda` (acordo de confidencialidade) e `imagem` (termo de uso de imagem) são gerados com a **empresa contratante** do onboarding, que guarda CNPJ, natureza jurídica e endereço da sede.
- **Acesso à frequência**: nome, e-mail, hash da senha, perfil (administrador ou acesso), se está ativo e último acesso; mais as sessões abertas.
- **Colaborador**: nome, setor, cargo, total de folgas a que tem direito e se está ativo (inativos somem da lista ao registrar novas ocorrências, mas o histórico continua).
- **Ocorrência**: tipo (`falta`, `atestado` ou `folga`), data inicial e final (atestados e folgas podem cobrir vários dias), se foi justificada, gestor que concedeu (folga) e observações. O saldo de folgas é o total do colaborador menos os dias de folga já lançados; a API recusa folgas acima do saldo. Guarda uma cópia do nome e setor do colaborador, como as retiradas fazem com o material.

Excluir um material não apaga o histórico de retiradas associado a ele; excluir um colaborador também preserva suas ocorrências.

O tipo `atraso` foi retirado do sistema em 30/09/2026. Registros antigos desse tipo continuam no banco (coluna `minutesLate` inclusive), mas a API não os lista nem aceita novos.

Atestados são dados de saúde (LGPD): o sistema não tem campo de CID/diagnóstico de propósito.

**Anexos de atestado**: PDF ou imagem (JPG, PNG, WEBP, HEIC), até 10 MB cada. Os arquivos ficam em disco numa pasta `atestados` ao lado do banco SQLite — localmente `prisma/atestados/` (fora do git), em produção no mesmo volume do banco. Para usar outra pasta, defina `ATTACHMENTS_DIR`. Só são servidos pela API, atrás da mesma autenticação do site.

## Ambiente de teste e verificação automática

- **Ambiente de teste:** novidades são feitas no ramo `sistema-teste` e publicadas no ambiente `teste` do Railway (endereço próprio, banco e arquivos separados da produção). Só depois de aprovadas vão para a `main` e para produção.
- **Verificação automática:** a cada mudança em `main` ou `sistema-teste`, o GitHub Actions (`.github/workflows/verificacao.yml`) aplica as migrações num banco vazio, roda as regras de código e compila o sistema.
- **Saúde do site:** `GET /api/health` responde `{"ok":true}` quando o servidor e o banco estão de pé (sem senha, sem dados). Serve para um monitor externo (ex.: UptimeRobot) avisar quando o site cair.
