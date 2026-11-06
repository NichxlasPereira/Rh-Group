# Cópia no computador (Mac)

Baixa para uma pasta local, a cada 15 minutos, os documentos aprovados de cada
onboarding concluído no RHGroup — uma pasta por pessoa ("Nome – AAAA-MM-DD").
Os arquivos continuam guardados no RHGroup; esta é uma segunda cópia.

## Instalar

1. No RHGroup, aba **Onboarding › Cópia no computador**, clique em **Gerar chave**
   (só administradores) e depois em **Baixar arquivo da chave** (vai para
   Downloads). A chave aparece uma vez só.
2. No Terminal do Mac, rode:

   ```bash
   bash integrations/copia-local/instalar.sh
   ```

   Ele lê a chave do arquivo em Downloads e apaga o arquivo (sem arquivo, usa
   a chave copiada ou abre uma janela do Mac para colar) e faz a primeira
   cópia na hora. A pasta é `~/Onboarding RH`; para outro endereço ou pasta:
   `RHGROUP_URL=… PASTA=… bash integrations/copia-local/instalar.sh`.

Precisa do Node.js instalado. A chave fica só em
`~/Library/Application Support/RHGroup/copia-local.json`, legível só pelo seu
usuário.

## Como funciona

- Roda ao ligar o Mac e a cada 15 minutos (LaunchAgent `com.cffgroup.rhgroup.copia-local`).
- Só baixa o que ainda não tem; nunca apaga nada da pasta local. Se um arquivo
  for apagado da pasta, volta na próxima cópia.
- O RHGroup mostra o último contato do computador na mesma tela da chave.
- Registro: `~/Library/Logs/RHGroup-copia-local.log`.

Pastas dentro de Documentos, Mesa ou Downloads podem pedir permissão do macOS
para o Node; a pasta padrão fica fora delas para evitar isso.

## Trocar a chave ou a pasta

Gere uma nova chave no RHGroup e rode o instalador de novo.

## Desinstalar

```bash
bash integrations/copia-local/instalar.sh --remover
```

Os arquivos já baixados continuam na pasta. Para cortar o acesso pelo lado do
sistema, use **Desativar** na tela da chave.
