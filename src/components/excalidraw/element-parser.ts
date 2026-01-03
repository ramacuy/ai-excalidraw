/**
 * Excalidraw 元素流式解析器
 * 从 AI 返回的流式文本中解析 Excalidraw 元素（纯 JSON 格式）
 */

export interface ExcalidrawElement {
  id: string
  type: 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'arrow' | 'line'
  x: number
  y: number
  width: number
  height: number
  angle: number
  strokeColor: string
  backgroundColor: string
  fillStyle: 'solid' | 'hachure' | 'cross-hatch'
  strokeWidth: number
  roughness: number
  opacity: number
  seed: number
  // text 元素特有
  text?: string
  fontSize?: number
  fontFamily?: number
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  // arrow/line 元素特有
  points?: number[][]
  startArrowhead?: 'arrow' | 'bar' | 'dot' | 'triangle' | null
  endArrowhead?: 'arrow' | 'bar' | 'dot' | 'triangle' | null
}

export interface ParseResult {
  elements: ExcalidrawElement[]
  remainingBuffer: string
}

/**
 * 从文本中提取完整的 JSON 对象（支持嵌套）
 */
function extractJsonObjects(text: string): { json: string; endIndex: number }[] {
  const results: { json: string; endIndex: number }[] = []
  let i = 0
  
  while (i < text.length) {
    // 找到下一个 { 
    const startIndex = text.indexOf('{', i)
    if (startIndex === -1) break
    
    // 尝试提取完整的 JSON 对象
    let depth = 0
    let inString = false
    let escape = false
    let endIndex = -1
    
    for (let j = startIndex; j < text.length; j++) {
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
      
      if (char === '{') {
        depth++
      } else if (char === '}') {
        depth--
        if (depth === 0) {
          endIndex = j + 1
          break
        }
      }
    }
    
    if (endIndex > startIndex) {
      results.push({
        json: text.slice(startIndex, endIndex),
        endIndex,
      })
      i = endIndex
    } else {
      // JSON 未完成，停止解析
      break
    }
  }
  
  return results
}

/**
 * 从文本中解析 Excalidraw 元素（纯 JSON 格式）
 * @param text 完整的累积文本
 * @param processedLength 已处理的长度
 * @returns 解析结果
 */
export function parseExcalidrawElements(
  text: string,
  processedLength: number = 0
): ParseResult {
  const elements: ExcalidrawElement[] = []
  const newText = text.slice(processedLength)
  
  // 提取所有完整的 JSON 对象
  const jsonObjects = extractJsonObjects(newText)
  let lastIndex = 0
  
  for (const { json, endIndex } of jsonObjects) {
    try {
      const element = JSON.parse(json) as ExcalidrawElement
      
      // 验证是否为有效的 Excalidraw 元素
      const validTypes = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line']
      if (
        element.id && 
        element.type && 
        validTypes.includes(element.type) &&
        typeof element.x === 'number' && 
        typeof element.y === 'number'
      ) {
        // 添加默认值和类型特定字段
        const finalElement = {
          ...getDefaultElementProps(),
          ...getTypeSpecificProps(element.type, element),
          ...element,
        }
        elements.push(finalElement as ExcalidrawElement)
      }
      // 无论解析是否成功，都更新 lastIndex，避免卡住
      lastIndex = endIndex
    } catch {
      // JSON 解析失败，跳过这个对象，继续处理下一个
      console.warn('Failed to parse element:', json.slice(0, 100))
      lastIndex = endIndex
    }
  }
  
  // 计算新的已处理长度
  const newProcessedLength = processedLength + lastIndex
  
  return {
    elements,
    remainingBuffer: text.slice(newProcessedLength),
  }
}

/**
 * 获取元素默认属性（包含 Excalidraw 必需字段）
 */
function getDefaultElementProps(): Record<string, unknown> {
  return {
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
    seed: Math.floor(Math.random() * 100000),
    // Excalidraw 必需字段
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000000),
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  }
}

/**
 * 获取类型特定的默认属性
 */
function getTypeSpecificProps(type: string, element: Partial<ExcalidrawElement>): Record<string, unknown> {
  if (type === 'text') {
    return {
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      baseline: 18,
      containerId: null,
      originalText: element.text || '',
      lineHeight: 1.25,
    }
  }
  
  if (type === 'arrow' || type === 'line') {
    return {
      points: element.points || [[0, 0], [element.width || 100, element.height || 0]],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: type === 'arrow' ? 'arrow' : null,
    }
  }
  
  // 其他形状类型
  return {
    roundness: { type: 3 },
  }
}

/**
 * 检查是否有未完成的 JSON 对象
 * 用于判断是否还在等待更多内容
 */
export function hasIncompleteBlock(text: string): boolean {
  // 检查是否有未闭合的 { 
  const lastOpenBrace = text.lastIndexOf('{')
  const lastCloseBrace = text.lastIndexOf('}')
  return lastOpenBrace > lastCloseBrace
}

/**
 * 生成唯一元素 ID
 */
export function generateElementId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

