import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = "https://integrate.api.nvidia.com/v1"
CHAT_URL = f"{BASE_URL}/chat/completions"
MODELS_URL = f"{BASE_URL}/models"
DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"


def load_local_env() -> None:
    """Carrega somente variaveis ausentes do .env local, sem dependencias."""
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and name not in os.environ:
            os.environ[name] = value


def main() -> int:
    load_local_env()
    api_key = os.environ.get("NVIDIA_API_KEY", "").strip()
    model = os.environ.get("NVIDIA_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL

    if not api_key:
        print("Erro: NVIDIA_API_KEY nao foi encontrada no ambiente ou no .env.")
        return 1

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }

    if "--list-models" in sys.argv:
        request = Request(MODELS_URL, headers=headers, method="GET")
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
            models = sorted(
                item["id"]
                for item in data.get("data", [])
                if isinstance(item, dict) and item.get("id")
            )
            print(f"Modelos acessiveis pela chave: {len(models)}")
            print("\n".join(models))
            return 0
        except HTTPError as error:
            return print_http_error(error)
        except (URLError, TimeoutError) as error:
            print(f"Erro de conexao com a NVIDIA: {error}")
            return 1

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": "Responda apenas: conexao NVIDIA funcionando",
            }
        ],
        "temperature": 0.2,
        "max_tokens": 40,
        "stream": False,
    }
    request = Request(
        CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            **headers,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            data = json.load(response)
        content = data["choices"][0]["message"]["content"]
        print(f"OK - modelo: {model}")
        print(content.strip())
        return 0
    except HTTPError as error:
        return print_http_error(error)
    except (URLError, TimeoutError) as error:
        print(f"Erro de conexao com a NVIDIA: {error}")
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        print(f"Resposta inesperada da NVIDIA: {error}")
    return 1


def print_http_error(error: HTTPError) -> int:
    body = error.read().decode("utf-8", errors="replace")
    try:
        parsed = json.loads(body)
        detail = parsed.get("detail") or parsed.get("error") or parsed
    except json.JSONDecodeError:
        detail = body[:500]
    print(f"Erro HTTP {error.code} ao consultar a NVIDIA: {detail}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
