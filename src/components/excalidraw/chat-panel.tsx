import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { 
  Send, 
  Loader2, 
  Plus, 
  Trash2, 
  MessageSquare, 
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { useChatHistory, type ChatMessage } from './use-chat-history'
import { parseExcalidrawElements, type ExcalidrawElement } from './element-parser'
import { streamChat, isConfigValid, getAIConfig } from '@/lib/ai'

interface ChatPanelProps {
  className?: string
  onElementsGenerated?: (elements: ExcalidrawElement[]) => void
}

export function ChatPanel({ className, onElementsGenerated }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isComposing, setIsComposing] = useState(false) // 输入法组合状态
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const {
    sessions,
    currentSession,
    currentSessionId,
    isLoaded,
    createSession,
    addMessage,
    updateMessage,
    deleteSession,
    switchSession,
  } = useChatHistory()

  // 滚动到底部（只在消息容器内滚动，不影响页面）
  const scrollToBottom = useCallback(() => {
    const container = messagesEndRef.current?.parentElement
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [currentSession?.messages, scrollToBottom])

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    // 检查配置
    if (!isConfigValid(getAIConfig())) {
      alert('请先点击右上角设置按钮配置 AI API')
      return
    }

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

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
        }
      },
      (error) => {
        console.error('Chat error:', error)
        updateMessage(sessionId!, assistantMessageId, `抱歉，发生了错误：${error.message}`)
      }
    )

    // 最终解析
    const { elements } = parseExcalidrawElements(fullText, processedLength)
    if (elements.length > 0) {
      onElementsGenerated?.(elements)
    }

    setIsLoading(false)
  }

  // 处理按键（输入法激活时不发送）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  // 新建对话
  const handleNewChat = () => {
    createSession()
    setIsSidebarOpen(false)
  }

  if (!isLoaded) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className={cn('flex h-full', className)}>
      {/* 侧边栏 - 会话列表 */}
      <div className={cn(
        'absolute md:relative z-10 h-full bg-card border-r border-border transition-all duration-300',
        isSidebarOpen ? 'w-64' : 'w-0 md:w-0'
      )}>
        {isSidebarOpen && (
          <div className="flex flex-col h-full p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="w-full mb-3 gap-2"
            >
              <Plus className="w-4 h-4" />
              新对话
            </Button>
            
            <div className="flex-1 overflow-y-auto space-y-1">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                    session.id === currentSessionId
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-secondary/50'
                  )}
                  onClick={() => {
                    switchSession(session.id)
                    setIsSidebarOpen(false)
                  }}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate text-sm">{session.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(session.id)
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* 顶部栏 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/5">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>AI 绘图助手</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1.5 text-xs"
            onClick={handleNewChat}
          >
            <Plus className="w-3.5 h-3.5" />
            新对话
          </Button>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {(!currentSession || currentSession.messages.length === 0) && (
            <div className="flex flex-col items-center justify-center h-full text-center text-foreground/50">
              <Sparkles className="w-12 h-12 mb-4 text-primary/30" />
              <p className="text-lg font-medium mb-2">AI 绘图助手</p>
              <p className="text-sm max-w-xs">
                描述你想要绘制的图形，AI 会自动生成并渲染到画布上
              </p>
              <div className="mt-6 space-y-2 text-xs text-foreground/40">
                <p>💡 试试这些：</p>
                <p>「画一个简单的流程图：开始→处理→结束」</p>
                <p>「画一个前后端架构图」</p>
                <p>「用矩形和箭头画一个组织架构」</p>
              </div>
            </div>
          )}
          
          {currentSession?.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          
          {isLoading && (
            <div className="flex items-center gap-2 text-foreground/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">AI 正在思考...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="p-3 border-t border-border bg-card">
          <Card className="flex items-end gap-2 p-2 bg-secondary/5 border-border/50">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="描述你想要绘制的图形..."
              className="min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent focus-visible:ring-0 p-2"
              disabled={isLoading}
            />
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
      </div>
    </div>
  )
}

/**
 * 消息气泡组件
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-secondary/50 text-foreground rounded-bl-md'
        )}
      >
        <div className="whitespace-pre-wrap break-words">
          {isUser ? (
            message.content
          ) : (
            <AssistantMessage content={message.content} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 移除文本中的 JSON 对象（支持嵌套）
 */
function removeJsonObjects(text: string): string {
  let result = ''
  let i = 0
  
  while (i < text.length) {
    if (text[i] === '{') {
      // 尝试跳过完整的 JSON 对象
      let depth = 0
      let inString = false
      let escape = false
      let j = i
      
      for (; j < text.length; j++) {
        const char = text[j]
        
        if (escape) {
          escape = false
          continue
        }
        if (char === '\\' && inString) {
          escape = true
          continue
        }
        if (char === '"') {
          inString = !inString
          continue
        }
        if (inString) continue
        
        if (char === '{') depth++
        else if (char === '}') {
          depth--
          if (depth === 0) {
            // 检查是否是 Excalidraw 元素
            const jsonStr = text.slice(i, j + 1)
            if (/"type"\s*:\s*"(rectangle|ellipse|diamond|text|arrow|line)"/.test(jsonStr)) {
              // 跳过这个 JSON
              i = j + 1
              break
            } else {
              // 保留非元素 JSON
              result += text[i]
              i++
              break
            }
          }
        }
      }
      
      // JSON 未完成，保留当前字符
      if (depth !== 0) {
        result += text[i]
        i++
      }
    } else {
      result += text[i]
      i++
    }
  }
  
  return result.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 助手消息组件 - 隐藏 JSON 元素，只显示文本
 */
function AssistantMessage({ content }: { content: string }) {
  const displayContent = removeJsonObjects(content)
  
  if (!displayContent) {
    // 检查原始内容是否包含 JSON 元素
    const hasElements = /"type"\s*:\s*"(rectangle|ellipse|diamond|text|arrow|line)"/.test(content)
    if (hasElements) {
      return <span className="text-foreground/50 italic">✨ 图形已生成到画布</span>
    }
    return <span className="text-foreground/50 italic">正在生成...</span>
  }
  
  return <>{displayContent}</>
}

