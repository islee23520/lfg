pub fn redact(input: &str) -> String {
    let patterns = ["Bearer ", "sk-", "xai-", "ghp_", "gho_", "github_pat_"];
    let mut result = input.to_string();
    for pat in &patterns {
        while let Some(pos) = result.find(pat) {
            let start = pos + pat.len();
            let end = result[start..]
                .find(|c: char| c.is_whitespace() || c == '"' || c == '\'')
                .map(|i| start + i)
                .unwrap_or(result.len());
            let redacted = format!("{}[REDACTED]", pat);
            result.replace_range(pos..end, &redacted);
        }
    }
    result
}

pub fn contains_secret(input: &str) -> bool {
    let patterns = ["sk-", "xai-", "ghp_", "gho_", "github_pat_"];
    patterns.iter().any(|p| input.contains(p))
}
