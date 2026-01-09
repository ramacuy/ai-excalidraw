import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import { getDefaultElementProps, getTypeSpecificProps, type ParsedElement } from './element-parser'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElement = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawImperativeAPI = any
import '@excalidraw/excalidraw/index.css'

export interface ElementSummary {
  id: string
  type: string
  text?: string
  x: number
  y: number
  width: number
  height: number
  strokeColor?: string
  backgroundColor?: string
  containerId?: string  // 如果是绑定在形状内的文字，这里是容器形状的 id
}

export interface ExcalidrawWrapperRef {
  addElements: (elements: ParsedElement[]) => void
  clearCanvas: () => void
  getElements: () => readonly ExcalidrawElement[]
  getSelectedElements: () => ExcalidrawElement[]
  getCanvasState: () => ElementSummary[]
  getSelectedElementsSummary: () => ElementSummary[]
  /** 
   * 切换到指定会话的画布（会自动保存当前画布）
   * @param sessionId 目标会话 ID
   * @param useIndependentCanvas 是否使用独立画布（新会话为 true，老会话为 false）
   */
  switchToSession: (sessionId: string | null, useIndependentCanvas?: boolean) => void
  /** 获取当前会话 ID */
  getCurrentSessionId: () => string | null
  /** 检查 Excalidraw API 是否已准备好 */
  isReady: () => boolean
}

interface ExcalidrawWrapperProps {
  className?: string
  onElementsChange?: (elements: readonly ExcalidrawElement[]) => void
  onSelectionChange?: (selectedElements: ExcalidrawElement[]) => void
  zenModeEnabled?: boolean // 禅模式：隐藏大部分 UI 元素
  /** 初始会话 ID */
  initialSessionId?: string | null
}

const STORAGE_KEY_BASE = 'excalidraw-canvas-data'
// 兼容性：共享画布 key（用于老会话）
const SHARED_STORAGE_KEY = 'excalidraw-canvas-data'

/**
 * 获取会话对应的存储 key
 * @param sessionId 会话 ID
 * @param useIndependentCanvas 是否使用独立画布
 */
function getStorageKey(sessionId: string | null, useIndependentCanvas: boolean): string {
  // 老会话（useIndependentCanvas 为 false）或无会话时，使用共享画布
  if (!useIndependentCanvas || !sessionId) return SHARED_STORAGE_KEY
  // 新会话使用独立画布
  return `${STORAGE_KEY_BASE}-${sessionId}`
}

/**
 * 从 localStorage 加载画布数据
 * @param sessionId 会话 ID
 * @param useIndependentCanvas 是否使用独立画布
 * @returns 数据对象，或 null 表示没有该会话的数据
 */
function loadCanvasData(sessionId: string | null, useIndependentCanvas: boolean): { elements: ExcalidrawElement[] } | null {
  if (typeof window === 'undefined') return null
  
  const storageKey = getStorageKey(sessionId, useIndependentCanvas)
  
  try {
    const data = localStorage.getItem(storageKey)
    
    // 没有数据，返回 null（让调用方决定如何处理）
    if (!data) return null
    
    const parsed = JSON.parse(data)
    // 确保 elements 是数组且每个元素都有效
    if (parsed && Array.isArray(parsed.elements)) {
      // 过滤掉无效元素，确保每个元素都有必需字段
      const validElements = parsed.elements.filter((el: ExcalidrawElement) => 
        el && el.id && el.type && typeof el.x === 'number' && typeof el.y === 'number'
      )
      return { elements: validElements }
    }
    // 数据无效，清除它
    localStorage.removeItem(storageKey)
    return null
  } catch {
    // 解析失败，清除损坏的数据
    localStorage.removeItem(getStorageKey(sessionId, useIndependentCanvas))
    return null
  }
}

/**
 * 保存画布数据到 localStorage
 * @param elements 画布元素
 * @param sessionId 会话 ID
 * @param useIndependentCanvas 是否使用独立画布
 */
function saveCanvasData(elements: readonly ExcalidrawElement[], sessionId: string | null, useIndependentCanvas: boolean): void {
  if (typeof window === 'undefined') return
  const storageKey = getStorageKey(sessionId, useIndependentCanvas)
  try {
    localStorage.setItem(storageKey, JSON.stringify({ elements }))
  } catch {
    console.warn('Failed to save canvas data')
  }
}

/**
 * 将元素转换为摘要格式
 * @param el 元素
 * @param allElements 所有元素（用于查找关联的文本元素）
 */
function summarizeElement(el: ExcalidrawElement, allElements?: readonly ExcalidrawElement[]): ElementSummary {
  let text = el.text
  
  // 如果是形状元素且有绑定的文本元素，获取绑定文本的内容
  if (!text && el.boundElements && Array.isArray(el.boundElements) && allElements) {
    const boundTextElement = el.boundElements.find(
      (bound: { type: string; id: string }) => bound.type === 'text'
    )
    if (boundTextElement) {
      const textElement = allElements.find(e => e.id === boundTextElement.id)
      if (textElement && textElement.text) {
        text = textElement.text
      }
    }
  }
  
  return {
    id: el.id,
    type: el.type,
    text,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    containerId: el.containerId,  // 绑定的容器 id（文字元素会有此字段）
  }
}

export const ExcalidrawWrapper = forwardRef<ExcalidrawWrapperRef, ExcalidrawWrapperProps>(
  function ExcalidrawWrapper({ className, onElementsChange, onSelectionChange, zenModeEnabled = false, initialSessionId = null }, ref) {
    const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)
    const lastSelectedIdsRef = useRef<string[]>([])
    // 当前会话 ID
    const currentSessionIdRef = useRef<string | null>(initialSessionId)
    // 当前是否使用独立画布（初始默认 false，即使用共享画布）
    const currentUseIndependentCanvasRef = useRef<boolean>(false)
    // 使用懒初始化确保首次渲染时就有数据（初始加载共享画布）
    const [initialData] = useState(() => loadCanvasData(initialSessionId, false))

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      addElements: (newElements: ParsedElement[]) => {
        const api = excalidrawAPIRef.current
        if (!api || !newElements || newElements.length === 0) return

        const currentElements = api.getSceneElements()
        const existingElementsMap = new Map(
          currentElements.map((el: ExcalidrawElement) => [el.id, el])
        )

        // 分离需要更新的元素和需要添加的新元素
        const elementsToUpdate: ParsedElement[] = []
        const elementsToAdd: ParsedElement[] = []

        const validTypes = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line']
        
        newElements.forEach(el => {
          if (existingElementsMap.has(el.id)) {
            // ID 已存在，更新该元素（只需要 id 和要修改的属性）
            elementsToUpdate.push(el)
          } else {
            // 新元素必须有完整的必需字段
            if (
              el.type && 
              validTypes.includes(el.type as string) &&
              typeof el.x === 'number' && 
              typeof el.y === 'number'
            ) {
              elementsToAdd.push(el)
            }
          }
        })

        // 构建新的元素列表
        let updatedElements = [...currentElements]

        // 更新已存在的元素（只合并 AI 返回的属性，其他属性保持原值）
        if (elementsToUpdate.length > 0) {
          updatedElements = updatedElements.map(existingEl => {
            const update = elementsToUpdate.find(el => el.id === existingEl.id)
            if (!update) return existingEl
            // 只覆盖 AI 返回的属性，其他保持原值
            return { ...existingEl, ...update }
          })
        }

        // 添加新元素（需要添加默认值）
        if (elementsToAdd.length > 0) {
          const newElementsWithDefaults = elementsToAdd.map(el => ({
            ...getDefaultElementProps(),
            ...getTypeSpecificProps(el.type as string, el),
            ...el,
          }))
          updatedElements = [...updatedElements, ...newElementsWithDefaults]
        }

        api.updateScene({
          elements: updatedElements,
        })
      },
      clearCanvas: () => {
        const api = excalidrawAPIRef.current
        if (!api) return
        api.updateScene({ elements: [] })
        // 清除当前会话的画布数据
        const storageKey = getStorageKey(currentSessionIdRef.current, currentUseIndependentCanvasRef.current)
        localStorage.removeItem(storageKey)
      },
      getElements: () => {
        const api = excalidrawAPIRef.current
        return api ? api.getSceneElements() : []
      },
      getSelectedElements: () => {
        const api = excalidrawAPIRef.current
        if (!api) return []
        try {
          const appState = api.getAppState()
          const selectedElementIds = appState?.selectedElementIds || {}
          return api.getSceneElements().filter((el: ExcalidrawElement) =>
            selectedElementIds[el.id] === true
          )
        } catch {
          return []
        }
      },
      getCanvasState: () => {
        const api = excalidrawAPIRef.current
        if (!api) return []
        const allElements = api.getSceneElements()
        return allElements.map((el: ExcalidrawElement) => summarizeElement(el, allElements))
      },
      getSelectedElementsSummary: () => {
        const api = excalidrawAPIRef.current
        if (!api) return []
        try {
          const appState = api.getAppState()
          const selectedElementIds = appState?.selectedElementIds || {}
          const allElements = api.getSceneElements()
          const allElementsMap = new Map(allElements.map((el: ExcalidrawElement) => [el.id, el]))
          
          // 获取选中的元素
          const selectedElements = allElements.filter(
            (el: ExcalidrawElement) => selectedElementIds[el.id] === true
          )
          
          // 收集选中元素及其 boundElements
          const resultIds = new Set<string>()
          const result: ElementSummary[] = []
          
          for (const el of selectedElements) {
            // 添加选中的元素
            if (!resultIds.has(el.id)) {
              resultIds.add(el.id)
              result.push(summarizeElement(el, allElements))
            }
            
            // 添加绑定的元素（如形状内的文字）
            if (el.boundElements && Array.isArray(el.boundElements)) {
              for (const bound of el.boundElements) {
                if (!resultIds.has(bound.id)) {
                  const boundEl = allElementsMap.get(bound.id)
                  if (boundEl) {
                    resultIds.add(bound.id)
                    result.push(summarizeElement(boundEl, allElements))
                  }
                }
              }
            }
          }
          
          return result
        } catch {
          return []
        }
      },
      switchToSession: (sessionId: string | null, useIndependentCanvas = false) => {
        const api = excalidrawAPIRef.current
        if (!api) return

        // 保存当前画布到当前会话
        const currentElements = api.getSceneElements()
        const activeElements = currentElements.filter((el: ExcalidrawElement) => !el.isDeleted)
        saveCanvasData(activeElements, currentSessionIdRef.current, currentUseIndependentCanvasRef.current)

        // 更新当前会话状态
        currentSessionIdRef.current = sessionId
        currentUseIndependentCanvasRef.current = useIndependentCanvas

        // 加载目标会话的画布数据
        const newData = loadCanvasData(sessionId, useIndependentCanvas)
        
        if (newData) {
          // 有数据，加载
          api.updateScene({ elements: newData.elements })
        } else if (useIndependentCanvas) {
          // 新会话且没有数据，显示空画布
          api.updateScene({ elements: [] })
        }
        // 老会话没有数据时，保持当前画布（共享画布已经加载）
      },
      getCurrentSessionId: () => currentSessionIdRef.current,
      isReady: () => excalidrawAPIRef.current !== null,
    }), [])

    // 处理变更
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: any) => {
      // 过滤掉已删除的元素
      const activeElements = elements.filter(el => !el.isDeleted)
      // 保存到当前会话的存储
      saveCanvasData(activeElements, currentSessionIdRef.current, currentUseIndependentCanvasRef.current)
      onElementsChange?.(activeElements)

      // 检查选择变化（使用传入的 appState）
      if (appState?.selectedElementIds) {
        try {
          const currentSelectedIds = appState.selectedElementIds
          const currentKeys = Object.keys(currentSelectedIds).sort()
          const lastKeys = lastSelectedIdsRef.current.sort()
          const keysChanged = JSON.stringify(currentKeys) !== JSON.stringify(lastKeys)

          if (keysChanged) {
            lastSelectedIdsRef.current = currentKeys
            const selectedElements = elements.filter((el: ExcalidrawElement) =>
              currentSelectedIds[el.id] === true
            )
            onSelectionChange?.(selectedElements)
          }
        } catch {
          // ignore
        }
      }
    }, [onElementsChange, onSelectionChange])

    return (
      <div className={className}>
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawAPIRef.current = api
          }}
          initialData={initialData || undefined}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              loadScene: !zenModeEnabled,
              saveToActiveFile: false,
              toggleTheme: !zenModeEnabled,
              clearCanvas: false, // 由外部控制
              export: zenModeEnabled ? false : {
                saveFileToDisk: true,
              },
            },
          }}
          zenModeEnabled={zenModeEnabled}
          viewModeEnabled={false}
          langCode="zh-CN"
        />
      </div>
    )
  }
)
