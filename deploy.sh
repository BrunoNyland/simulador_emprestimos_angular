#!/usr/bin/env bash
# Publica o simulador em https://simulador.brunonyland.com (VPS, nginx estático).
#
#   ./deploy.sh            atualiza do origin/main, testa, builda, compacta e publica
#   ./deploy.sh --local    publica a árvore local como está (sem git pull)
#
# O build vai para uma pasta temporária e só é publicado se testes e build
# passarem: uma falha nunca deixa o site pela metade. Cada arquivo de texto
# ganha .br (brotli -q 11) e .gz (gzip -9), servidos pelo brotli_static e
# gzip_static do nginx sem compactar a cada requisição.
#
# Os JS/CSS com hash de builds anteriores ficam 7 dias no servidor, para uma
# aba aberta durante o deploy não pedir um chunk (o worker do CET) que já não
# existe.
{
set -euo pipefail

DESTINO="${DESTINO:-/var/www/simulador.brunonyland.com}"
URL="${URL:-https://simulador.brunonyland.com}"
DIAS_MANTER_ANTIGOS=7
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

exec 9>/run/lock/simulador-deploy.lock
flock -n 9 || { echo "Outro deploy do simulador está rodando." >&2; exit 1; }

etapa() { printf '\n==> %s\n' "$*"; }

if [[ "${1:-}" != "--local" ]]; then
    etapa "Atualizando do origin/main"
    if [[ -n "$(git status --porcelain)" ]]; then
        echo "Há alterações locais não commitadas; use --local ou faça commit." >&2
        exit 1
    fi
    git fetch --quiet origin main
    git checkout --quiet main
    git merge --ff-only --quiet origin/main
fi
echo "Versão: $(git log -1 --format='%h %s')"

etapa "Instalando dependências"
npm ci --no-audit --no-fund --loglevel=error

etapa "Testes"
npx ng test --watch=false

etapa "Build"
SAIDA="$(mktemp -d "${TMPDIR:-/tmp}/simulador-build.XXXXXX")"
trap 'rm -rf "$SAIDA"' EXIT
npx ng build --output-path "$SAIDA"
NOVO="$SAIDA/browser"
[[ -f "$NOVO/index.html" ]] || { echo "Build sem index.html." >&2; exit 1; }

etapa "Compactando (brotli -q 11, gzip -9)"
find "$NOVO" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \
    -o -name '*.json' -o -name '*.jsonc' -o -name '*.svg' -o -name '*.ico' \
    -o -name '*.txt' -o -name '*.xml' -o -name '*.webmanifest' \) -print0 |
    while IFS= read -r -d '' f; do
        brotli -q 11 -f -k -o "$f.br" "$f"
        gzip -9 -n -f -k "$f"
    done
du -sh --apparent-size "$NOVO" | cut -f1 | xargs echo "Tamanho com as versões compactadas:"

etapa "Publicando em $DESTINO"
mkdir -p "$DESTINO"
# Tudo menos o index.html primeiro: quando o index novo entra, os arquivos que
# ele referencia já estão lá.
rsync -a --exclude='/index.html*' "$NOVO/" "$DESTINO/"
rsync -a "$NOVO"/index.html* "$DESTINO/"
# Remove o que não faz parte deste build e tem mais de N dias.
( cd "$NOVO" && find . -type f | sort ) > "$SAIDA/atuais.txt"
( cd "$DESTINO" && find . -type f -mtime +"$DIAS_MANTER_ANTIGOS" | sort ) |
    comm -23 - "$SAIDA/atuais.txt" |
    while IFS= read -r f; do rm -f "$DESTINO/$f"; done
find "$DESTINO" -mindepth 1 -type d -empty -delete
chown -R www-data:www-data "$DESTINO"

etapa "Conferindo $URL"
JS="$(grep -o 'main-[A-Z0-9]*\.js' "$NOVO/index.html" | head -1)"
for caminho in / "/$JS"; do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept-Encoding: br' "$URL$caminho")"
    printf '%s %s\n' "$codigo" "$caminho"
    [[ "$codigo" == 200 ]] || { echo "Resposta inesperada." >&2; exit 1; }
done
codificacao="$(curl -sI -H 'Accept-Encoding: br' "$URL/$JS" | tr -d '\r' |
    awk -F': ' 'tolower($1)=="content-encoding"{print $2}')"
echo "Content-Encoding do JS: ${codificacao:-nenhum}"

etapa "Publicado"
exit
}
