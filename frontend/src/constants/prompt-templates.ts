import type { Provider } from '../types';

// 页面右侧提示词模板的最小展示结构，provider 用于按当前模型类型过滤。
export interface PromptTemplate {
  title: string;
  provider: Provider;
  category: string;
  prompt: string;
}

// 内置模板只作为快速填充提示词，不会自动提交生成任务。
export const promptTemplates: PromptTemplate[] = [
  {
    title: '角色一致性',
    provider: 'NANO_BANANA',
    category: 'Nano Banana',
    prompt: '基于参考图保持同一角色身份、发型、服装和面部特征，生成一张自然光下的半身商业肖像。',
  },
  {
    title: '商品主图',
    provider: 'NANO_BANANA',
    category: 'Nano Banana',
    prompt: '将参考商品放置在干净的电商摄影棚中，保留真实材质，生成高清主图，背景简洁，光影柔和。',
  },
  {
    title: '创意海报',
    provider: 'NANO_BANANA',
    category: 'Nano Banana',
    prompt: '把参考对象改造成电影海报视觉，保留核心主体，增加戏剧化灯光、标题留白和高级排版空间。',
  },
  {
    title: '漫画分镜',
    provider: 'NANO_BANANA',
    category: 'Nano Banana',
    prompt: '将参考人物转成彩色漫画分镜风格，保持角色一致性，画面有清晰动作和故事张力。',
  },
  {
    title: '老照片修复',
    provider: 'NANO_BANANA',
    category: 'Nano Banana',
    prompt: '修复参考老照片，减少划痕和噪点，增强清晰度，保持年代质感，不改变人物身份。',
  },
  {
    title: 'GPT 写实产品图',
    provider: 'GPT',
    category: 'GPT',
    prompt: '生成一张写实产品摄影图，主体清晰，背景干净，适合官网首屏展示，保留自然阴影。',
  },
];
