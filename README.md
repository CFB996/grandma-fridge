# Avó's Fridge Rescue

An LLMOps class project: tell Avó what's in your fridge, and she turns it into a recipe — in one of four grandma personas. Built with Docker, MLflow (experiment tracking, tracing, and a Prompt Registry), Gemini (with a local Ollama fallback), and a Flask API.

The project follows the same discipline as the course's own example: prompts are versioned like models, scored against a fixed test set, and only promoted to serve live traffic after clearing a quality gate.

| | |
|---|---|
| The thing you version | a grandma **persona** (prompt) |
| Where versions live | MLflow **Prompt Registry** |
| How you compare them | a fixed **Evaluation Set** |
| How you ship one | move the `@champion` alias |
| What serves it | the Flask API |

## What you need

- Docker Desktop (with Docker Compose)
- A free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no card required
- ~4GB free disk space if you also want the optional local-LLM fallback (Ollama)

## Quick start

```bash
git clone https://github.com/ricardo-gama/grandma-fridge.git
cd grandma-fridge

cp docker/.env.example docker/.env
# then open docker/.env and paste in your GEMINI_API_KEY

docker compose -f docker/docker-compose.yml up -d --build
```

| Service | URL | What it is |
|---|---|---|
| Avó's API | http://localhost:8000 | The recipe service |
| MLflow | http://localhost:5001 | Experiments, traces, and the Prompt Registry |
| JupyterLab | http://localhost:8888/?token=avo | Where personas are prototyped and evaluated |

Try it:

```bash
curl -X POST http://localhost:8000/recipe \
  -H "Content-Type: application/json" \
  -d '{"fridge_items": "ovos, bacalhau, batata, cebola, azeite"}'
```

Ask about something that isn't food and watch Avó refuse — that's a feature, not a bug, and it's one of the things the evaluation measures.

## The cycle

### 1. Four personas

[`src/grandma_personas.py`](src/grandma_personas.py) holds four grandma voices:

| Persona | Approach |
|---|---|
| `affectionate` | Warm, encouraging, simple language |
| `strict` | Judges your fridge choices first, then precise steps |
| `dramatic` | Telenovela energy, everything is a crisis or a triumph |
| `practical` | No commentary, fastest possible recipe |

All four write mainly in English with Portuguese words woven in naturally (food names, endearments, exclamations) — this is shared across every persona via one `LANGUAGE_STYLE` constant, so the voice stays consistent.

This file is imported by both the evaluation pipeline and the live API — the persona being *scored* is byte-for-byte the persona being *served*.

### 2. The Evaluation Set

[`src/evaluation_set.py`](src/evaluation_set.py) is the fixed bar: real fridge lists with reference recipes, plus off-topic cases Avó must refuse — including two prompt-injection attempts ("ignore your instructions...", "forget you are a grandma..."). It is never used to fine-tune anything; it exists purely so personas can be compared on identical input.

### 3. Evaluate and promote

```bash
docker compose -f docker/docker-compose.yml exec api python -m src.evaluate_personas
```

Each persona is registered as a version of the prompt `avo-fridge-persona`, scored over every case, and rated on:

| Metric | What it catches |
|---|---|
| `ingredient_usage` | Did the recipe use what's actually in the fridge? |
| `refusal_accuracy` | Did it refuse everything off-topic, including injection attempts? |
| `rougeL` | Word overlap with a reference recipe |
| `actionability` | Are there actual cooking steps, not just description? |
| `ollama_fallback_rate` | How often Gemini failed and Ollama answered instead |
| `truncated_responses` / `failed_calls` | Silent-failure tripwires |

Compare personas in MLflow at http://localhost:5001.

`refusal_accuracy` has a hard gate at 1.0. A persona that answers something it was told to refuse is **not promoted**, however well it scores elsewhere — a confident, on-brand, off-topic answer is worse than no answer.

Once a persona clears the gate:

```bash
docker compose -f docker/docker-compose.yml exec api python -m src.evaluate_personas --promote
curl -X POST http://localhost:8000/persona/reload
```

Avó now answers with the new champion — no rebuild, no redeploy.

## Optional: local LLM fallback

`src/llm_client.py` tries Gemini first and silently falls back to a local Ollama model on any error (rate limit, quota, network). This is off by default; to include it:

```bash
docker compose -f docker/docker-compose.yml --profile local-llm up -d
docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.2:3b
```

A small model like `llama3.2:3b` needs ~2-4GB disk and 4-8GB RAM, runs CPU-only, and answers in a few seconds. Worth knowing: it's noticeably weaker than Gemini, so expect lower scores when the evaluation runs on the fallback.

## Layout

```
grandma-fridge/
├── docker/
│   ├── docker-compose.yml     # mlflow + jupyter + api (+ ollama, optional profile)
│   ├── Dockerfile.api
│   ├── Dockerfile.jupyter
│   ├── init-mlflow.sh
│   ├── requirements.txt       # pinned
│   └── .env.example
├── api/fridge_app.py          # Flask service, serves prompts:/avo-fridge-persona@champion
├── src/
│   ├── llm_client.py          # the only file that knows Gemini (+ Ollama fallback)
│   ├── grandma_personas.py    # the four personas, shared by pipeline and service
│   ├── evaluation_set.py      # the fixed bar
│   └── evaluate_personas.py   # score, rank, gate, promote
├── notebooks/                 # persona prototyping and evaluation, interactively
└── frontend/                  # Lovable frontend (WIP)
```

## Secrets

`docker/.env` is gitignored, and `docker-compose.yml` only ever names the variable that holds your key, never the key itself. Never commit it, never paste it into a chat window. Anyone who gets it can spend your Gemini quota.

## Troubleshooting

**Colleagues cloning this repo**: `docker/.env` will not exist after cloning (it's gitignored on purpose). Run `cp docker/.env.example docker/.env` and add your own Gemini key before starting.

**`Avó answers "I'm not configured right now"`** — `GEMINI_API_KEY` is missing from `docker/.env`. Check with:
```bash
curl -s http://localhost:8000/health
```

**Build fails on `pyarrow` / `pkg_resources`** — this happens if the Jupyter/API base image picks up Python 3.13, which some pinned dependencies don't have wheels for yet. The Dockerfiles here are pinned to Python 3.12 (`quay.io/jupyter/scipy-notebook:python-3.12`) for exactly this reason — if you've changed the base image tag, revert it.

**Port 5000 already in use** — on macOS this is almost always AirPlay Receiver. MLflow is mapped to host port **5001** here for that reason (`http://localhost:5001`, not 5000).

**`Invalid Host header - possible DNS rebinding attack detected`** — MLflow rejects Host headers it doesn't recognise. `init-mlflow.sh` passes `--allowed-hosts`; if you changed a service name or port mapping in `docker-compose.yml`, add the new host:port there too.

**Gate fails on `refusal_accuracy`** — expected behavior, not a bug. Check which specific off-topic case slipped through (see `src/evaluate_personas.py`'s `looks_like_refusal`), and either strengthen that persona's refusal instruction or accept that persona isn't ready to ship.

**`429 RESOURCE_EXHAUSTED` from Gemini** — you've hit the free tier's rate or daily quota limit. Either wait, lower `--rpm` on the evaluation script, or bring up the Ollama fallback (see above) — `llm_client.py` will use it automatically once available.

**Docker Desktop won't start (Windows)** — usually a WSL2 issue. Try `wsl --update` then `wsl --shutdown`, then reopen Docker Desktop. If disk space is the blocker, run Disk Cleanup (`cleanmgr`) targeting Windows Update files first.

**Start over**

```bash
docker compose -f docker/docker-compose.yml down -v
rm -rf artifacts/
docker compose -f docker/docker-compose.yml up -d --build
```
