from __future__ import annotations

import os
import pathlib


def plugin_root() -> pathlib.Path:
    default = pathlib.Path.home() / ".grok" / "plugins" / "lfg"
    return pathlib.Path(os.environ.get("LFG_PLUGIN_ROOT", default)).expanduser().resolve()


def repo_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[4]


def hook_dir() -> pathlib.Path:
    return pathlib.Path.home() / ".grok" / "hooks"


def plugin_data() -> pathlib.Path:
    return pathlib.Path.home() / ".grok" / "plugin-data" / "lfg"
