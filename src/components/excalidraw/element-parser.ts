/**
 * Excalidraw 元素流式解析器
 * 从 AI 返回的流式文本中解析 Excalidraw 元素（纯 JSON 格式）
 */

/**
 * 解析后的元素（可能是完整新建元素或部分更新元素）
 * - 新建元素：必须包含 id, type, x, y, width, height
 * - 更新元素：只需包含 id 和要修改的属性
 */
export interface ParsedElement {
  id: string
  type?: string
  [key: string]: unknown
}

export interface ParseResult {
  elements: ParsedElement[]
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
 * 只解析 JSON，不添加默认值（默认值由调用方根据是否为新建元素决定）
 * @param text 完整的累积文本
 * @param processedLength 已处理的长度
 * @returns 解析结果
 */
export function parseExcalidrawElements(
  text: string,
  processedLength: number = 0
): ParseResult {
  const elements: ParsedElement[] = []
  const newText = text.slice(processedLength)
  
  // 提取所有完整的 JSON 对象
  const jsonObjects = extractJsonObjects(newText)
  let lastIndex = 0
  
  for (const { json, endIndex } of jsonObjects) {
    try {
      const element = JSON.parse(json) as ParsedElement
      
      // 只验证 id 是否存在（更新元素只需要 id）
      // 对于新建元素，还需要 type、x、y，但这由调用方验证
      if (element.id) {
        elements.push(element)
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
export function getDefaultElementProps(): Record<string, unknown> {
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
export function getTypeSpecificProps(type: string, element: ParsedElement): Record<string, unknown> {
  if (type === 'text') {
    return {
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      baseline: 18,
      containerId: null,
      originalText: (element.text as string) || '',
      lineHeight: 1.25,
    }
  }
  
  if (type === 'arrow' || type === 'line') {
    const width = (element.width as number) || 100
    const height = (element.height as number) || 0
    return {
      points: element.points || [[0, 0], [width, height]],
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

