import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElement = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawImperativeAPI = any
import '@excalidraw/excalidraw/index.css'

export interface ExcalidrawWrapperRef {
  addElements: (elements: ExcalidrawElement[]) => void
  clearCanvas: () => void
  getElements: () => readonly ExcalidrawElement[]
}

interface ExcalidrawWrapperProps {
  className?: string
  onElementsChange?: (elements: readonly ExcalidrawElement[]) => void
  zenModeEnabled?: boolean // 禅模式：隐藏大部分 UI 元素
}

const STORAGE_KEY = 'excalidraw-canvas-data'

/**
 * 从 localStorage 加载画布数据
 */
function loadCanvasData(): { elements: ExcalidrawElement[] } | null {
  if (typeof window === 'undefined') return null
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return null
    const parsed = JSON.parse(data)
    // 确保 elements 是数组且每个元素都有效
    if (parsed && Array.isArray(parsed.elements)) {
      // 过滤掉无效元素，确保每个元素都有必需字段
      const validElements = parsed.elements.filter((el: ExcalidrawElement) => 
        el && el.id && el.type && typeof el.x === 'number' && typeof el.y === 'number'
      )
      if (validElements.length > 0) {
        return { elements: validElements }
      }
    }
    // 数据无效，清除它
    localStorage.removeItem(STORAGE_KEY)
    return null
  } catch {
    // 解析失败，清除损坏的数据
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

/**
 * 保存画布数据到 localStorage
 */
function saveCanvasData(elements: readonly ExcalidrawElement[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements }))
  } catch {
    console.warn('Failed to save canvas data')
  }
}

export const ExcalidrawWrapper = forwardRef<ExcalidrawWrapperRef, ExcalidrawWrapperProps>(
  function ExcalidrawWrapper({ className, onElementsChange, zenModeEnabled = false }, ref) {
    const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)
    // 使用懒初始化确保首次渲染时就有数据
    const [initialData] = useState(() => loadCanvasData())

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      addElements: (newElements: ExcalidrawElement[]) => {
        const api = excalidrawAPIRef.current
        if (!api || !newElements || newElements.length === 0) return

        const currentElements = api.getSceneElements()
        const existingIds = new Set(currentElements.map((el: ExcalidrawElement) => el.id))
        
        // 处理元素，如果 id 冲突则生成新 id
        const elementsToAdd = newElements.map(el => {
          if (existingIds.has(el.id)) {
            // id 冲突，生成新 id
            const newId = `${el.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            existingIds.add(newId) // 防止同批次元素 id 冲突
            return { ...el, id: newId }
          }
          existingIds.add(el.id)
          return el
        })
        
        if (elementsToAdd.length > 0) {
          api.updateScene({
            elements: [...currentElements, ...elementsToAdd],
          })
        }
      },
      clearCanvas: () => {
        const api = excalidrawAPIRef.current
        if (!api) return
        api.updateScene({ elements: [] })
        localStorage.removeItem(STORAGE_KEY)
      },
      getElements: () => {
        const api = excalidrawAPIRef.current
        return api ? api.getSceneElements() : []
      },
    }), [])

    // 处理变更
    const handleChange = useCallback((elements: readonly ExcalidrawElement[]) => {
      // 过滤掉已删除的元素
      const activeElements = elements.filter(el => !el.isDeleted)
      saveCanvasData(activeElements)
      onElementsChange?.(activeElements)
    }, [onElementsChange])

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

