import { EXCALIDRAW_SYSTEM_PROMPT } from './prompt'
import type { ElementSummary } from '@/components/excalidraw/wrapper'

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
 * 构建包含选中元素信息的用户消息
 */
function buildUserMessage(userMessage: string, selectedElements?: ElementSummary[]): string {
  if (!selectedElements || selectedElements.length === 0) {
    return userMessage
  }

  // 构建选中元素的上下文
  const elementsContext = selectedElements.map(el => {
    const parts = [`id: ${el.id}`, `type: ${el.type}`]
    if (el.text) parts.push(`text: "${el.text}"`)
    parts.push(`position: (${el.x}, ${el.y})`)
    parts.push(`size: ${el.width}x${el.height}`)
    if (el.strokeColor) parts.push(`strokeColor: ${el.strokeColor}`)
    if (el.backgroundColor) parts.push(`backgroundColor: ${el.backgroundColor}`)
    return `- ${parts.join(', ')}`
  }).join('\n')

  return `用户选中了以下 ${selectedElements.length} 个元素，请基于这些元素进行修改：
${elementsContext}

用户的请求：${userMessage}

注意：修改现有元素时，请保持相同的 id，这样会更新而不是新建元素。`
}

/**
 * 流式调用 AI API
 */
export async function streamChat(
  userMessage: string,
  onChunk: (content: string) => void,
  onError?: (error: Error) => void,
  config?: AIConfig,
  selectedElements?: ElementSummary[]
): Promise<void> {
  const finalConfig = config || getAIConfig()

  if (!isConfigValid(finalConfig)) {
    onError?.(new Error('请先配置 AI API'))
    return
  }

  // 构建带有选中元素上下文的用户消息
  const contextualMessage = buildUserMessage(userMessage, selectedElements)

  const messages: ChatMessage[] = [
    { role: 'system', content: EXCALIDRAW_SYSTEM_PROMPT },
    { role: 'user', content: contextualMessage },
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
