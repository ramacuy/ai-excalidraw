import { EXCALIDRAW_SYSTEM_PROMPT } from './prompt'

export interface AIConfig {
  apiKey: string
  baseURL: string
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'ai-excalidraw-config'

/**
 * 获取 AI 配置（优先环境变量，其次 localStorage）
 */
export function getAIConfig(): AIConfig {
  // 优先从环境变量读取
  const envConfig: AIConfig = {
    apiKey: import.meta.env.VITE_AI_API_KEY || '',
    baseURL: import.meta.env.VITE_AI_BASE_URL || '',
    model: import.meta.env.VITE_AI_MODEL || 'gpt-4o',
  }

  // 如果环境变量已配置，直接返回
  if (envConfig.apiKey && envConfig.baseURL) {
    return envConfig
  }

  // 否则从 localStorage 读取
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AIConfig>
      return {
        apiKey: parsed.apiKey || envConfig.apiKey,
        baseURL: parsed.baseURL || envConfig.baseURL,
        model: parsed.model || envConfig.model,
      }
    }
  } catch {
    // ignore
  }

  return envConfig
}

/**
 * 保存 AI 配置到 localStorage
 */
export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    console.warn('Failed to save AI config')
  }
}

/**
 * 检查配置是否有效
 */
export function isConfigValid(config: AIConfig): boolean {
  return !!(config.apiKey && config.baseURL && config.model)
}

/**
 * 流式调用 AI API
 */
export async function streamChat(
  userMessage: string,
  onChunk: (content: string) => void,
  onError?: (error: Error) => void,
  config?: AIConfig
): Promise<void> {
  const finalConfig = config || getAIConfig()

  if (!isConfigValid(finalConfig)) {
    onError?.(new Error('请先配置 AI API'))
    return
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: EXCALIDRAW_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  try {
    const response = await fetch(`${finalConfig.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: finalConfig.model,
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 请求失败: ${response.status} ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 按行处理 SSE 格式
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留最后不完整的行

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.delta?.content || ''
          if (content) {
            onChunk(content)
          }
        } catch {
          // 解析失败，可能是不完整的 JSON，跳过
        }
      }
    }

    // 处理最后的 buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
        try {
          const json = JSON.parse(trimmed.slice(6))
          const content = json.choices?.[0]?.delta?.content || ''
          if (content) {
            onChunk(content)
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)))
  }
}

