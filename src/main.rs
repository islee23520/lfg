use clap::{Parser, Subcommand};
use std::process;

use lfg::runtime::dispatch::{run_single, DispatchConfig};
use lfg::runtime::output::OutputFormat;
use lfg::session::share::share_session;
use lfg::session::store::SessionStore;
use lfg::session::trace::export_trace;

#[derive(Parser, Debug)]
#[command(name = "lfg", about = "LFG headless runtime")]
struct Cli {
    #[arg(short = 'p', long = "single", help = "Run a single prompt headlessly")]
    prompt: Option<String>,

    #[arg(long, default_value = "mock:echo")]
    model: String,

    #[arg(long = "output-format", default_value = "plain")]
    output_format: String,

    #[arg(long, help = "Exit non-zero if response is empty")]
    check: bool,

    #[arg(long = "best-of-n", default_value = "1")]
    best_of_n: u32,

    #[arg(long = "max-turns", default_value = "1")]
    max_turns: u32,

    #[arg(long = "session-id")]
    session_id: Option<String>,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Mcp {
        #[command(subcommand)]
        action: McpAction,
    },
    Session {
        #[command(subcommand)]
        action: SessionAction,
    },
    Trace {
        #[arg(help = "Session ID to trace")]
        id: String,
        #[arg(long, help = "Output as JSON")]
        json: bool,
    },
    Share {
        #[arg(help = "Session ID to share")]
        id: String,
        #[arg(long, help = "Custom share endpoint (default: mock)")]
        endpoint: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum SessionAction {
    List,
    Show {
        #[arg(help = "Session ID")]
        id: String,
    },
}

#[derive(Subcommand, Debug)]
enum McpAction {
    List {
        #[arg(long, default_value = "sh")]
        server_cmd: String,
        #[arg(long, num_args = 0..)]
        server_args: Vec<String>,
    },
    Call {
        #[arg(long, default_value = "sh")]
        server_cmd: String,
        #[arg(long, num_args = 0..)]
        server_args: Vec<String>,
        #[arg(long)]
        tool: String,
        #[arg(long, default_value = "{}")]
        args: String,
    },
}

fn main() {
    let cli = Cli::parse();

    if let Some(cmd) = cli.command {
        let home = dirs_next::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        match cmd {
            Commands::Mcp { action } => {
                rt.block_on(run_mcp(action));
            }
            Commands::Session { action } => {
                let store = SessionStore::new(&home);
                match action {
                    SessionAction::List => match store.list() {
                        Ok(ids) => {
                            if ids.is_empty() {
                                println!("no sessions found");
                            } else {
                                for id in &ids {
                                    println!("{}", id);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("error: {}", e);
                            process::exit(1);
                        }
                    },
                    SessionAction::Show { id } => match store.load(&id) {
                        Ok(session) => {
                            println!(
                                "{}",
                                serde_json::to_string_pretty(&session).unwrap_or_default()
                            );
                        }
                        Err(e) => {
                            eprintln!("error: {}", e);
                            process::exit(1);
                        }
                    },
                }
            }
            Commands::Trace { id, json } => {
                let store = SessionStore::new(&home);
                match store.load(&id) {
                    Ok(session) => match export_trace(&session) {
                        Ok(trace) => {
                            if json {
                                println!(
                                    "{}",
                                    serde_json::to_string_pretty(&trace).unwrap_or_default()
                                );
                            } else {
                                println!(
                                    "session: {}",
                                    trace["session_id"].as_str().unwrap_or("?")
                                );
                                println!(
                                    "created: {}",
                                    trace["created_at"].as_str().unwrap_or("?")
                                );
                                println!("turns:   {}", trace["turn_count"]);
                                if let Some(turns) = trace["turns"].as_array() {
                                    for t in turns {
                                        println!(
                                            "  [{}] {}: {}",
                                            t["id"].as_str().unwrap_or("?"),
                                            t["role"].as_str().unwrap_or("?"),
                                            t["content"].as_str().unwrap_or("")
                                        );
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("error: {}", e);
                            process::exit(1);
                        }
                    },
                    Err(e) => {
                        eprintln!("error loading session: {}", e);
                        process::exit(1);
                    }
                }
            }
            Commands::Share { id, endpoint } => {
                let store = SessionStore::new(&home);
                match store.load(&id) {
                    Ok(session) => match share_session(&session, endpoint.as_deref()) {
                        Ok(result) => {
                            println!("url: {}", result.url);
                            if result.is_mock {
                                println!("(mock — no real upload performed)");
                            }
                        }
                        Err(e) => {
                            eprintln!("error: {}", e);
                            process::exit(1);
                        }
                    },
                    Err(e) => {
                        eprintln!("error loading session: {}", e);
                        process::exit(1);
                    }
                }
            }
        }
        return;
    }

    if let Some(prompt) = cli.prompt {
        let output_format = cli
            .output_format
            .parse::<OutputFormat>()
            .unwrap_or_else(|e| {
                eprintln!("error: {}", e);
                process::exit(2);
            });

        let home = dirs_next::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));

        let cfg = DispatchConfig {
            prompt,
            model: cli.model,
            output_format,
            check: cli.check,
            best_of_n: cli.best_of_n,
            max_turns: cli.max_turns,
            session_id: cli.session_id,
        };

        match run_single(cfg, &home) {
            Ok(result) => {
                process::exit(result.exit_code);
            }
            Err(e) => {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        }
    } else {
        eprintln!("lfg runtime — use -p/--single for headless mode");
        process::exit(0);
    }
}

async fn run_mcp(action: McpAction) {
    use lfg::mcp::stdio::McpStdioClient;

    match action {
        McpAction::List {
            server_cmd,
            server_args,
        } => {
            let args: Vec<&str> = server_args.iter().map(|s| s.as_str()).collect();
            let mut client = McpStdioClient::spawn(&server_cmd, &args)
                .await
                .unwrap_or_else(|e| {
                    eprintln!("error: {}", e);
                    process::exit(1);
                });

            match client.tools_list().await {
                Ok(tools) => {
                    for t in &tools {
                        let name = t["name"].as_str().unwrap_or("?");
                        let desc = t["description"].as_str().unwrap_or("");
                        println!("{}: {}", name, desc);
                    }
                    client.kill().await;
                }
                Err(e) => {
                    eprintln!("error: {}", e);
                    client.kill().await;
                    process::exit(1);
                }
            }
        }
        McpAction::Call {
            server_cmd,
            server_args,
            tool,
            args,
        } => {
            let parsed_args: serde_json::Value = serde_json::from_str(&args).unwrap_or_else(|e| {
                eprintln!("error parsing --args JSON: {}", e);
                process::exit(2);
            });

            let sargs: Vec<&str> = server_args.iter().map(|s| s.as_str()).collect();
            let mut client = McpStdioClient::spawn(&server_cmd, &sargs)
                .await
                .unwrap_or_else(|e| {
                    eprintln!("error: {}", e);
                    process::exit(1);
                });

            match client.tools_call(&tool, parsed_args).await {
                Ok(result) => {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&result).unwrap_or_default()
                    );
                    client.kill().await;
                }
                Err(e) => {
                    eprintln!("error: {}", e);
                    client.kill().await;
                    process::exit(1);
                }
            }
        }
    }
}
