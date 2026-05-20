#!/usr/bin/env python3
"""Minimal stdio MCP server for islee23520/lfg.

Provides catalog/status tools for the OMO-native Grok Build adaptation.
"""
import json
import os
import pathlib
import sys
import subprocess

SERVER_INFO = {"name": "lfg-harness", "version": "0.3.0"}
ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[1])
DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA") or pathlib.Path.cwd() / ".lfg")

TOOLS = [
    {
        "name": "grok_build_catalog",
        "description": "Return the OMX-to-Grok skill catalog for islee23520/lfg.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "grok_build_status",
        "description": "Return install/status paths for the lfg plugin.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "grok_build_runtime",
        "description": "Run a safe lfg runtime query such as status, catalog, doctor, hud, pipeline_list, skill_list, skill_search, plan_list, wiki_list, wiki_search, backend_status, or team_status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["status", "catalog", "doctor", "hud", "pipeline_list", "skill_list", "skill_search", "plan_list", "wiki_list", "wiki_search", "backend_status", "team_status", "hook_bridge_status"]},
                "team": {"type": "string"},
                "query": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_doctor",
        "description": "Run LFG doctor diagnostics.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "grok_build_hook_bridge",
        "description": "Status/install the optional global Grok hook bridge that delegates to the lfg plugin audit hook.",
        "inputSchema": {
            "type": "object",
            "properties": {"action": {"type": "string", "enum": ["status", "install"]}},
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_backend_start",
        "description": "Start the explicit LFG team tmux session used by /team.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_team",
        "description": "Create/status/resume/shutdown an LFG tmux team. Creation defaults to dryRun=true unless explicitly false.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "delete", "shutdown_request", "approve_shutdown", "reject_shutdown", "send_message", "task_create", "task_list", "task_update", "task_get", "status", "list", "resume", "shutdown", "providers", "preflight"]},
                "spec": {"type": "string", "description": "team spec like 3:executor"},
                "objective": {"type": "string"},
                "team": {"type": "string"},
                "member": {"type": "string"},
                "to": {"type": "string"},
                "body": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "task": {"type": "string"},
                "status": {"type": "string"},
                "owner": {"type": "string"},
                "actor": {"type": "string"},
                "reason": {"type": "string"},
                "evidence": {"type": "string"},
                "query": {"type": "string"},
                "providers": {"type": "string", "description": "comma list, default grok,subagent"},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_ultrawork",
        "description": "Create/show/update durable ultrawork batch task state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "update", "show"]},
                "id": {"type": "string"},
                "objective": {"type": "string"},
                "tasks": {"type": "string"},
                "task": {"type": "integer"},
                "status": {"type": "string", "enum": ["pending", "active", "complete", "blocked"]},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_agents",
        "description": "List or inspect OMO first-class agents in the LFG registry.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["list", "inspect"]},
                "agent": {"type": "string", "description": "agent id for inspect, e.g. sisyphus"},
                "category": {"type": "string"},
                "provider": {"type": "string"},
                "model": {"type": "string"},
                "reasoning": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_spawn",
        "description": "Spawn an OMO agent through the same lfg-native spawn adapter used by the CLI.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string"},
                "category": {"type": "string"},
                "task": {"type": "string"},
                "taskId": {"type": "string"},
                "provider": {"type": "string"},
                "model": {"type": "string"},
                "reasoning": {"type": "string"},
                "mode": {"type": "string", "enum": ["fallback", "native-grok"], "default": "fallback"}
            },
            "required": ["agent"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_provider",
        "description": "List, show, or add provider/model metadata without storing secret values.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["list", "show", "add"]},
                "id": {"type": "string"},
                "kind": {"type": "string"},
                "env": {"type": "string"},
                "model": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_boulder",
        "description": "Inspect Boulder state via the CLI-backed Atlas or ultragoal state surfaces.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["atlas_status", "ultragoal_show", "ultragoal_status"], "default": "atlas_status"},
                "planId": {"type": "string"},
                "sessionId": {"type": "string"},
                "ultragoalId": {"type": "string"}
            },
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_atlas",
        "description": "Start, inspect, or update Atlas plan execution using the CLI parity surface.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["start-work", "status", "checkbox"]},
                "planId": {"type": "string"},
                "sessionId": {"type": "string"},
                "task": {"type": "string"},
                "status": {"type": "string", "enum": ["pending", "active", "blocked", "complete", "completed"]},
                "evidence": {"type": "string"},
                "learning": {"type": "string"},
                "decision": {"type": "string"},
                "issue": {"type": "string"},
                "verification": {"type": "string"},
                "problem": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_hyperplan",
        "description": "Run the deterministic Hyperplan adversarial planning surface through the CLI.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "objective": {"type": "string"},
                "runId": {"type": "string"},
                "teamName": {"type": "string"},
                "noDeep": {"type": "boolean", "default": False},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["objective"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_ralph",
        "description": "Create/show/step durable Ralph loop state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "step", "show"]},
                "id": {"type": "string"},
                "objective": {"type": "string"},
                "maxIterations": {"type": "integer"},
                "stopCondition": {"type": "string"},
                "status": {"type": "string", "enum": ["active", "complete", "blocked"]},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_worker",
        "description": "Record/list worker ACK and result state for team mode.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["ack", "result", "status"]},
                "worker": {"type": "string"},
                "task": {"type": "string"},
                "result": {"type": "string"},
                "status": {"type": "string", "enum": ["complete", "blocked", "failed"]},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_cleanup",
        "description": "Create/list durable ai-slop-cleaner cleanup reports; no automatic edits in MVP.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list"]},
                "scope": {"type": "string"},
                "verification": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_autoresearch",
        "description": "Create/show/add-source for durable research runs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "add-source", "show"]},
                "id": {"type": "string"},
                "question": {"type": "string"},
                "url": {"type": "string"},
                "note": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_deep_interview",
        "description": "Create/show/answer durable requirement intake interviews.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "answer", "show"]},
                "id": {"type": "string"},
                "topic": {"type": "string"},
                "questions": {"type": "string"},
                "question": {"type": "integer"},
                "answer": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_design",
        "description": "Add/list durable design decisions under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["add", "list"]},
                "title": {"type": "string"},
                "decision": {"type": "string"},
                "rationale": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_notifications",
        "description": "Set/show dry-run notification configuration under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["set", "show"]},
                "channel": {"type": "string", "enum": ["console", "slack", "webhook", "none"]},
                "target": {"type": "string"},
                "enabled": {"type": "boolean"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_models",
        "description": "Show or switch LFG model routing. Grok Build is native; non-Grok models route through LiteLLM.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["show", "switch"], "default": "show"},
                "provider": {"type": "string", "enum": ["litellm"]},
                "model": {"type": "string"},
                "reasoning": {"type": "string", "enum": ["low", "medium", "high", "xhigh"]}
            },
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_auth",
        "description": "Configure provider login metadata without storing secret values.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["login"]},
                "provider": {"type": "string", "enum": ["litellm"]},
                "id": {"type": "string"},
                "env": {"type": "string"},
                "model": {"type": "string"}
            },
            "required": ["action", "provider"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_ask",
        "description": "Record an external advisor request; defaults to dry-run safety.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string"},
                "provider": {"type": "string", "enum": ["litellm"]},
                "model": {"type": "string"},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["prompt"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_analyze",
        "description": "Create/list lightweight durable repo analysis reports.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list"]},
                "focus": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_code_review",
        "description": "Create/list lightweight durable code review reports from git status/diff evidence.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list"]},
                "objective": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_pipeline",
        "description": "Create/list/update durable staged workflow pipelines under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list", "update"]},
                "id": {"type": "string"},
                "title": {"type": "string"},
                "stages": {"type": "string", "description": "semicolon or newline separated stages"},
                "stage": {"type": "integer"},
                "status": {"type": "string", "enum": ["pending", "active", "complete", "blocked"]},
                "note": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_autopilot",
        "description": "Create/show/advance strict ralplan -> ralph -> code-review autopilot workflow state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "advance", "show"]},
                "id": {"type": "string"},
                "objective": {"type": "string"},
                "phase": {"type": "integer"},
                "status": {"type": "string", "enum": ["pending", "active", "complete", "blocked"]},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_performance_goal",
        "description": "Create/show/measure evaluator-gated performance goal state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "measure", "show"]},
                "id": {"type": "string"},
                "objective": {"type": "string"},
                "metrics": {"type": "string"},
                "metric": {"type": "string"},
                "baseline": {"type": "number"},
                "current": {"type": "number"},
                "target": {"type": "number"},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_visual_ralph",
        "description": "Create/show/verdict durable visual Ralph UI matching loop state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "verdict", "show"]},
                "id": {"type": "string"},
                "target": {"type": "string"},
                "reference": {"type": "string"},
                "threshold": {"type": "number"},
                "score": {"type": "number"},
                "status": {"type": "string", "enum": ["pass", "fail", "blocked"]},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_autoresearch_goal",
        "description": "Create/show/critique durable professor-critic autoresearch goal state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "critique", "show"]},
                "id": {"type": "string"},
                "question": {"type": "string"},
                "hypotheses": {"type": "string"},
                "verdict": {"type": "string", "enum": ["pass", "revise", "blocked"]},
                "critic": {"type": "string"},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_omx_setup",
        "description": "Check/show/plan LFG setup state for OMX-like plugin installation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["check", "install-plan", "show"]},
                "marketplace": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_skill",
        "description": "List/search the LFG OMX-like skill catalog.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["list", "search"]},
                "query": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_hud",
        "description": "Return compact LFG workflow status summary.",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "boolean", "default": False}},
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_cancel",
        "description": "Clear current LFG workflow pointers without deleting durable history.",
        "inputSchema": {
            "type": "object",
            "properties": {"scope": {"type": "string", "description": "comma list: goal,plan,team,ultraqa or all"}},
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_ultraqa",
        "description": "Create an adversarial QA smoke run and persist evidence under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "objective": {"type": "string"},
                "noRun": {"type": "boolean", "default": True},
                "timeout": {"type": "integer", "default": 60}
            },
            "required": ["objective"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_goal",
        "description": "Create/list/update durable LFG goal state under plugin data; foundation for /ultragoal.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list", "update"]},
                "objective": {"type": "string"},
                "id": {"type": "string"},
                "status": {"type": "string", "enum": ["active", "blocked", "complete", "cancelled"]},
                "checklist": {"type": "string"},
                "note": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_ultragoal",
        "description": "Create/status/checkpoint durable multi-goal ultragoal plans (OMX parity); manages brief, goals.json, ledger + backing goal primitive.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "status", "checkpoint", "show", "spawn"]},
                "id": {"type": "string"},
                "objective": {"type": "string"},
                "brief": {"type": "string"},
                "checklist": {"type": "string"},
                "spec": {"type": "string", "description": "team spec for spawn, e.g. 3:executor"},
                "providers": {"type": "string", "description": "comma list for spawned team"},
                "team": {"type": "string", "description": "team name for spawn"},
                "dryRun": {"type": "boolean", "default": True},
                "status": {"type": "string", "enum": ["active", "complete", "blocked", "failed", "cancelled"]},
                "evidence": {"type": "string"},
                "story": {"type": "string"},
                "goal_json": {"type": "string"},
                "force_gate": {"type": "boolean"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_ralplan",
        "description": "Create/show/review durable consensus planning state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "review", "show"]},
                "id": {"type": "string"},
                "title": {"type": "string"},
                "steps": {"type": "string"},
                "verdict": {"type": "string", "enum": ["approve", "revise", "block"]},
                "reviewer": {"type": "string"},
                "evidence": {"type": "string"},
                "evidenceArtifactPaths": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_plan",
        "description": "Create or list durable LFG plan state under plugin data. Create returns rich preview struct for Grok-native popup/card rendering of the generated plan Markdown.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list"]},
                "title": {"type": "string"},
                "steps": {"type": "string", "description": "semicolon or newline separated steps"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_wiki",
        "description": "Add/list/search durable LFG wiki notes under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["add", "list", "search"]},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "tags": {"type": "string"},
                "query": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_slash",
        "description": "Parse and execute an LFG-supported Grok slash command, currently /team. Defaults to dryRun=true.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "providers": {"type": "string"},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["command"],
            "additionalProperties": False
        },
    },

    {
        "name": "grok_build_omo_agent_catalog",
        "description": "Return the lfg-native canonical first-class agent catalog from plugins/lfg/src/agents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "include_prompt_hints": {"type": "boolean", "default": True},
                "filter": {"type": "string", "enum": ["all", "eligible_team_members", "lead_agents", "hyperplan"], "default": "all"},
                "with_eligibility": {"type": "boolean", "default": True}
            },
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_omo_team_create",
        "description": "Create (or dry-run) an OMO-powered team using the full agent hierarchy or hyperplan adversarial roster. Supports named agents (sisyphus, hephaestus, ...) and first-class hyperplan template.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "objective": {"type": "string"},
                "spec": {"type": "string", "default": "hyperplan"},
                "name": {"type": "string"},
                "providers": {"type": "string", "default": "grok,subagent"},
                "hyperplan": {"type": "boolean", "default": False},
                "template": {"type": "string"},
                "dryRun": {"type": "boolean", "default": True},
                "ultragoal_id": {"type": "string"}
            },
            "required": ["objective"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_omo_ulw",
        "description": "OMO Ultrawork / ULW entrypoint. Create durable ultrawork, apply OMO IntentGate preambles (Sisyphus lead + parallel delegation), or run hyperplan simulation using the full agent catalog.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "run", "intent", "hyperplan-sim", "show"], "default": "create"},
                "objective": {"type": "string"},
                "id": {"type": "string"},
                "tasks": {"type": "string"},
                "message": {"type": "string"},
                "model": {"type": "string", "default": "grok"},
                "hyperplan": {"type": "boolean", "default": False},
                "deep": {"type": "boolean", "default": False},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_omo_doctor",
        "description": "Run the lfg-native doctor for plugin, state, MCP, and team readiness.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "json": {"type": "boolean", "default": True},
                "project_root": {"type": "string"},
                "include_hyperplan_roster": {"type": "boolean", "default": True}
            },
            "additionalProperties": False
        },
    },
]


def respond(message, result=None, error=None):
    if "id" not in message:
        return
    payload = {"jsonrpc": "2.0", "id": message.get("id")}
    if error is not None:
        payload["error"] = error
    else:
        payload["result"] = result if result is not None else {}
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def text_result(value):
    return {"content": [{"type": "text", "text": json.dumps(value, indent=2, ensure_ascii=False)}]}


def run_lfg_json(args, timeout=30, launcher="lfg"):
    executable = ROOT / "bin" / launcher
    cmd = [str(executable), "--json"] + list(args)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
    parsed = None
    parse_error = None
    stdout = proc.stdout.strip()
    if stdout:
        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError as exc:
            parse_error = str(exc)
    status = "ok" if proc.returncode == 0 and parse_error is None else "error"
    return {
        "ok": status == "ok",
        "status": status,
        "cmd": cmd,
        "returncode": proc.returncode,
        "data": parsed,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "stdoutJson": parse_error is None,
        "parseError": parse_error,
    }


def append_evidence_artifacts(cmd, arguments):
    paths = arguments.get("evidenceArtifactPaths") or arguments.get("evidenceArtifacts") or []
    if isinstance(paths, str):
        paths = [paths]
    for path in paths:
        if path:
            cmd += ["--evidence-artifact", str(path)]


def handle_tool(name, arguments=None):
    arguments = arguments or {}
    if name == "grok_build_catalog":
        path = ROOT / "catalog" / "omo-skill-map.json"
        return text_result(json.loads(path.read_text()))
    if name == "grok_build_status":
        return text_result({
            "pluginRoot": str(ROOT),
            "pluginData": str(DATA),
            "catalogExists": (ROOT / "catalog" / "omo-skill-map.json").exists(),
            "skillsDir": str(ROOT / "skills"),
            "hooksFile": str(ROOT / "hooks" / "hooks.json"),
            "runtime": str(ROOT / "bin" / "lfg"),
        })
    if name == "grok_build_runtime":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json"]
        if action == "status":
            cmd += ["status"]
        elif action == "catalog":
            cmd += ["catalog"]
        elif action == "doctor":
            cmd += ["doctor"]
        elif action == "hud":
            cmd += ["hud"]
        elif action == "pipeline_list":
            cmd += ["pipeline", "list"]
        elif action == "skill_list":
            cmd += ["skill", "list"]
        elif action == "skill_search":
            cmd += ["skill", "search", arguments.get("query") or ""]
        elif action == "plan_list":
            cmd += ["plan", "list"]
        elif action == "wiki_list":
            cmd += ["wiki", "list"]
        elif action == "wiki_search":
            cmd += ["wiki", "search", arguments.get("query") or ""]
        elif action == "backend_status":
            cmd += ["backend", "status"]
        elif action == "team_status":
            cmd += ["team", "status"] + ([arguments["team"]] if arguments.get("team") else [])
        elif action == "hook_bridge_status":
            cmd += ["hook-bridge", "status"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_agents":
        action = arguments.get("action")
        cmd = ["agents"]
        if action == "list":
            cmd += ["list"]
        elif action == "inspect":
            cmd += ["inspect", arguments.get("agent") or "sisyphus"]
            for key, flag in (("category", "--category"), ("provider", "--provider"), ("model", "--model"), ("reasoning", "--reasoning")):
                if arguments.get(key):
                    cmd += [flag, arguments[key]]
        else:
            raise KeyError(action)
        return text_result(run_lfg_json(cmd, timeout=20))
    if name == "grok_build_spawn":
        cmd = ["spawn", arguments["agent"]]
        for key, flag in (("category", "--category"), ("task", "--task"), ("provider", "--provider"), ("model", "--model"), ("reasoning", "--reasoning"), ("mode", "--mode")):
            if arguments.get(key):
                cmd += [flag, arguments[key]]
        if arguments.get("taskId"):
            cmd += ["--task-id", arguments["taskId"]]
        return text_result(run_lfg_json(cmd, timeout=30))
    if name == "grok_build_provider":
        action = arguments.get("action")
        cmd = ["provider"]
        if action == "list":
            cmd += ["list"]
        elif action == "show":
            cmd += ["show", arguments.get("id") or "default"]
        elif action == "add":
            cmd += ["add"]
            for key, flag in (("id", "--id"), ("kind", "--kind"), ("env", "--env"), ("model", "--model")):
                if arguments.get(key):
                    cmd += [flag, arguments[key]]
        else:
            raise KeyError(action)
        return text_result(run_lfg_json(cmd, timeout=30))
    if name == "grok_build_boulder":
        action = arguments.get("action") or "atlas_status"
        if action == "atlas_status":
            cmd = ["atlas", "status"]
            if arguments.get("planId"):
                cmd += ["--plan-id", arguments["planId"]]
            if arguments.get("sessionId"):
                cmd += ["--session-id", arguments["sessionId"]]
        elif action == "ultragoal_show":
            cmd = ["ultragoal", "show"]
            if arguments.get("ultragoalId"):
                cmd += ["--id", arguments["ultragoalId"]]
        elif action == "ultragoal_status":
            cmd = ["ultragoal", "status"]
            if arguments.get("ultragoalId"):
                cmd += ["--id", arguments["ultragoalId"]]
        else:
            raise KeyError(action)
        return text_result(run_lfg_json(cmd, timeout=30))
    if name == "grok_build_atlas":
        action = arguments.get("action")
        cmd = ["atlas"]
        if action in {"start-work", "status"}:
            cmd += [action]
            if arguments.get("planId"):
                cmd += ["--plan-id", arguments["planId"]]
            if arguments.get("sessionId"):
                cmd += ["--session-id", arguments["sessionId"]]
        elif action == "checkbox":
            cmd += ["checkbox", "--task", arguments.get("task") or "1", "--status", arguments.get("status") or "active"]
            for key, flag in (("planId", "--plan-id"), ("sessionId", "--session-id"), ("evidence", "--evidence"), ("learning", "--learning"), ("decision", "--decision"), ("issue", "--issue"), ("verification", "--verification"), ("problem", "--problem")):
                if arguments.get(key):
                    cmd += [flag, arguments[key]]
            append_evidence_artifacts(cmd, arguments)
        else:
            raise KeyError(action)
        return text_result(run_lfg_json(cmd, timeout=30))
    if name == "grok_build_hyperplan":
        cmd = ["hyperplan", arguments["objective"]]
        if arguments.get("runId"):
            cmd += ["--run-id", arguments["runId"]]
        if arguments.get("teamName"):
            cmd += ["--team-name", arguments["teamName"]]
        if arguments.get("noDeep"):
            cmd += ["--no-deep"]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
        return text_result(run_lfg_json(cmd, timeout=45))
    if name == "grok_build_doctor":
        return text_result(run_lfg_json(["doctor"], timeout=30))
    if name == "grok_build_hook_bridge":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "hook-bridge"]
        if action in {"status", "install"}:
            cmd += [action]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_backend_start":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "backend", "start"]
        if arguments.get("name"):
            cmd += ["--name", arguments["name"]]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_team":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "team"]
        if action == "providers":
            cmd += ["providers"]
        elif action == "preflight":
            cmd += ["preflight"]
            if arguments.get("team"):
                cmd += ["--name", arguments["team"]]
        elif action == "create":
            spec = arguments.get("spec") or "3:executor"
            objective = arguments.get("objective") or "coordinate LFG team work with verification"
            cmd += ["create", spec, objective]
            if arguments.get("team"):
                cmd += ["--name", arguments["team"]]
            if arguments.get("providers"):
                cmd += ["--providers", arguments["providers"]]
            else:
                # Maximise installed coding CLIs on the machine + native grok sub-agents
                cmd += ["--providers", "grok,subagent"]
            if arguments.get("dryRun", True):
                cmd += ["--dry-run"]
        elif action in {"status", "resume", "shutdown"}:
            cmd += [action]
            if arguments.get("team"):
                cmd += [arguments["team"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "delete":
            cmd += ["delete", arguments["team"]]
        elif action == "send_message":
            cmd += ["send-message", arguments["team"], arguments.get("to") or "leader", arguments.get("body") or ""]
        elif action == "task_create":
            cmd += ["task-create", arguments["team"], arguments.get("title") or "team task"]
            if arguments.get("description"):
                cmd += ["--description", arguments["description"]]
            if arguments.get("owner"):
                cmd += ["--owner", arguments["owner"]]
        elif action == "task_list":
            cmd += ["task-list", arguments["team"]]
        elif action == "task_update":
            cmd += ["task-update", arguments["team"], arguments["task"]]
            if arguments.get("status"):
                cmd += ["--status", arguments["status"]]
            if arguments.get("owner"):
                cmd += ["--owner", arguments["owner"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
        elif action == "task_get":
            cmd += ["task-get", arguments["team"], arguments["task"]]
        elif action == "shutdown_request":
            cmd += ["shutdown-request", arguments["team"], arguments["member"]]
            if arguments.get("reason"):
                cmd += ["--reason", arguments["reason"]]
        elif action == "approve_shutdown":
            cmd += ["approve-shutdown", arguments["team"], arguments["member"]]
        elif action == "reject_shutdown":
            cmd += ["reject-shutdown", arguments["team"], arguments["member"]]
        else:
            raise KeyError(action)
        if arguments.get("actor") and action not in {"providers", "preflight", "status", "list", "resume", "shutdown"}:
            cmd += ["--actor", arguments["actor"]]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_ultrawork":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultrawork"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Ultrawork objective"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("tasks"):
                cmd += ["--tasks", arguments["tasks"]]
        elif action == "update":
            cmd += ["update", "--task", str(arguments.get("task") or 1), "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_ultragoal":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultragoal"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Ultragoal objective"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("checklist"):
                cmd += ["--checklist", arguments["checklist"]]
            if arguments.get("brief"):
                cmd += ["--brief", arguments["brief"]]
        elif action in {"status", "show"}:
            cmd += [action]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        elif action == "checkpoint":
            cmd += ["checkpoint", "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("story"):
                cmd += ["--story", arguments["story"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            if arguments.get("forceGate"):
                cmd += ["--force-gate"]
            append_evidence_artifacts(cmd, arguments)
        elif action == "spawn":
            cmd += ["spawn", arguments.get("objective") or "ultragoal swarm task"]
            if arguments.get("spec"):
                cmd += ["--spec", arguments["spec"]]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("brief"):
                cmd += ["--brief", arguments["brief"]]
            if arguments.get("providers"):
                cmd += ["--providers", arguments["providers"]]
            if arguments.get("team"):
                cmd += ["--name", arguments["team"]]
            if arguments.get("dryRun", True):
                cmd += ["--dry-run"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_ralph":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ralph"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Ralph objective"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("maxIterations"):
                cmd += ["--max-iterations", str(arguments["maxIterations"])]
            if arguments.get("stopCondition"):
                cmd += ["--stop-condition", arguments["stopCondition"]]
        elif action == "step":
            cmd += ["step", "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_worker":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "worker"]
        if action == "ack":
            cmd += ["ack", arguments.get("worker") or "worker-1", arguments.get("task") or "task"]
        elif action == "result":
            cmd += ["result", arguments.get("worker") or "worker-1", arguments.get("result") or "done"]
            if arguments.get("status"):
                cmd += ["--status", arguments["status"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "status":
            cmd += ["status"]
            if arguments.get("worker"):
                cmd += [arguments["worker"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_cleanup":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ai-slop-cleaner"]
        if action == "create":
            cmd += ["create"]
            if arguments.get("scope"):
                cmd += ["--scope", arguments["scope"]]
            if arguments.get("verification"):
                cmd += ["--verification", arguments["verification"]]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_autoresearch":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "autoresearch"]
        if action == "create":
            cmd += ["create", arguments.get("question") or "Untitled research"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        elif action == "add-source":
            cmd += ["add-source", arguments.get("url") or ""]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("note"):
                cmd += ["--note", arguments["note"]]
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_deep_interview":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "deep-interview"]
        if action == "create":
            cmd += ["create", arguments.get("topic") or "Untitled interview"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("questions"):
                cmd += ["--questions", arguments["questions"]]
        elif action == "answer":
            cmd += ["answer", "--question", str(arguments.get("question") or 1), arguments.get("answer") or ""]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_design":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "design"]
        if action == "add":
            cmd += ["add", arguments.get("title") or "Untitled", arguments.get("decision") or ""]
            if arguments.get("rationale"):
                cmd += ["--rationale", arguments["rationale"]]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_notifications":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "configure-notifications"]
        if action == "set":
            cmd += ["set", "--channel", arguments.get("channel") or "console"]
            if arguments.get("target"):
                cmd += ["--target", arguments["target"]]
            if arguments.get("enabled"):
                cmd += ["--enabled"]
        elif action == "show":
            cmd += ["show"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_models":
        action = arguments.get("action") or "show"
        if action == "switch":
            cmd = ["models", "switch", arguments.get("model") or "grok-build"]
            if arguments.get("provider"):
                cmd += ["--provider", arguments["provider"]]
            if arguments.get("reasoning"):
                cmd += ["--reasoning", arguments["reasoning"]]
        elif action == "show":
            cmd = ["models", "show"]
            if arguments.get("provider"):
                cmd += ["--provider", arguments["provider"]]
        else:
            raise KeyError(action)
        return text_result(run_lfg_json(cmd, timeout=30))
    if name == "grok_build_auth":
        if arguments.get("action") != "login":
            raise KeyError(arguments.get("action"))
        cmd = ["auth", "login", arguments["provider"]]
        for key, flag in (("id", "--id"), ("env", "--env"), ("model", "--model")):
            if arguments.get(key):
                cmd += [flag, arguments[key]]
        return text_result(run_lfg_json(cmd, timeout=30))
    if name == "grok_build_ask":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ask", "create", arguments["prompt"]]
        if arguments.get("provider"):
            cmd += ["--provider", arguments["provider"]]
        if arguments.get("model"):
            cmd += ["--model", arguments["model"]]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
        else:
            cmd += ["--run"]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_analyze":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "analyze"]
        if action == "create":
            cmd += ["create"]
            if arguments.get("focus"):
                cmd += ["--focus", arguments["focus"]]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_code_review":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "code-review"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "review current changes"]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_pipeline":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "pipeline"]
        if action == "create":
            cmd += ["create", arguments.get("title") or "Untitled pipeline"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("stages"):
                cmd += ["--stages", arguments["stages"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "update":
            cmd += ["update", "--stage", str(arguments.get("stage") or 1), "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("note"):
                cmd += ["--note", arguments["note"]]
            append_evidence_artifacts(cmd, arguments)
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_autopilot":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "autopilot"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Autopilot objective"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        elif action == "advance":
            cmd += ["advance", "--phase", str(arguments.get("phase") or 1), "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_performance_goal":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "performance-goal"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Performance objective"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("metrics"):
                cmd += ["--metrics", arguments["metrics"]]
        elif action == "measure":
            cmd += ["measure", "--metric", arguments.get("metric") or "latency"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            for key in ["baseline", "current", "target"]:
                if arguments.get(key) is not None:
                    cmd += [f"--{key}", str(arguments[key])]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_visual_ralph":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "visual-ralph"]
        if action == "create":
            cmd += ["create", arguments.get("target") or "visual target"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("reference"):
                cmd += ["--reference", arguments["reference"]]
            if arguments.get("threshold") is not None:
                cmd += ["--threshold", str(arguments["threshold"])]
        elif action == "verdict":
            cmd += ["verdict", "--score", str(arguments.get("score") if arguments.get("score") is not None else 0), "--status", arguments.get("status") or "fail"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_autoresearch_goal":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "autoresearch-goal"]
        if action == "create":
            cmd += ["create", arguments.get("question") or "Research question"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("hypotheses"):
                cmd += ["--hypotheses", arguments["hypotheses"]]
        elif action == "critique":
            cmd += ["critique", "--verdict", arguments.get("verdict") or "revise"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("critic"):
                cmd += ["--critic", arguments["critic"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_omx_setup":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "omx-setup"]
        if action == "check":
            cmd += ["check"]
        elif action == "install-plan":
            cmd += ["install-plan"]
            if arguments.get("marketplace"):
                cmd += ["--marketplace", arguments["marketplace"]]
        elif action == "show":
            cmd += ["show"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_skill":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "skill"]
        if action == "list":
            cmd += ["list"]
        elif action == "search":
            cmd += ["search", arguments.get("query") or ""]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_hud":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "hud"]
        if arguments.get("text"):
            cmd += ["--text"]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_cancel":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "cancel"]
        if arguments.get("scope"):
            cmd += ["--scope", arguments["scope"]]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_ultraqa":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultraqa", arguments["objective"]]
        if arguments.get("noRun", True):
            cmd += ["--no-run"]
        if arguments.get("timeout"):
            cmd += ["--timeout", str(arguments["timeout"])]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_goal":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "goal"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Untitled goal"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("checklist"):
                cmd += ["--checklist", arguments["checklist"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "update":
            cmd += ["update", "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("note"):
                cmd += ["--note", arguments["note"]]
            append_evidence_artifacts(cmd, arguments)
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_ultragoal":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultragoal"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Untitled ultragoal"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("brief"):
                cmd += ["--brief", arguments["brief"]]
            if arguments.get("checklist"):
                cmd += ["--checklist", arguments["checklist"]]
        elif action == "status":
            cmd += ["status"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        elif action == "checkpoint":
            cmd += ["checkpoint", "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            if arguments.get("story"):
                cmd += ["--story", arguments["story"]]
            if arguments.get("goal_json"):
                cmd += ["--goal-json", arguments["goal_json"]]
            if arguments.get("force_gate") or arguments.get("forceGate"):
                cmd += ["--force-gate"]
            append_evidence_artifacts(cmd, arguments)
        elif action == "show":
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        elif action == "spawn":
            cmd += ["spawn", arguments.get("objective") or "ultragoal swarm task"]
            if arguments.get("spec"):
                cmd += ["--spec", arguments["spec"]]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("providers"):
                cmd += ["--providers", arguments["providers"]]
            if arguments.get("team"):
                cmd += ["--name", arguments["team"]]
            if arguments.get("dryRun", True):
                cmd += ["--dry-run"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_ralplan":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ralplan"]
        if action == "create":
            cmd += ["create", arguments.get("title") or "Consensus plan"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("steps"):
                cmd += ["--steps", arguments["steps"]]
        elif action == "review":
            cmd += ["review", "--verdict", arguments.get("verdict") or "revise"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("reviewer"):
                cmd += ["--reviewer", arguments["reviewer"]]
            if arguments.get("evidence"):
                cmd += ["--evidence", arguments["evidence"]]
            append_evidence_artifacts(cmd, arguments)
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_plan":
        action = arguments.get("action")
        cmd = ["plan"]
        if action == "create":
            cmd += ["create", arguments.get("title") or "Untitled plan"]
            if arguments.get("steps"):
                cmd += ["--steps", arguments["steps"]]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        payload = run_lfg_json(cmd, timeout=30)
        if action == "create" and payload.get("data"):
            payload["plan"] = payload["data"]
            if isinstance(payload["data"], dict) and "preview" in payload["data"]:
                payload["preview"] = payload["data"]["preview"]
                payload["note"] = "Rich plan preview ready for popup/card render (full markdown + interactive steps metadata included; self-contained)."
            else:
                payload["note"] = "Plan created; preview available in parsed plan object."
        else:
            payload["note"] = "Plan written to .lfg/plans/ (both .json and .md). Open the .md file to work on the plan."
        return text_result(payload)
    if name == "grok_build_wiki":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "wiki"]
        if action == "add":
            cmd += ["add", arguments.get("title") or "Untitled", arguments.get("body") or ""]
            if arguments.get("tags"):
                cmd += ["--tags", arguments["tags"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "search":
            cmd += ["search", arguments.get("query") or ""]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_slash":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "slash", arguments["command"]]
        if arguments.get("providers"):
            cmd += ["--providers", arguments["providers"]]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})

    if name == "grok_build_omo_agent_catalog":
        result = run_lfg_json(["agents", "list"], timeout=20)
        cmd = result["cmd"]
        payload = result.get("data") or {}
        agents = list(payload.get("agents", [])) if isinstance(payload, dict) else []
        agent_filter = arguments.get("filter", "all")
        if agent_filter == "eligible_team_members":
            agents = [agent for agent in agents if agent.get("teamEligibility") == "eligible"]
        elif agent_filter == "lead_agents":
            primary_order = ["sisyphus", "hephaestus", "prometheus", "atlas"]
            by_id = {agent.get("id"): agent for agent in agents}
            agents = [by_id[agent_id] for agent_id in primary_order if agent_id in by_id]
        elif agent_filter == "hyperplan":
            primary_order = ["sisyphus", "hephaestus", "prometheus", "atlas", "sisyphus-junior"]
            by_id = {agent.get("id"): agent for agent in agents}
            agents = [by_id[agent_id] for agent_id in primary_order if agent_id in by_id]
        if not arguments.get("with_eligibility", True):
            for agent in agents:
                agent.pop("teamEligibility", None)
                agent.pop("teamMemberEligible", None)
                agent.pop("teamMemberConditional", None)
        return text_result({**result, "source": "plugins/lfg/src/agents", "filter": agent_filter, "withEligibility": bool(arguments.get("with_eligibility", True)), "agents": agents, "count": len(agents)})

    if name == "grok_build_omo_team_create":
        objective = arguments.get("objective") or "OMO huge orchestration"
        spec = arguments.get("spec") or ("hyperplan" if arguments.get("hyperplan") else "3:executor")
        cmd = ["team", "create", spec, objective]
        if arguments.get("name"):
            cmd += ["--name", arguments["name"]]
        if arguments.get("providers"):
            cmd += ["--providers", arguments["providers"]]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
        result = run_lfg_json(cmd, timeout=45, launcher="ulw")
        result["note"] = "Hyperplan/OMO agent expansion handled by lfg team_create + TeamRuntime when spec contains hyperplan or template"
        return text_result(result)

    if name == "grok_build_omo_ulw":
        act = arguments.get("action", "create")
        if act in ("create", "show"):
            cmd = ["ultrawork"]
            if act == "create":
                cmd += ["create", arguments.get("objective") or "lfg ultrawork via MCP"]
                if arguments.get("id"):
                    cmd += ["--id", arguments["id"]]
                if arguments.get("tasks"):
                    cmd += ["--tasks", arguments["tasks"]]
            else:
                cmd += ["show"]
                if arguments.get("id"):
                    cmd += ["--id", arguments["id"]]
            return text_result(run_lfg_json(cmd, timeout=30, launcher="ulw"))
        if act == "hyperplan-sim":
            cmd = ["team", "create", "3:executor", arguments.get("objective") or "hyperplan simulation via lfg MCP", "--providers", "grok,subagent", "--dry-run"]
            return text_result(run_lfg_json(cmd, timeout=30, launcher="ulw"))
        if act == "intent":
            return text_result({"ok": True, "source": "lfg-native", "message": arguments.get("message") or "", "model": arguments.get("model", "grok"), "note": "Intent preamble handling is provided by the lfg/ulw runtime, not an archived reference tree."})
        return text_result({"error": "unsupported omo_ulw action", "action": act})

    if name == "grok_build_omo_doctor":
        result = run_lfg_json(["doctor"], timeout=25)
        result["source"] = "lfg doctor"
        return text_result(result)

    raise KeyError(name)


def handle(message):
    method = message.get("method")
    if method == "initialize":
        respond(message, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": SERVER_INFO})
    elif method == "notifications/initialized":
        return
    elif method == "tools/list":
        respond(message, {"tools": TOOLS})
    elif method == "tools/call":
        try:
            name = (message.get("params") or {}).get("name")
            respond(message, handle_tool(name, (message.get("params") or {}).get("arguments") or {}))
        except Exception as exc:
            respond(message, error={"code": -32000, "message": str(exc)})
    elif method == "ping":
        respond(message, {})
    else:
        respond(message, error={"code": -32601, "message": f"Method not found: {method}"})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            handle(json.loads(line))
        except json.JSONDecodeError:
            continue


if __name__ == "__main__":
    main()
