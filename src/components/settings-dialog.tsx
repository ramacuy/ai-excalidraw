import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Settings, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getAIConfig, saveAIConfig, isConfigValid, type AIConfig } from '@/lib/ai'

interface SettingsDialogProps {
  onConfigChange?: (config: AIConfig) => void
}

export function SettingsDialog({ onConfigChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<AIConfig>({
    apiKey: '',
    baseURL: '',
    model: 'gpt-4o',
  })
  const [saved, setSaved] = useState(false)

  // 加载配置
  useEffect(() => {
    const loadedConfig = getAIConfig()
    setConfig(loadedConfig)
    
    // 如果配置无效，自动打开设置
    if (!isConfigValid(loadedConfig)) {
      setOpen(true)
    }
  }, [])

  const handleSave = () => {
    saveAIConfig(config)
    onConfigChange?.(config)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setOpen(false)
    }, 1000)
  }

  const isValid = isConfigValid(config)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8" title="API 设置">
          <Settings className="w-4 h-4" />
        </Button>
      </Dialog.Trigger>
      
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-xl bg-card border border-border shadow-xl p-6 animate-in fade-in">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-lg font-semibold">
              AI API 设置
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8">
                <X className="w-4 h-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Base URL</label>
              <Input
                value={config.baseURL}
                onChange={(e) => setConfig({ ...config, baseURL: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">
                支持 OpenAI 兼容的 API，如智谱、阿里百炼等
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">模型</label>
              <Input
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="gpt-4o"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={!isValid}
              className={cn(saved && 'bg-green-600 hover:bg-green-600')}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  已保存
                </>
              ) : (
                '保存'
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

