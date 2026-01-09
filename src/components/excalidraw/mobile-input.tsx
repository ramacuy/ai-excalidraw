import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Send, Loader2, Trash2 } from 'lucide-react'
import { useChatHistory } from './use-chat-history'
import { parseExcalidrawElements, type ParsedElement } from './element-parser'
import { streamChat, isConfigValid, getAIConfig } from '@/lib/ai'

interface MobileInputProps {
  onElementsGenerated?: (elements: ParsedElement[]) => void
  onLoadingChange?: (loading: boolean) => void
  onClearCanvas?: () => void
  showToast?: (message: string, duration?: number) => void
}

export function MobileInput({ 
  onElementsGenerated, 
  onLoadingChange,
  onClearCanvas,
  showToast 
}: MobileInputProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const {
    currentSessionId,
    createSession,
    addMessage,
    updateMessage,
  } = useChatHistory()

  // 更新加载状态
  const updateLoading = (loading: boolean) => {
    setIsLoading(loading)
    onLoadingChange?.(loading)
  }

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    // 检查配置
    if (!isConfigValid(getAIConfig())) {
      showToast?.('请先配置 AI API', 3000)
      return
    }

    const userMessage = input.trim()
    setInput('')
    updateLoading(true)

    // 确保有会话
    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = createSession()
    }

    // 添加用户消息
    addMessage(sessionId, 'user', userMessage)

    // 添加空的助手消息占位
    const assistantMessageId = addMessage(sessionId, 'assistant', '')

    let fullText = ''
    let processedLength = 0
    let hasGeneratedElements = false

    await streamChat(
      userMessage,
      (chunk) => {
        fullText += chunk
        updateMessage(sessionId!, assistantMessageId, fullText)

        // 解析元素并渲染
        const { elements, remainingBuffer } = parseExcalidrawElements(fullText, processedLength)
        if (elements.length > 0) {
          onElementsGenerated?.(elements)
          processedLength = fullText.length - remainingBuffer.length
          hasGeneratedElements = true
        }
      },
      (error) => {
        console.error('Chat error:', error)
        updateMessage(sessionId!, assistantMessageId, `抱歉，发生了错误：${error.message}`)
        showToast?.('生成失败，请重试', 2000)
      }
    )

    // 最终解析
    const { elements } = parseExcalidrawElements(fullText, processedLength)
    if (elements.length > 0) {
      onElementsGenerated?.(elements)
      hasGeneratedElements = true
    }

    // 显示完成提示
    if (hasGeneratedElements) {
      showToast?.('✨ 图形已生成到画布', 2000)
    }

    updateLoading(false)
  }

  // 处理按键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 p-3 safe-area-inset-bottom">
      <Card className="flex items-end gap-2 p-2 bg-secondary/5 border-border/50">
        {/* 清空按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 w-9 h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onClearCanvas}
          disabled={isLoading}
          title="清空画布"
        >
          <Trash2 className="w-4 h-4" />
        </Button>

        {/* 输入框 */}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder="描述你想要绘制的图形..."
          className="min-h-[40px] max-h-[80px] resize-none border-0 bg-transparent focus-visible:ring-0 p-2 text-base"
          disabled={isLoading}
        />

        {/* 发送按钮 */}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="shrink-0 w-9 h-9"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </Card>
    </div>
  )
}

