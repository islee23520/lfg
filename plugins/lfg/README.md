# lfg

omo / lazycodex **Grok Build** setup helper (oh-my-openagent spinoff — not Linalab).

```sh
npx @islee23520/lfg setup
```

`setup --run` installs the adapter under `~/.grok/installed-plugins/lfg` (plugin tree, hooks, agents, model config). It does **not** run `npx lazycodex-ai install` into `~/.codex`. The omo tree comes from `LFG_LAZYCODEX_PLUGIN_SOURCE`, the npm `_npx` cache, or a built-in minimal fixture until you set a source.

**What it is:** a CLI that materializes a real directory on `~/.grok`, not a Grok plugin or runtime and not a replacement for `lazycodex-ai`.

## 언제 무엇을 실행하면 되나

| 상황 | 명령 |
|------|------|
| 처음 | `npx @islee23520/lfg setup` — (선택) OpenAI-compatible base URL, `/v1/models` 매핑, 역할 조정 후 `Install now?` **y** |
| 모델 동기화 / 기존 정상 설치 보존 | `npx @islee23520/lfg setup --run` |
| 강제 재설치 / 어댑터 트리 복구 | `npx @islee23520/lfg setup --run --force` |
| CI / 스크립트 | `npx @islee23520/lfg --json setup --run` |
| 모델/컨텍스트/인증만 리프레시 (플러그인 트리 변경 없음) | `npx @islee23520/lfg --json setup --refresh --run` |
| 모델만 변경 | `setup` 다시 실행, 또는 `~/.grok`의 `models_base_url` 변경 후 `setup --run` |

## What lfg does

- Entry point: `npx @islee23520/lfg setup`
- Interactive: OpenAI-compatible base URL → `/v1/models` → confirm → install
- Automation: `npx @islee23520/lfg --json setup --run`

## Commands

```sh
npx @islee23520/lfg setup
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --base-url http://127.0.0.1:11434
npx @islee23520/lfg --json setup --preset grok
npx @islee23520/lfg --json setup --preset gpt
npx @islee23520/lfg --json setup --run
npx @islee23520/lfg setup --run
npx @islee23520/lfg setup --run --force
```

`lfg` is not a plugin, not a runtime, and not a replacement for `lazycodex-ai`.
