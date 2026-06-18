---
name: lfg
description: @islee23520/lfg — OpenCode OmO/lazycodex GrokBuild port 설치 CLI. 용도와 setup 명령 안내.
---

# lfg

`npx @islee23520/lfg` installs the **omo / lazycodex GrokBuild port** and **Grok Build plugin payload** (https://github.com/code-yeongyu/oh-my-openagent **codex adapter** core + **opencode** feature). It installs **native first-party OMO hooks** (bridge fallback only for legacy/imported hooks) and **Grok-native OMO agents** including Hephaestus-like default discipline plus lfg-owned Sisyphus and Atlas planning/research surfaces into `~/.grok/plugins/lfg`.

## 언제 어떤 명령?

| 상황 | 명령 |
|------|------|
| 처음 | `npx @islee23520/lfg setup` |
| 모델 동기화 / 기존 정상 설치 보존 | `npx @islee23520/lfg setup --run` |
| 강제 재설치 / 어댑터 트리 복구 | `npx @islee23520/lfg setup --run --force` |
| 자동화 | `npx @islee23520/lfg --json setup --run` |
| 프리셋 | `npx @islee23520/lfg --json setup --preset grok` 또는 `--preset gpt` |

See `README.md` in the package.
