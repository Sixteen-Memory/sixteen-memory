import { fail } from "./domain";

/** Generic public-provider options. Never infer capabilities from a model name. */
export function generationOptions(limit: number, tokenParameter = "max_tokens", thinking = ""): Record<string, unknown> {
  if (!["max_tokens", "max_completion_tokens"].includes(tokenParameter)) fail(503, "provider_config", "输出上限参数配置无效");
  if (!["", "enabled", "disabled"].includes(thinking)) fail(503, "provider_config", "模型思考模式配置无效");
  return {
    [tokenParameter]: limit,
    ...(thinking === "" ? {} : { enable_thinking: thinking === "enabled" }),
  };
}
