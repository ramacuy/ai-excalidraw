import { useState, useEffect, useCallback } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'excalidraw-ai-chat-history'
const MAX_SESSIONS = 50

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 从 localStorage 加载会话
 */
function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * 保存会话到 localStorage
 */
function saveSessions(sessions: ChatSession[]): void {
  if (typeof window === 'undefined') return
  try {
    // 只保留最近的会话
    const trimmed = sessions.slice(0, MAX_SESSIONS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    console.warn('Failed to save chat sessions')
  }
}

/**
 * 对话历史 Hook
 */
export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // 初始加载
  useEffect(() => {
    const loaded = loadSessions()
    setSessions(loaded)
    if (loaded.length > 0) {
      setCurrentSessionId(loaded[0].id)
    }
    setIsLoaded(true)
  }, [])

  // 保存变更
  useEffect(() => {
    if (isLoaded) {
      saveSessions(sessions)
    }
  }, [sessions, isLoaded])

  // 获取当前会话
  const currentSession = sessions.find(s => s.id === currentSessionId) || null

  // 创建新会话
  const createSession = useCallback((title?: string): string => {
    const newSession: ChatSession = {
      id: generateId(),
      title: title || `新对话 ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions(prev => [newSession, ...prev])
    setCurrentSessionId(newSession.id)
    return newSession.id
  }, [])

  // 添加消息
  const addMessage = useCallback((
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): string => {
    const messageId = generateId()
    setSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session
      
      const newMessage: ChatMessage = {
        id: messageId,
        role,
        content,
        timestamp: Date.now(),
      }
      
      // 更新标题（使用第一条用户消息）
      let title = session.title
      if (role === 'user' && session.messages.length === 0) {
        title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
      }
      
      return {
        ...session,
        title,
        messages: [...session.messages, newMessage],
        updatedAt: Date.now(),
      }
    }))
    return messageId
  }, [])

  // 更新消息内容（用于流式更新）
  const updateMessage = useCallback((
    sessionId: string,
    messageId: string,
    content: string
  ) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        messages: session.messages.map(msg =>
          msg.id === messageId ? { ...msg, content } : msg
        ),
        updatedAt: Date.now(),
      }
    }))
  }, [])

  // 删除会话
  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId)
      // 如果删除的是当前会话，切换到第一个
      if (sessionId === currentSessionId && filtered.length > 0) {
        setCurrentSessionId(filtered[0].id)
      } else if (filtered.length === 0) {
        setCurrentSessionId(null)
      }
      return filtered
    })
  }, [currentSessionId])

  // 清空所有会话
  const clearAllSessions = useCallback(() => {
    setSessions([])
    setCurrentSessionId(null)
  }, [])

  // 切换会话
  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
  }, [])

  return {
    sessions,
    currentSession,
    currentSessionId,
    isLoaded,
    createSession,
    addMessage,
    updateMessage,
    deleteSession,
    clearAllSessions,
    switchSession,
  }
}

