cost_per_token = {
    "anthropic/claude-opus-4-5":        {"input": 6.50e-06,  "output": 32.50e-06},
    "anthropic/claude-opus-4-5-20250929": {"input": 6.50e-06, "output": 32.50e-06},
    "openai/gpt-5":                     {"input": 1.25e-06, "output": 10.00e-06},
    "openai/gpt-4o":                    {"input": 3.00e-06, "output": 12.00e-06},
    "deepseek/deepseek-chat":          {"input": 0.182e-06, "output": 0.364e-06},
    "deepseek/deepseek-coder":         {"input": 0.182e-06, "output": 0.364e-06},
    "openai/gpt-5-codex":               {"input": 1.25e-06, "output": 10.00e-06},
    "anthropic/claude-sonnet-4-5-20250929": {"input": 3.90e-06, "output": 19.50e-06},
    "xai/grok-code-fast-1":             {"input": 0.20e-06, "output": 0.50e-06},
    "anthropic/claude-haiku-4-5-20251001": {"input": 1.00e-06, "output": 5.00e-06},
    "google/gemini-2.5-flash":          {"input": 0.60e-06, "output": 4.50e-06},
    "openai/gpt-5-mini":                {"input": 0.25e-06, "output": 2.00e-06},
    "openai/gpt-5-nano":                {"input": 0.05e-06, "output": 0.40e-06},
    "xai/grok-4-fast-non-reasoning":    {"input": 0.20e-06, "output": 0.50e-06},
    "google/gemini-2.5-pro":            {"input": 1.25e-06, "output": 10.00e-06},
    "google/gemini-2.0-flash":          {"input": 0.60e-06, "output": 4.50e-06},
    "openai/gpt-4-32k":                 {"input": 3.00e-06, "output": 12.00e-06}
}
def get_cost(model, input_token, output_token):
   return .14*(cost_per_token[model]["input"]*input_token +  cost_per_token[model]["output"]*output_token)