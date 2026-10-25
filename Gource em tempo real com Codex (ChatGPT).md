# Gource em tempo real com Codex (ChatGPT)

Tutorial para visualizar, em tempo real, o projeto sendo criado pelo Codex usando o Gource, no Windows.

## 1. A ideia central

O Gource só precisa de duas coisas: um histórico do Git ou um arquivo de log no formato `timestamp|usuario|tipo|caminho`. Ele não depende de qual IA escreve o código. Por isso, o caminho mais confiável é **observar a pasta do projeto no nível do sistema de arquivos**. Assim funciona com o Codex CLI, com a extensão de IDE ou com o app, sem depender de recursos específicos de cada um.

Tudo roda local. Não gasta tokens do Codex nem usa internet (só para baixar as ferramentas uma vez).

## 2. Três métodos

| Método | Tempo real | Separa Codex de você | Esforço |
| --- | --- | --- | --- |
| A. Histórico do Git | Não (depois dos commits) | Não, a menos que os autores sejam diferentes | Mínimo |
| B. Watcher de arquivos + log customizado | Sim | Sim, pelo nome que você definir | Médio |
| C. Gancho de notificação do Codex | Quase (por turno) | Sim | Médio |

Recomendação: comece pelo A para testar o Gource, depois use o B para o tempo real.

## 3. Instalação (Windows)

1. **Gource**: baixe em gource.io ou nas releases do GitHub (`acaudwell/Gource`) e coloque a pasta no PATH.
2. **FFmpeg** (só se quiser gravar vídeo): `winget install Gyan.FFmpeg`.
3. **Python** e a biblioteca watchdog (para o método B): `pip install watchdog`.

## 4. Método A: histórico do Git

Dentro da pasta do projeto:

```
gource --seconds-per-day 0.5 --auto-skip-seconds 1 --title "Meu App" --key
```

Para a animação ficar boa, o Codex precisa fazer commits pequenos e frequentes. Coloque isto no arquivo `AGENTS.md` na raiz do projeto (o Codex lê esse arquivo, equivalente ao `CLAUDE.md`):

```
## Commits
- Faça um commit a cada etapa pequena e concluída.
- Mensagens curtas e descritivas.
```

Custo: algumas linhas fixas de contexto e alguns tokens por commit.

## 5. Método B: tempo real com watcher de arquivos

### 5.1 O script

Salve como `gource_watch.py` fora do projeto (por exemplo em `C:\\tools\\`):

```python
import sys
import time
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# uso: python gource_watch.py <pasta_do_projeto> <arquivo_de_log> [nome_do_autor]
ROOT = Path(sys.argv[1]).resolve()
LOG = Path(sys.argv[2]).resolve()
AUTHOR = sys.argv[3] if len(sys.argv) > 3 else "Codex"

IGNORE = {".git", "node_modules", "target", "__pycache__",
          "dist", "build", ".venv", ".next"}
DEBOUNCE = 0.5  # segundos
_last = {}


def ignored(path: Path) -> bool:
    try:
        parts = path.relative_to(ROOT).parts
    except ValueError:
        return True
    return any(p in IGNORE for p in parts)


def write(kind: str, path: str):
    p = Path(path)
    if ignored(p):
        return
    key = (kind, str(p))
    now = time.time()
    if now - _last.get(key, 0) < DEBOUNCE:
        return
    _last[key] = now
    rel = p.relative_to(ROOT).as_posix()
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{int(now)}|{AUTHOR}|{kind}|{rel}\n")


class Handler(FileSystemEventHandler):
    def on_created(self, e):
        if not e.is_directory:
            write("A", e.src_path)

    def on_modified(self, e):
        if not e.is_directory:
            write("M", e.src_path)

    def on_deleted(self, e):
        if not e.is_directory:
            write("D", e.src_path)

    def on_moved(self, e):
        if not e.is_directory:
            write("D", e.src_path)
            write("A", e.dest_path)


if __name__ == "__main__":
    LOG.touch()
    obs = Observer()
    obs.schedule(Handler(), str(ROOT), recursive=True)
    obs.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        obs.stop()
    obs.join()
```

### 5.2 Como usar (três terminais)

**Terminal 1: o watcher**

```
python C:\\tools\\gource_watch.py C:\\projetos\\meu-app C:\\tools\\codex-log.txt Codex
```

**Terminal 2: o Gource lendo o log ao vivo (PowerShell)**

```
Get-Content -Wait -Tail 0 C:\\tools\\codex-log.txt | gource --log-format custom --realtime --title "Meu App" --key -
```

**Terminal 3 (ou o app/IDE)**: o Codex trabalhando normalmente na pasta do projeto.

Cada arquivo criado, editado ou apagado aparece como um feixe no gráfico, atribuído ao usuário "Codex".

### 5.3 Observações

- O watcher não sabe quem alterou o arquivo. Tudo que mudar na pasta será atribuído ao nome que você passou. Se quiser separar, rode com o nome "Codex" só durante as sessões da IA, ou use um segundo watcher com outro nome e outro log.
- Salvamentos de editores e processos de build podem gerar muitos eventos. Ajuste a lista `IGNORE` e o `DEBOUNCE`.
- Se o Codex rodar dentro do **WSL**, deixe o projeto no sistema de arquivos do Linux e rode o watcher também dentro do WSL (com o Gource no Windows lendo o log pelo caminho `\\\\wsl$\\...`). Eventos em pastas do Windows acessadas pelo WSL, e o contrário, são pouco confiáveis.

## 6. Método C: gancho de notificação do Codex

O Codex CLI tem uma opção `notify` no arquivo `~/.codex/config.toml`, que executa um programa quando um evento acontece, como o fim de um turno do agente. Você pode apontar para um script que roda `git diff --name-only` e acrescenta as linhas ao log. A vantagem é saber exatamente quando o agente terminou uma etapa.

Este recurso muda entre versões. Confirme a sintaxe e os eventos disponíveis na documentação atual do Codex antes de usar, e verifique se o app ou a extensão que você usa também respeita essa configuração. Se não respeitar, o Método B continua valendo.

## 7. Gravar em vídeo

No **cmd** (o PowerShell pode corromper pipes binários):

```
gource -1280x720 --seconds-per-day 0.5 -o - | ffmpeg -y -r 60 -f image2pipe -vcodec ppm -i - -vcodec libx264 -preset ultrafast -pix_fmt yuv420p -crf 18 gource.mp4
```

Para gravar a sessão ao vivo, troque o gource acima por o mesmo comando do item 5.2 com a opção `-o -`.

## 8. Opções úteis do Gource

- `-1920x1080`: resolução.
- `--hide filenames,dirnames`: visual mais limpo.
- `--file-idle-time 0`: arquivos não somem do gráfico.
- `--user-image-dir pasta`: avatares (um `Codex.png` e um `SeuNome.png`).
- `-s 0.3`: acelera ou desacelera a animação.
- `--disable-auto-skip`: não pula períodos sem atividade.

## 9. Custos e cuidados

- **Tokens**: zero. O Gource, o watcher e o FFmpeg rodam fora do modelo. Só o texto extra no `AGENTS.md` conta.
- **Internet**: só para baixar as ferramentas.
- **Hardware**: o Gource usa a GPU via OpenGL. Gravar vídeo usa CPU.
- **Segurança**: o log contém apenas nomes de arquivos, nunca o conteúdo. Mesmo assim, não publique o vídeo se os nomes de pastas forem confidenciais.

## 10. Resumo rápido

1. Instale Gource e `pip install watchdog`.
2. Rode o `gource_watch.py` apontando para a pasta do projeto.
3. Rode o Gource lendo o log com `--realtime`.
4. Peça ao Codex para construir o programa e acompanhe a árvore crescendo.
