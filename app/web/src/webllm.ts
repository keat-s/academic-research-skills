import type { ChatMessage } from "@ars/core";
import type { StreamChunk } from "@ars/core";

// In-browser inference via WebLLM (WebGPU). Fully client-side: no server, no
// key, no quota, fully private. The engine + model weights are lazy-loaded on
// first use (large download, cached by the browser afterwards).

export interface WebLLMModel {
  id: string;
  label: string;
  sizeMB: number;
}

// Curated small instruct models that run on consumer GPUs. ids are validated
// against @mlc-ai/web-llm's prebuiltAppConfig.
export const WEBLLM_MODELS: WebLLMModel[] = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 0.5B (smallest)", sizeMB: 945 },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", sizeMB: 879 },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", sizeMB: 1630 },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B (best quality)", sizeMB: 2264 },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi-3.5 mini", sizeMB: 3672 },
];

export const DEFAULT_WEBLLM_MODEL = WEBLLM_MODELS[1]!.id;

export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export interface InitProgress {
  progress: number; // 0..1
  text: string;
}

// One engine instance per model id, reused across turns.
const engines = new Map<string, Promise<any>>();

async function getEngine(modelId: string, onProgress?: (p: InitProgress) => void): Promise<any> {
  let existing = engines.get(modelId);
  if (!existing) {
    existing = (async () => {
      const webllm = await import("@mlc-ai/web-llm");
      return webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (r: { progress: number; text: string }) =>
          onProgress?.({ progress: r.progress, text: r.text }),
      });
    })();
    engines.set(modelId, existing);
    // If init fails, drop the cached promise so a retry can re-create it.
    existing.catch(() => engines.delete(modelId));
  }
  return existing;
}

/** Stream a completion from a local WebLLM engine. */
export async function* streamWebLLM(
  modelId: string,
  body: { messages: ChatMessage[]; temperature?: number },
  opts: { onProgress?: (p: InitProgress) => void; signal?: AbortSignal } = {}
): AsyncGenerator<StreamChunk> {
  const engine = await getEngine(modelId, opts.onProgress);
  const completion = await engine.chat.completions.create({
    messages: body.messages,
    temperature: body.temperature ?? 0.4,
    stream: true,
  });
  for await (const chunk of completion) {
    if (opts.signal?.aborted) {
      try {
        await engine.interruptGenerate();
      } catch {
        /* ignore */
      }
      break;
    }
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield { delta, done: false };
  }
  yield { delta: "", done: true };
}
