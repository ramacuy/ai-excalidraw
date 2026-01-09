import { useRef, useCallback, useState, useEffect } from 'react'
import { ExcalidrawWrapper, type ExcalidrawWrapperRef } from './wrapper'
import { ChatPanel } from './chat-panel'
import { MobileInput } from './mobile-input'
import type { ParsedElement } from './element-parser'
import { Button } from '@/components/ui/button'
import { Trash2, PanelLeftClose, PanelLeft, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SettingsDialog } from '@/components/settings-dialog'

interface ExcalidrawEditorProps {
  className?: string
}

// 检测是否为移动端
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  return isMobile
}

export function ExcalidrawEditor({ className }: ExcalidrawEditorProps) {
  const excalidrawRef = useRef<ExcalidrawWrapperRef>(null)
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const isMobile = useIsMobile()

  // 处理 AI 生成的元素
  const handleElementsGenerated = useCallback((elements: ParsedElement[]) => {
    excalidrawRef.current?.addElements(elements)
  }, [])

  // 处理选择变化
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelectionChange = useCallback((selectedElements: any[]) => {
    // 这里可以通过状态传递给 ChatPanel，但为了简化，我们使用轮询方式在 ChatPanel 中检测
    void selectedElements
  }, [])

  // 清空画布
  const handleClearCanvas = useCallback(() => {
    if (confirm('确定要清空画布吗？')) {
      excalidrawRef.current?.clearCanvas()
    }
  }, [])

  // 显示顶部提示
  const showToast = useCallback((message: string, duration = 3000) => {
    setToastMessage(message)
    if (duration > 0) {
      setTimeout(() => setToastMessage(null), duration)
    }
  }, [])

  // 隐藏提示
  const hideToast = useCallback(() => {
    setToastMessage(null)
  }, [])

  // 移动端布局
  if (isMobile) {
    return (
      <div className={cn('flex flex-col h-full relative', className)}>
        {/* 顶部工具栏 */}
        <div className="absolute top-2 right-2 z-50">
          <SettingsDialog />
        </div>

        {/* 顶部提示弹框 */}
        {(isGenerating || toastMessage) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg">
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">AI 正在绘图中...</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">{toastMessage}</span>
                  <button onClick={hideToast} className="ml-1 hover:opacity-70">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 上方：Excalidraw 画布 */}
        <div className="flex-1 min-h-0">
          <ExcalidrawWrapper 
            ref={excalidrawRef}
            className="h-full"
            zenModeEnabled={true}
            onSelectionChange={handleSelectionChange}
          />
        </div>

        {/* 下方：固定输入框 */}
        <MobileInput
          onElementsGenerated={handleElementsGenerated}
          onLoadingChange={setIsGenerating}
          onClearCanvas={handleClearCanvas}
          showToast={showToast}
        />
      </div>
    )
  }

  // 桌面端布局
  return (
    <div className={cn('flex h-full', className)}>
      {/* 左侧：AI 对话面板 */}
      <div className={cn(
        'border-r border-border bg-card transition-all duration-300 flex flex-col',
        isChatOpen ? 'w-[380px]' : 'w-0'
      )}>
        {isChatOpen && (
          <ChatPanel 
            className="flex-1 min-h-0"
            onElementsGenerated={handleElementsGenerated}
            excalidrawRef={excalidrawRef}
          />
        )}
      </div>

      {/* 右侧：Excalidraw 画布 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/5">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={() => setIsChatOpen(!isChatOpen)}
            title={isChatOpen ? '关闭 AI 面板' : '打开 AI 面板'}
          >
            {isChatOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </Button>
          
          <div className="flex-1" />

          <SettingsDialog />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCanvas}
            className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空画布
          </Button>
        </div>

        {/* 画布 */}
        <ExcalidrawWrapper 
          ref={excalidrawRef}
          className="flex-1"
          onSelectionChange={handleSelectionChange}
        />
      </div>
    </div>
  )
}

export default ExcalidrawEditor
