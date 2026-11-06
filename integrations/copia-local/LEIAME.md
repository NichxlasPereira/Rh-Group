# Cópia no computador (Mac)

Os documentos aprovados de cada onboarding concluído no RHGroup aparecem,
quase na hora (o programa confere a cada 10 segundos), numa pasta local de
cada Mac cadastrado — uma pasta por colaborador ("Nome – AAAA-MM-DD", com o dia
em que a pessoa fez o onboarding). Os arquivos continuam guardados no RHGroup.

Vários Macs podem receber ao mesmo tempo; cada um tem a sua chave.

## Instalar num Mac

1. No RHGroup (administrador), **Onboarding › Cópia no computador ›
   Adicionar computador**, dê um nome e clique em **Baixar arquivo da chave**
   (vai para Downloads). A chave aparece uma vez só.
2. No Terminal desse Mac, cole o comando que aparece na mesma tela:

   ```bash
   curl -fsSL https://system-onboarding-cffgroup.up.railway.app/api/copia-local/instalar.sh | bash
   ```

   O instalador lê a chave do arquivo em Downloads e apaga o arquivo (sem
   arquivo, usa a chave copiada ou abre uma janela do Mac para colar) e faz a
   primeira cópia na hora. Não precisa instalar nada antes: só usa o que já vem
   no macOS (bash e curl). Com o projeto, dá para rodar também
   `bash integrations/copia-local/instalar.sh`.

A pasta é `~/Onboarding RH`; para outra, rode com `PASTA=…` antes do `bash`.
A chave fica em `~/Library/Application Support/RHGroup/cabecalho`, legível só
pelo seu usuário.

## Como funciona

- Fica ligado desde o login e confere a cada 10 segundos (LaunchAgent
  `com.cffgroup.rhgroup.copia-local`); com o Mac dormindo ou desligado, baixa o
  que faltou assim que voltar.
- Só baixa o que ainda não tem; nunca apaga nem sobrescreve nada da pasta. Se
  um arquivo for apagado da pasta, volta na próxima conferência.
- O RHGroup mostra o último contato de cada computador na tela da chave.
- Registro: `~/Library/Logs/RHGroup-copia-local.log`.

## Trocar a chave, remover um computador

- **Nova chave** (na lista do RHGroup): a antiga daquele Mac para na hora; rode
  o instalador de novo nele.
- **Remover**: aquele Mac para de receber na hora; os outros continuam.
- Desinstalar do Mac (os arquivos já baixados ficam):

  ```bash
  curl -fsSL https://system-onboarding-cffgroup.up.railway.app/api/copia-local/instalar.sh | bash -s -- --remover
  ```
